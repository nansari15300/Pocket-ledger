const { app, BrowserWindow, BrowserView, Menu } = require("electron");
const path = require("path");
const http = require("http");
const handler = require("serve-handler");

let staticServer = null;
let staticServerPort = null;
const windowTabs = new Map();
const PRINT_MODE_ACTUAL = "actual";
const PRINT_MODE_FIT_WIDTH = "fit-width";
const PRINT_MODE_FIT_PAGE = "fit-page";

// Same asset as Next public/app-icon.png; copied into asar root via electron/package.json files.
function getIconPath() {
  if (app.isPackaged) {
    return path.join(__dirname, "app-icon.png");
  }
  return path.join(__dirname, "..", "public", "app-icon.png");
}

// Keep a single source of truth for dev/prod behavior.
function isDevMode() {
  return !app.isPackaged;
}

function isAllowedFirebaseProxyTarget(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    // Restrict proxy scope to Firebase/GCS hosts only (safer than open proxy).
    return (
      host.includes("firebasestorage.googleapis.com") ||
      host.includes("firebasestorage.app") ||
      host.includes("storage.googleapis.com")
    );
  } catch {
    return false;
  }
}

// Production Electron should serve static Next files over localhost instead of file://.
function startStaticServer() {
  if (staticServer && staticServerPort) {
    return Promise.resolve(staticServerPort);
  }

  // In packaged app, main.js is inside app.asar and exported site is bundled as out/**.
  const staticPublicDir = path.join(__dirname, "out");

  staticServer = http.createServer(async (request, response) => {
    // Local proxy for Firebase file downloads: avoids renderer CORS issues on localhost desktop app.
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      if (requestUrl.pathname === "/__firebase_blob_proxy") {
        const target = requestUrl.searchParams.get("url") || "";
        if (!isAllowedFirebaseProxyTarget(target)) {
          response.statusCode = 400;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end("Invalid target URL");
          return;
        }
        const upstream = await fetch(target, { method: "GET" });
        if (!upstream.ok) {
          response.statusCode = upstream.status;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end(`Upstream error: ${upstream.status}`);
          return;
        }
        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        response.statusCode = 200;
        response.setHeader("content-type", contentType);
        response.setHeader("cache-control", "private, max-age=60");
        const buffer = Buffer.from(await upstream.arrayBuffer());
        response.end(buffer);
        return;
      }
    } catch {
      // fall through to static handler for normal routes
    }
    // Keep asset files untouched; only clean route URLs like /company -> /company/index.html.
    return handler(request, response, {
      public: staticPublicDir,
      cleanUrls: true,
    });
  });

  return new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    // Use localhost origin so Firebase/Auth authorized-domain rules can match desktop flow.
    staticServer.listen(0, "localhost", () => {
      const addressInfo = staticServer.address();
      if (!addressInfo || typeof addressInfo === "string") {
        reject(new Error("Unable to resolve static server port."));
        return;
      }
      staticServerPort = addressInfo.port;
      resolve(staticServerPort);
    });
  });
}

function stopStaticServer() {
  if (!staticServer) return;
  staticServer.close();
  staticServer = null;
  staticServerPort = null;
}

function adjustZoom(targetContents, delta) {
  const currentZoom = targetContents.getZoomFactor();
  const nextZoom = Math.min(3, Math.max(0.25, currentZoom + delta));
  targetContents.setZoomFactor(nextZoom);
}

function getFocusedTabContents(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.activeIndex < 0) return null;
  return state.tabs[state.activeIndex]?.webContents ?? null;
}

function updateWindowTitle(win) {
  const state = windowTabs.get(win.id);
  const count = state?.tabs.length ?? 0;
  // Keep title explicit so users can tell tab count while using desktop multi-tab flow.
  win.setTitle(count > 1 ? `Pocket Ledger (${count} tabs)` : "Pocket Ledger");
}

function getWindowPrintMode(win) {
  const state = windowTabs.get(win.id);
  return state?.printMode ?? PRINT_MODE_FIT_PAGE;
}

function setWindowPrintMode(win, mode) {
  const state = windowTabs.get(win.id);
  if (!state) return;
  state.printMode = mode;
}

function getPrintScaleFactor(mode) {
  // Electron `print({ scaleFactor })` can be ignored by some OS dialogs; use temporary zoom for reliable effect.
  if (mode === PRINT_MODE_ACTUAL) return 1;
  if (mode === PRINT_MODE_FIT_WIDTH) return 0.9;
  return 0.8; // fit-page default keeps both width + height safer on most A4/Letter previews.
}

function updateActiveTabBounds(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.activeIndex < 0) return;
  const activeView = state.tabs[state.activeIndex];
  if (!activeView || win.isDestroyed()) return;
  // Use content size (not screen bounds) so BrowserView always fills client area in normal + maximized modes.
  const [contentWidth, contentHeight] = win.getContentSize();
  activeView.setBounds({ x: 0, y: 0, width: contentWidth, height: contentHeight });
  activeView.setAutoResize({ width: true, height: true });
}

function switchToTab(win, index) {
  const state = windowTabs.get(win.id);
  if (!state || state.tabs.length === 0) return;
  if (index < 0 || index >= state.tabs.length) return;
  state.activeIndex = index;
  win.setBrowserView(state.tabs[index]);
  updateActiveTabBounds(win);
  updateWindowTitle(win);
}

function closeCurrentTab(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.tabs.length === 0) {
    win.close();
    return;
  }
  const index = state.activeIndex;
  const [removed] = state.tabs.splice(index, 1);
  if (removed?.webContents && !removed.webContents.isDestroyed()) {
    removed.webContents.destroy();
  }
  if (state.tabs.length === 0) {
    win.close();
    return;
  }
  const nextIndex = Math.max(0, index - 1);
  switchToTab(win, nextIndex);
}

function nextTab(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.tabs.length <= 1) return;
  const nextIndex = (state.activeIndex + 1) % state.tabs.length;
  switchToTab(win, nextIndex);
}

function previousTab(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.tabs.length <= 1) return;
  const prevIndex = (state.activeIndex - 1 + state.tabs.length) % state.tabs.length;
  switchToTab(win, prevIndex);
}

async function getAppEntryUrl() {
  if (isDevMode()) return "http://localhost:3000";
  const port = await startStaticServer();
  // Packaged app route loading must be HTTP to avoid file:// local-resource blocking.
  return `http://localhost:${port}/`;
}

async function openNewTab(win) {
  const entryUrl = await getAppEntryUrl();
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Normalize zoom shortcuts for different keyboard layouts in each tab webContents.
  view.webContents.on("before-input-event", (event, input) => {
    if (!input.control) return;
    if (input.key === "-" || input.code === "Minus") {
      event.preventDefault();
      adjustZoom(view.webContents, -0.1);
      updateActiveTabBounds(win);
      return;
    }
    if (
      input.key === "+" ||
      input.key === "=" ||
      input.code === "Equal" ||
      input.code === "NumpadAdd"
    ) {
      event.preventDefault();
      adjustZoom(view.webContents, 0.1);
      updateActiveTabBounds(win);
      return;
    }
    if (input.key === "0" || input.code === "Digit0" || input.code === "Numpad0") {
      event.preventDefault();
      view.webContents.setZoomFactor(1);
      updateActiveTabBounds(win);
    }
  });

  const state = windowTabs.get(win.id);
  if (!state) return;
  state.tabs.push(view);
  switchToTab(win, state.tabs.length - 1);
  await view.webContents.loadURL(entryUrl);
}

function printCurrentTab(win) {
  const target = getFocusedTabContents(win);
  if (!target) return;
  const mode = getWindowPrintMode(win);
  const temporaryZoomFactor = getPrintScaleFactor(mode);
  const originalZoomFactor = target.getZoomFactor();
  // Apply selected print mode before opening native dialog, then restore zoom regardless of outcome.
  target.setZoomFactor(temporaryZoomFactor);
  target.print(
    {
      silent: false,
      printBackground: true,
    },
    () => {
      target.setZoomFactor(originalZoomFactor);
    }
  );
}

function buildAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Tab",
          accelerator: "CmdOrCtrl+T",
          click: async () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) await openNewTab(win);
          },
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+N",
          click: async () => {
            await createWindow();
          },
        },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) closeCurrentTab(win);
          },
        },
        { type: "separator" },
        {
          label: "Print",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) printCurrentTab(win);
          },
        },
        {
          label: "Print Scale",
          submenu: [
            {
              label: "Actual Size",
              type: "radio",
              checked: false,
              click: () => {
                const win = BrowserWindow.getFocusedWindow();
                if (win) setWindowPrintMode(win, PRINT_MODE_ACTUAL);
              },
            },
            {
              label: "Fit to Width",
              type: "radio",
              checked: false,
              click: () => {
                const win = BrowserWindow.getFocusedWindow();
                if (win) setWindowPrintMode(win, PRINT_MODE_FIT_WIDTH);
              },
            },
            {
              label: "Fit to Page",
              type: "radio",
              checked: true,
              click: () => {
                const win = BrowserWindow.getFocusedWindow();
                if (win) setWindowPrintMode(win, PRINT_MODE_FIT_PAGE);
              },
            },
          ],
        },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        {
          label: "Next Tab",
          accelerator: "CmdOrCtrl+Tab",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) nextTab(win);
          },
        },
        {
          label: "Previous Tab",
          accelerator: "CmdOrCtrl+Shift+Tab",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) previousTab(win);
          },
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    { role: "help", submenu: [] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: getIconPath(),
  });
  // Initialize per-window tab state; each window manages its own tab stack.
  windowTabs.set(win.id, { tabs: [], activeIndex: -1, printMode: PRINT_MODE_FIT_PAGE });
  // Sync BrowserView bounds across all desktop window state changes.
  win.on("resize", () => updateActiveTabBounds(win));
  win.on("maximize", () => updateActiveTabBounds(win));
  win.on("unmaximize", () => updateActiveTabBounds(win));
  win.on("enter-full-screen", () => updateActiveTabBounds(win));
  win.on("leave-full-screen", () => updateActiveTabBounds(win));
  win.on("show", () => updateActiveTabBounds(win));
  win.on("closed", () => {
    const state = windowTabs.get(win.id);
    if (state) {
      for (const tab of state.tabs) {
        if (!tab.webContents.isDestroyed()) tab.webContents.destroy();
      }
    }
    windowTabs.delete(win.id);
  });
  await openNewTab(win);
}

app.whenReady().then(async () => {
  buildAppMenu();
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

// Ensure temporary local server is closed on every quit path.
app.on("before-quit", () => {
  stopStaticServer();
});

app.on("window-all-closed", () => {
  stopStaticServer();
  if (process.platform !== "darwin") app.quit();
});

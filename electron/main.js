const {
  app,
  BrowserWindow,
  BrowserView,
  Menu,
  ipcMain,
  dialog,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
const handler = require("serve-handler");

/** Windows taskbar / Start menu grouping — `electron.app.*` default ID par Electron atom icon dikhta hai; `package.json` build.appId se match hona chahiye. */
const WINDOWS_APP_USER_MODEL_ID = "com.pocketledger.desktop";
if (process.platform === "win32") {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
}

// Do EXE instances = do `localhost` ports = Firebase Auth / IndexedDB alag origin ("login delete") — doosra instance band + pehla focus.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      const w = wins[0];
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

let staticServer = null;
let staticServerPort = null;
const windowTabs = new Map();
const PRINT_MODE_ACTUAL = "actual";
const PRINT_MODE_FIT_WIDTH = "fit-width";
const PRINT_MODE_FIT_PAGE = "fit-page";
/** Tab strip height (px) — merged title row (Win/Linux) ya classic macOS strip */
const TAB_STRIP_HEIGHT = 40;
/** Win/Linux: frameless window — "Pocket Ledger (N tabs)" + tabs + 10px + minimize/max/close ek hi row */
const USE_MERGED_TITLEBAR = process.platform === "win32" || process.platform === "linux";

// Same asset as Next public/app-icon.png; copied into asar root via electron/package.json files.
function getIconPath() {
  if (app.isPackaged) {
    return path.join(__dirname, "app-icon.png");
  }
  return path.join(__dirname, "..", "public", "app-icon.png");
}

/** BrowserWindow + Windows shell ke liye NativeImage — khali ho to path string fallback. */
function getWindowIcon() {
  try {
    const p = getIconPath();
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img;
  } catch (_) {}
  return getIconPath();
}

// Keep a single source of truth for dev/prod behavior.
function isDevMode() {
  return !app.isPackaged;
}

/** EXE: `localhost:PORT` = browser origin — port badle to IndexedDB + Firebase Auth "logout". Purani successful port persist karo. */
const PL_ELECTRON_STATIC_PORT_FILE = "pl-electron-static-port.json";

function readPersistedPackagedStaticPort() {
  if (!app.isPackaged) return null;
  try {
    const f = path.join(app.getPath("userData"), PL_ELECTRON_STATIC_PORT_FILE);
    const n = Number(JSON.parse(fs.readFileSync(f, "utf8")).port);
    if (Number.isFinite(n) && n > 0 && n < 65536) return n;
  } catch (_) {}
  return null;
}

function writePersistedPackagedStaticPort(port) {
  if (!app.isPackaged) return;
  try {
    const f = path.join(app.getPath("userData"), PL_ELECTRON_STATIC_PORT_FILE);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ port }), "utf8");
  } catch (_) {}
}

/** Pehle last-chalne-wala port, phir default 3000, phir kam-takraav fallbacks — `listen(0)` random kabhi mat (origin drift). */
function packagedStaticPortCandidates(preferred) {
  const persisted = readPersistedPackagedStaticPort();
  const fallbacks = [37123, 38123, 39123, 40123, 41123];
  const ordered = [...(persisted != null ? [persisted] : []), preferred, ...fallbacks];
  const seen = new Set();
  const out = [];
  for (const n of ordered) {
    if (typeof n === "number" && n > 0 && n < 65536 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
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

/**
 * Static `out/`: sirf `reconciliation/index.html` + `?shareId=` — `/reconciliation/{id}/` 404 par root → dashboard.
 * Document requests ko query page shell par map karo (assets/_next chhod kar).
 */
function rewriteReconciliationDocumentUrl(requestUrl) {
  const pathname = (requestUrl.pathname || "/").replace(/\/+$/, "") || "/";
  if (pathname.includes("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) {
    return null;
  }
  if (pathname === "/reconciliation") {
    return `/reconciliation/index.html${requestUrl.search || ""}`;
  }
  const legacy = pathname.match(/^\/reconciliation\/([^/]+)$/);
  if (legacy && legacy[1] !== "__placeholder__") {
    return `/reconciliation/index.html${requestUrl.search || ""}`;
  }
  return null;
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
    // Reconciling deep link — galat HTML (root) load hone se login → dashboard redirect
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const rewritten = rewriteReconciliationDocumentUrl(requestUrl);
      if (rewritten) {
        request = Object.assign({}, request, { url: rewritten });
      }
    } catch {
      /* fall through */
    }
    // Keep asset files untouched; only clean route URLs like /company -> /company/index.html.
    return handler(request, response, {
      public: staticPublicDir,
      cleanUrls: true,
      headers: [
        {
          source: "**/*.mjs",
          headers: [
            {
              key: "Content-Type",
              value: "text/javascript; charset=utf-8",
            },
          ],
        },
      ],
    });
  });

  // Packaged: port stable rakho — random `listen(0)` = naya origin = auth "delete". Multi-try + `userData` persist.
  const parsedPreferred = Number.parseInt(process.env.PL_ELECTRON_STATIC_PORT || "3000", 10);
  const preferred =
    Number.isFinite(parsedPreferred) && parsedPreferred > 0 && parsedPreferred < 65536
      ? parsedPreferred
      : 3000;

  return new Promise((resolve, reject) => {
    const finish = () => {
      staticServer.removeAllListeners("error");
      const addressInfo = staticServer.address();
      if (!addressInfo || typeof addressInfo === "string") {
        reject(new Error("Unable to resolve static server port."));
        return;
      }
      staticServerPort = addressInfo.port;
      writePersistedPackagedStaticPort(staticServerPort);
      resolve(staticServerPort);
    };

    const candidates = packagedStaticPortCandidates(preferred);
    let candidateIndex = 0;

    const tryNextCandidate = () => {
      if (candidateIndex >= candidates.length) {
        dialog.showErrorBox(
          "Pocket Ledger",
          "Local server ports are all busy (tried 3000 and fallbacks).\n\n" +
            "Close other apps using those ports, then reopen.\n" +
            "Your sign-in stays on the same port — changing ports looks like a logout."
        );
        reject(new Error("PL_PACKAGED_STATIC_PORT_EXHAUSTED"));
        return;
      }
      const port = candidates[candidateIndex++];
      staticServer.removeAllListeners("error");
      staticServer.once("error", (err) => {
        if (err && err.code === "EADDRINUSE") {
          tryNextCandidate();
          return;
        }
        reject(err);
      });
      staticServer.listen(port, "localhost", finish);
    };

    tryNextCandidate();
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

/** View → DevTools: native `toggleDevTools` role **BrowserWindow** ke khali host par lagta tha — active **BrowserView** tab par kholna zaroori. */
function toggleDevToolsForActiveTab(win) {
  const wc = getFocusedTabContents(win);
  if (!wc || wc.isDestroyed()) return;
  try {
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: "detach" });
  } catch (_) {}
}

/** BrowserView tab reload — native `{ role: "reload" }` galat webContents (khali window) par lagta tha */
function reloadActiveTab(win, ignoreCache) {
  const wc = getFocusedTabContents(win);
  if (!wc || wc.isDestroyed()) return;
  if (ignoreCache) wc.reloadIgnoringCache();
  else wc.reload();
}

/** View menu / IPC: quick-actions ribbon localStorage toggle — renderer `pl-desktop-quick-actions-toggle` sunta hai */
function toggleQuickActionsRibbonInActiveTab(win) {
  const wc = getFocusedTabContents(win);
  if (!wc || wc.isDestroyed()) return;
  const script = `(function(){try{var k='pl-desktop-header-quick-actions-collapsed';if(localStorage.getItem(k)==='1')localStorage.removeItem(k);else localStorage.setItem(k,'1');window.dispatchEvent(new Event('pl-desktop-quick-actions-toggle'));}catch(e){}})();`;
  wc.executeJavaScript(script, true).catch(() => {});
}

/** Tab strip ↻ → active BrowserView: full reload nahi, sirf CustomEvent (React `triggerSync`) */
function dispatchTabStripBackgroundSyncToActiveTab(win) {
  const wc = getFocusedTabContents(win);
  if (!wc || wc.isDestroyed()) return Promise.reject(new Error("no-active-tab"));
  const script = `(function(){try{window.dispatchEvent(new CustomEvent('pocket-ledger-tab-strip-sync'));}catch(e){}})();true`;
  return wc.executeJavaScript(script, true);
}

function notifyTabStripSyncDone(win) {
  const state = windowTabs.get(win.id);
  if (!state?.stripView?.webContents || state.stripView.webContents.isDestroyed()) return;
  try {
    state.stripView.webContents.send("pl-tab-strip-sync-done-ack");
  } catch (_) {}
}

function updateWindowTitle(win) {
  const state = windowTabs.get(win.id);
  const count = state?.tabs.length ?? 0;
  // Merged title bar: OS caption short — tab-strip me sirf draggable strip tooltip (`titleBarLabel` IPC) rakho.
  if (USE_MERGED_TITLEBAR) {
    win.setTitle("Pocket Ledger");
  } else {
    win.setTitle(count > 1 ? `Pocket Ledger (${count} tabs)` : "Pocket Ledger");
  }
}

/** Strip me maximize icon □ / ❐ sync — frameless Win/Linux */
function sendWindowMaxState(win) {
  const state = windowTabs.get(win.id);
  if (!state?.stripView?.webContents || state.stripView.webContents.isDestroyed()) return;
  try {
    state.stripView.webContents.send("window-max-state", { maximized: win.isMaximized() });
  } catch (_) {}
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

/**
 * Electron multi-tab: jo BrowserView baad me `addBrowserView` hota hai wo upar paint hota hai.
 * Tab content ko switch pe baad me add karte hain — strip neeche chala jata hai / dikhta hi nahi.
 * Bounds ke baad strip ko dubara add karke hamesha top par lao taaki alag tab strip dikhe.
 */
function raiseTabStripToTop(win) {
  const state = windowTabs.get(win.id);
  if (!state?.stripView || state.stripView.webContents.isDestroyed()) return;
  try {
    win.removeBrowserView(state.stripView);
    win.addBrowserView(state.stripView);
  } catch (_) {}
}

/** Strip + active tab content dono ka bounds — tab strip upar, app neeche */
function updateBrowserViewBounds(win) {
  const state = windowTabs.get(win.id);
  if (!state || win.isDestroyed()) return;
  const [contentWidth, contentHeight] = win.getContentSize();
  const sh = TAB_STRIP_HEIGHT;
  if (state.stripView && !state.stripView.webContents.isDestroyed()) {
    state.stripView.setBounds({ x: 0, y: 0, width: contentWidth, height: sh });
  }
  if (state.activeIndex >= 0 && state.tabs[state.activeIndex]) {
    const activeView = state.tabs[state.activeIndex];
    if (!activeView.webContents.isDestroyed()) {
      const innerH = Math.max(0, contentHeight - sh);
      activeView.setBounds({ x: 0, y: sh, width: contentWidth, height: innerH });
    }
  }
  raiseTabStripToTop(win);
}

/** IPC sender → BrowserWindow (strip = BrowserView webContents; direct `fromWebContents` aksar null). */
function windowFromStripSender(sender) {
  let w = BrowserWindow.fromWebContents(sender);
  if (w) return w;
  try {
    const sid = sender?.id;
    if (sid == null) return null;
    for (const cand of BrowserWindow.getAllWindows()) {
      const state = windowTabs.get(cand.id);
      if (state?.stripView?.webContents?.id === sid) return cand;
    }
  } catch (_) {}
  return null;
}

/** + tab / switch: kabhi strip IPC window resolve na kare (focus page par hai) — focused ya single window fallback */
function resolveWindowForTabStripIpc(sender) {
  const direct = windowFromStripSender(sender);
  if (direct && !direct.isDestroyed()) return direct;
  const fw = BrowserWindow.getFocusedWindow();
  if (fw && !fw.isDestroyed()) return fw;
  const all = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed());
  if (all.length === 1) return all[0];
  return null;
}

/** Tab titles / active state + tooltip string (merged strip `#dragFill` title + optional future use) → strip UI */
function pushTabStripState(win) {
  const state = windowTabs.get(win.id);
  if (!state?.stripView?.webContents || state.stripView.webContents.isDestroyed()) return;
  const tabs = state.tabs.map((view, index) => ({
    title: view.webContents.getTitle() || `Tab ${index + 1}`,
    index,
    active: index === state.activeIndex,
  }));
  const n = tabs.length;
  const titleBarLabel = n > 1 ? `Pocket Ledger (${n} tabs)` : "Pocket Ledger";
  try {
    state.stripView.webContents.send("tabs-update", { tabs, titleBarLabel });
  } catch (_) {}
}

async function createTabStrip(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.stripView) return;
  const stripView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "tab-strip-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  state.stripView = stripView;
  await stripView.webContents.loadFile(path.join(__dirname, "tab-strip.html"));
  win.addBrowserView(stripView);
  stripView.webContents.on("did-finish-load", () => pushTabStripState(win));
}

function switchToTab(win, index) {
  const state = windowTabs.get(win.id);
  if (!state || state.tabs.length === 0) return;
  if (index < 0 || index >= state.tabs.length) return;

  const prevIndex = state.activeIndex;
  const prev = prevIndex >= 0 ? state.tabs[prevIndex] : null;
  state.activeIndex = index;
  const next = state.tabs[index];

  if (prev && prev !== next) {
    try {
      win.removeBrowserView(prev);
    } catch (_) {}
  }
  try {
    win.addBrowserView(next);
  } catch (_) {}

  updateBrowserViewBounds(win);
  updateWindowTitle(win);
  pushTabStripState(win);
}

/** Kisi bhi index ki tab band — Chrome jaisa active / neighbour logic */
function closeTabAt(win, closeIndex) {
  const state = windowTabs.get(win.id);
  if (!state || closeIndex < 0 || closeIndex >= state.tabs.length) return;

  const oldActive = state.activeIndex;
  const removed = state.tabs[closeIndex];
  try {
    win.removeBrowserView(removed);
  } catch (_) {}
  if (removed?.webContents && !removed.webContents.isDestroyed()) {
    removed.webContents.destroy();
  }
  state.tabs.splice(closeIndex, 1);

  if (state.tabs.length === 0) {
    win.close();
    return;
  }

  let nextIndex;
  if (oldActive === closeIndex) {
    nextIndex = Math.min(closeIndex, state.tabs.length - 1);
  } else if (closeIndex < oldActive) {
    nextIndex = oldActive - 1;
  } else {
    nextIndex = oldActive;
  }
  switchToTab(win, nextIndex);
}

function closeCurrentTab(win) {
  const state = windowTabs.get(win.id);
  if (!state || state.tabs.length === 0) {
    win.close();
    return;
  }
  closeTabAt(win, state.activeIndex);
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
  // Dev Next (`npm run dev`) port 5000 — packaged EXE static server 3000 par alag rehta hai.
  if (isDevMode()) return "http://localhost:5000";
  const port = await startStaticServer();
  // Packaged app route loading must be HTTP to avoid file:// local-resource blocking.
  return `http://localhost:${port}/`;
}

async function openNewTab(win) {
  const entryUrl = await getAppEntryUrl();
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "app-content-preload.js"),
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
      updateBrowserViewBounds(win);
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
      updateBrowserViewBounds(win);
      return;
    }
    if (input.key === "0" || input.code === "Digit0" || input.code === "Numpad0") {
      event.preventDefault();
      view.webContents.setZoomFactor(1);
      updateBrowserViewBounds(win);
    }
  });

  view.webContents.on("page-title-updated", () => pushTabStripState(win));
  view.webContents.on("did-finish-load", () => pushTabStripState(win));

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
    // Menubar par "Refresh" hamesha dikhe — active BrowserView par reload (multi-tab); Ctrl+R yahi se
    {
      label: "Refresh",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: (_item, focusedWindow) => {
            const win = focusedWindow ?? BrowserWindow.getFocusedWindow();
            if (win) reloadActiveTab(win, false);
          },
        },
        {
          label: "Force Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          click: (_item, focusedWindow) => {
            const win = focusedWindow ?? BrowserWindow.getFocusedWindow();
            if (win) reloadActiveTab(win, true);
          },
        },
      ],
    },
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
        {
          label: "Toggle quick actions ribbon",
          accelerator: "CmdOrCtrl+Shift+H",
          click: (_item, focusedWindow) => {
            const win = focusedWindow ?? BrowserWindow.getFocusedWindow();
            if (win) toggleQuickActionsRibbonInActiveTab(win);
          },
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "CmdOrCtrl+Shift+I",
          click: (_item, focusedWindow) => {
            const win = focusedWindow ?? BrowserWindow.getFocusedWindow();
            if (win) toggleDevToolsForActiveTab(win);
          },
        },
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
    {
      label: "Window",
      submenu: [
        {
          label: "Next Tab",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) nextTab(win);
          },
        },
        {
          label: "Previous Tab",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) previousTab(win);
          },
        },
        { type: "separator" },
        { role: "minimize" },
        { role: "close" },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Multi-tab shortcuts…",
          click: async () => {
            const win = BrowserWindow.getFocusedWindow();
            await dialog.showMessageBox(win ?? undefined, {
              type: "info",
              title: "Pocket Ledger — Tabs",
              message: USE_MERGED_TITLEBAR
                ? "Title + tabs ek hi upari row me hain (☰ = menu, Alt bhi). Window buttons dahine."
                : "Dark tab strip menu bar ke turant neeche.",
              detail:
                "Ctrl+T — New tab\nCtrl+W — Close tab\nCtrl+Tab — Next tab\nCtrl+Shift+Tab — Previous tab\n\n" +
                (USE_MERGED_TITLEBAR ? "Alt — menu bar dikhao/j chhupao.\n\n" : "") +
                "File → New Tab / View → Next Tab.",
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: getWindowIcon(),
    frame: !USE_MERGED_TITLEBAR,
    autoHideMenuBar: USE_MERGED_TITLEBAR,
  });
  // Initialize per-window tab state; each window manages its own tab stack (+ stripView baad me).
  windowTabs.set(win.id, { tabs: [], activeIndex: -1, printMode: PRINT_MODE_FIT_PAGE, stripView: null });
  // Sync BrowserView bounds across all desktop window state changes.
  win.on("resize", () => updateBrowserViewBounds(win));
  win.on("maximize", () => {
    updateBrowserViewBounds(win);
    sendWindowMaxState(win);
  });
  win.on("unmaximize", () => {
    updateBrowserViewBounds(win);
    sendWindowMaxState(win);
  });
  win.on("enter-full-screen", () => updateBrowserViewBounds(win));
  win.on("leave-full-screen", () => updateBrowserViewBounds(win));
  win.on("show", () => updateBrowserViewBounds(win));
  win.on("closed", () => {
    const state = windowTabs.get(win.id);
    if (state) {
      if (state.stripView?.webContents && !state.stripView.webContents.isDestroyed()) {
        state.stripView.webContents.destroy();
      }
      for (const tab of state.tabs) {
        if (!tab.webContents.isDestroyed()) tab.webContents.destroy();
      }
    }
    windowTabs.delete(win.id);
  });
  await createTabStrip(win);
  await openNewTab(win);
  sendWindowMaxState(win);
}

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
  ipcMain.handle("window-chrome-action", async (event, action) => {
    const win =
      resolveWindowForTabStripIpc(event.sender) || BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: "no-window" };
    try {
      if (action === "minimize") win.minimize();
      else if (action === "maximize-toggle") {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        sendWindowMaxState(win);
      } else if (action === "close") win.close();
      else return { ok: false, error: "bad-action" };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle("show-app-menu", async (event) => {
    const win =
      resolveWindowForTabStripIpc(event.sender) || BrowserWindow.fromWebContents(event.sender);
    const menu = Menu.getApplicationMenu();
    if (!menu || !win || win.isDestroyed()) return { ok: false };
    try {
      menu.popup({ window: win });
      return { ok: true };
    } catch (_) {
      return { ok: false };
    }
  });

  ipcMain.handle("tab-strip-action", async (event, msg) => {
    const win = resolveWindowForTabStripIpc(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: "no-window" };
    try {
      if (msg?.action === "switch" && typeof msg.index === "number") {
        switchToTab(win, msg.index);
        return { ok: true };
      }
      if (msg?.action === "new") {
        await openNewTab(win);
        return { ok: true };
      }
      if (msg?.action === "close" && typeof msg.index === "number") {
        closeTabAt(win, msg.index);
        return { ok: true };
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    return { ok: false, error: "bad-action" };
  });

  /** Tab strip ↻ — active tab pe CustomEvent; React `triggerSync`; khali login par preload ack nahi bhejta */
  ipcMain.handle("pl-request-background-sync", async (event) => {
    const win = resolveWindowForTabStripIpc(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: "no-window" };
    try {
      await dispatchTabStripBackgroundSyncToActiveTab(win);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  /**
   * Sync device list / Firestore `deviceLabel`: WebView UA sirf "Chrome (Windows)" deta hai —
   * APK jaisa PC naam + OS string (hostname + platform release) main se.
   */
  ipcMain.handle("pl-device-display-info", async () => {
    try {
      const hostname = String(os.hostname() || "").trim() || "PC";
      const platform = os.platform();
      const release = String(os.release() || "").trim();
      let osHuman = platform;
      if (platform === "win32") osHuman = "Windows";
      else if (platform === "darwin") osHuman = "macOS";
      else if (platform === "linux") osHuman = "Linux";
      const part = release ? `${osHuman} ${release}` : osHuman;
      return `${hostname} (${part})`.replace(/\s+/g, " ").trim();
    } catch (_) {
      return "";
    }
  });

  ipcMain.on("pl-tab-strip-sync-done-from-app", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    notifyTabStripSyncDone(win);
  });

  buildAppMenu();
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
  });
}

// Ensure temporary local server is closed on every quit path.
app.on("before-quit", () => {
  stopStaticServer();
});

app.on("window-all-closed", () => {
  stopStaticServer();
  if (process.platform !== "darwin") app.quit();
});

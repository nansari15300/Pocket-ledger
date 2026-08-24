/**
 * EXE tab white-screen recovery: keep last good frame visible while renderer reloads in background.
 */
const { BrowserView } = require("electron");
const plTraceLog = require("./plTraceLog");

const CAPTURE_DEBOUNCE_MS = 2_500;
const CAPTURE_INTERVAL_MS = 90_000;
const IDLE_BLANK_CHECK_MS = 180_000;
const RECOVER_AFTER_UNRESPONSIVE_MS = 4_000;
const HIDE_OVERLAY_DELAY_MS = 400;

/** @type {WeakMap<Electron.BrowserWindow, object>} */
const windowRecovery = new WeakMap();

/** @type {WeakMap<Electron.WebContents, object>} */
const tabRecovery = new WeakMap();

function tabStripHeight(state) {
  return typeof state?.tabStripHeight === "number" ? state.tabStripHeight : 40;
}

function contentBounds(win, state) {
  const [contentWidth, contentHeight] = win.getContentSize();
  const sh = tabStripHeight(state);
  return {
    x: 0,
    y: sh,
    width: contentWidth,
    height: Math.max(0, contentHeight - sh),
  };
}

function snapshotHtml(dataUrl) {
  const src = String(dataUrl || "").replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#f6f9fc;overflow:hidden}
img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
</style></head><body><img alt="" src="${src}"/></body></html>`;
}

function getWinRecovery(win) {
  if (!win || win.isDestroyed()) return null;
  let rec = windowRecovery.get(win);
  if (!rec) {
    rec = {
      overlay: null,
      overlayVisible: false,
      intervalId: null,
      idleCheckId: null,
      getState: null,
      tabStripHeight: 40,
    };
    windowRecovery.set(win, rec);
  }
  return rec;
}

async function captureTabSnapshot(view) {
  if (!view?.webContents || view.webContents.isDestroyed()) return null;
  const wc = view.webContents;
  if (wc.isLoading()) return null;
  const info = String(wc.getURL() || "");
  if (!info || info === "about:blank" || info.startsWith("devtools://")) return null;
  try {
    const image = await wc.capturePage();
    if (!image || image.isEmpty()) return null;
    const dataUrl = image.toDataURL();
    const meta = tabRecovery.get(wc) || {};
    meta.snapshot = dataUrl;
    meta.capturedAt = Date.now();
    tabRecovery.set(wc, meta);
    return dataUrl;
  } catch (e) {
    plTraceLog.traceLog("PL-TAB-RECOVER", "capture_failed", {
      error: e?.message || String(e || "unknown"),
    });
    return null;
  }
}

function scheduleCapture(view, reason) {
  const wc = view?.webContents;
  if (!wc || wc.isDestroyed()) return;
  const meta = tabRecovery.get(wc) || {};
  if (meta.captureTimer) return;
  meta.captureTimer = setTimeout(() => {
    meta.captureTimer = null;
    tabRecovery.set(wc, meta);
    void captureTabSnapshot(view).then((url) => {
      if (url) {
        plTraceLog.traceLog("PL-TAB-RECOVER", "captured", { reason: reason || "debounced" });
      }
    });
  }, CAPTURE_DEBOUNCE_MS);
  tabRecovery.set(wc, meta);
}

async function isTabLikelyBlank(view) {
  if (!view?.webContents || view.webContents.isDestroyed()) return true;
  const wc = view.webContents;
  if (wc.isLoading()) return false;
  try {
    const url = String(wc.getURL() || "");
    if (!url || url === "about:blank") return true;
    return await wc.executeJavaScript(
      `(function(){
        try {
          var b = document.body;
          if (!b) return true;
          var h = b.getBoundingClientRect().height;
          if (h < 40) return true;
          var root = document.getElementById('__next') || document.querySelector('main') || b.firstElementChild;
          if (!root) return true;
          var rh = root.getBoundingClientRect().height;
          if (rh < 60) return true;
          var txt = (root.innerText || '').replace(/\\s+/g, ' ').trim();
          return txt.length < 8;
        } catch (e) { return true; }
      })()`,
      true
    );
  } catch (_) {
    return true;
  }
}

async function ensureOverlay(win, rec) {
  if (rec.overlay && !rec.overlay.webContents.isDestroyed()) return rec.overlay;
  const overlay = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  rec.overlay = overlay;
  windowRecovery.set(win, rec);
  return overlay;
}

async function showSnapshotOverlay(win, view, reason) {
  const rec = getWinRecovery(win);
  if (!rec) return;
  const wc = view?.webContents;
  const meta = wc ? tabRecovery.get(wc) : null;
  const dataUrl = meta?.snapshot;
  if (!dataUrl) {
    plTraceLog.traceLog("PL-TAB-RECOVER", "overlay_skip_no_snapshot", { reason });
    return;
  }
  const overlay = await ensureOverlay(win, rec);
  const state = rec.getState?.();
  const bounds = contentBounds(win, { tabStripHeight: tabStripHeight(state) });
  try {
    win.addBrowserView(overlay);
  } catch (_) {}
  overlay.setBounds(bounds);
  rec.overlayVisible = true;
  try {
    await overlay.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(snapshotHtml(dataUrl))}`
    );
  } catch (e) {
    plTraceLog.traceLog("PL-TAB-RECOVER", "overlay_load_failed", {
      reason,
      error: e?.message || String(e || "unknown"),
    });
    return;
  }
  if (typeof rec.raiseTabStrip === "function") rec.raiseTabStrip(win);
  plTraceLog.traceLog("PL-TAB-RECOVER", "overlay_shown", { reason });
  ensureOverlayZOrder(win);
}

function ensureOverlayZOrder(win) {
  const rec = getWinRecovery(win);
  if (!rec?.overlayVisible || !rec.overlay || rec.overlay.webContents.isDestroyed()) return;
  const state = rec.getState?.();
  if (!state || state.activeIndex < 0) return;
  const active = state.tabs[state.activeIndex];
  try {
    if (active && !active.webContents.isDestroyed()) {
      win.removeBrowserView(active);
      win.addBrowserView(active);
    }
    win.removeBrowserView(rec.overlay);
    win.addBrowserView(rec.overlay);
  } catch (_) {}
  if (typeof rec.raiseTabStrip === "function") rec.raiseTabStrip(win);
}

function hideSnapshotOverlay(win, reason) {
  const rec = getWinRecovery(win);
  if (!rec?.overlay || !rec.overlayVisible) return;
  try {
    win.removeBrowserView(rec.overlay);
  } catch (_) {}
  rec.overlayVisible = false;
  plTraceLog.traceLog("PL-TAB-RECOVER", "overlay_hidden", { reason: reason || "unknown" });
}

async function recoverTabContent(win, view, reason) {
  if (!view?.webContents) return;
  const wc = view.webContents;
  const meta = tabRecovery.get(wc) || {};
  if (meta.recovering) return;
  meta.recovering = true;
  tabRecovery.set(wc, meta);

  plTraceLog.traceLog("PL-TAB-RECOVER", "recover_start", { reason });

  await showSnapshotOverlay(win, view, reason);

  const finish = async (ok, finishReason) => {
    meta.recovering = false;
    tabRecovery.set(wc, meta);
    if (ok) {
      setTimeout(() => {
        hideSnapshotOverlay(win, finishReason);
        void captureTabSnapshot(view);
      }, HIDE_OVERLAY_DELAY_MS);
      plTraceLog.traceLog("PL-TAB-RECOVER", "recover_ok", { reason: finishReason });
    } else {
      plTraceLog.traceLog("PL-TAB-RECOVER", "recover_failed", { reason: finishReason });
    }
  };

  const onLoad = async () => {
    wc.removeListener("did-finish-load", onLoad);
    const blank = await isTabLikelyBlank(view);
    await finish(!blank, blank ? "still_blank_after_reload" : "did_finish_load");
  };

  try {
    if (wc.isDestroyed()) {
      await finish(false, "webcontents_destroyed");
      return;
    }
    wc.once("did-finish-load", onLoad);
    wc.reload();
  } catch (e) {
    wc.removeListener("did-finish-load", onLoad);
    plTraceLog.traceLog("PL-TAB-RECOVER", "reload_error", {
      error: e?.message || String(e || "unknown"),
    });
    await finish(false, "reload_error");
  }
}

async function checkActiveTabHealth(win) {
  const rec = getWinRecovery(win);
  if (!rec?.getState) return;
  const state = rec.getState();
  if (!state || state.activeIndex < 0 || !state.tabs[state.activeIndex]) return;
  const view = state.tabs[state.activeIndex];
  const blank = await isTabLikelyBlank(view);
  if (blank) {
    void recoverTabContent(win, view, "idle_blank_check");
  }
}

function attachTabSnapshotRecovery(win, view, options = {}) {
  if (!appIsPackaged(options)) return;
  const wc = view.webContents;

  const onFinishLoad = () => scheduleCapture(view, "did-finish-load");
  wc.on("did-finish-load", onFinishLoad);
  wc.on("did-navigate-in-page", onFinishLoad);

  wc.on("render-process-gone", (_event, details) => {
    plTraceLog.traceLog("PL-TAB-RECOVER", "render_process_gone", {
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
    void recoverTabContent(win, view, "render_process_gone");
  });

  let unresponsiveTimer = null;
  wc.on("unresponsive", () => {
    plTraceLog.traceLog("PL-TAB-RECOVER", "unresponsive", {});
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null;
      void recoverTabContent(win, view, "unresponsive");
    }, RECOVER_AFTER_UNRESPONSIVE_MS);
  });
  wc.on("responsive", () => {
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer);
      unresponsiveTimer = null;
    }
  });

  wc.on("did-fail-load", (_event, errorCode, _desc, validatedURL) => {
    if (errorCode === -3) return; // aborted
    plTraceLog.traceLog("PL-TAB-RECOVER", "did_fail_load", { errorCode, validatedURL });
    void recoverTabContent(win, view, "did_fail_load");
  });

  scheduleCapture(view, "attach");
}

function appIsPackaged(options) {
  if (typeof options.isPackaged === "boolean") return options.isPackaged;
  try {
    const { app } = require("electron");
    return app.isPackaged;
  } catch (_) {
    return false;
  }
}

function initWindowSnapshotRecovery(win, options = {}) {
  if (!appIsPackaged(options)) return;
  const rec = getWinRecovery(win);
  rec.getState = options.getState;
  rec.raiseTabStrip = options.raiseTabStrip;
  rec.tabStripHeight = options.tabStripHeight || 40;

  if (rec.intervalId) clearInterval(rec.intervalId);
  rec.intervalId = setInterval(() => {
    if (win.isDestroyed()) return;
    const state = rec.getState?.();
    if (!state || state.activeIndex < 0) return;
    const view = state.tabs[state.activeIndex];
    if (view) scheduleCapture(view, "interval");
  }, CAPTURE_INTERVAL_MS);

  if (rec.idleCheckId) clearInterval(rec.idleCheckId);
  rec.idleCheckId = setInterval(() => {
    if (win.isDestroyed()) return;
    void checkActiveTabHealth(win);
  }, IDLE_BLANK_CHECK_MS);
}

function updateSnapshotOverlayBounds(win, state) {
  const rec = getWinRecovery(win);
  if (!rec?.overlayVisible || !rec.overlay || rec.overlay.webContents.isDestroyed()) return;
  rec.overlay.setBounds(contentBounds(win, state));
  ensureOverlayZOrder(win);
}

function hideOnTabSwitch(win) {
  hideSnapshotOverlay(win, "tab_switch");
}

function onWindowForeground(win, reason) {
  if (!win || win.isDestroyed()) return;
  const rec = getWinRecovery(win);
  if (!rec?.getState) return;
  const state = rec.getState();
  if (!state || state.activeIndex < 0) return;
  const view = state.tabs[state.activeIndex];
  if (view) scheduleCapture(view, reason || "foreground");
  setTimeout(() => {
    void checkActiveTabHealth(win);
  }, 600);
}

function disposeWindowSnapshotRecovery(win) {
  const rec = windowRecovery.get(win);
  if (!rec) return;
  if (rec.intervalId) clearInterval(rec.intervalId);
  if (rec.idleCheckId) clearInterval(rec.idleCheckId);
  hideSnapshotOverlay(win, "window_closed");
  if (rec.overlay && !rec.overlay.webContents.isDestroyed()) {
    try {
      rec.overlay.webContents.destroy();
    } catch (_) {}
  }
  windowRecovery.delete(win);
}

module.exports = {
  attachTabSnapshotRecovery,
  initWindowSnapshotRecovery,
  updateSnapshotOverlayBounds,
  onWindowForeground,
  disposeWindowSnapshotRecovery,
  hideOnTabSwitch,
  captureTabSnapshot,
};

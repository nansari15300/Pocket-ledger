const { contextBridge, ipcRenderer } = require("electron");

/**
 * Tab strip (BrowserView) ↔ main process: switch / new / close + receive tab list updates.
 * Win/Linux: merged title bar — `plElectronChrome` window controls + maximize state.
 */
contextBridge.exposeInMainWorld("electronTabStrip", {
  switchTab: (index) => ipcRenderer.invoke("tab-strip-action", { action: "switch", index }),
  newTab: () => ipcRenderer.invoke("tab-strip-action", { action: "new" }),
  closeTab: (index) => ipcRenderer.invoke("tab-strip-action", { action: "close", index }),
  /** Active tab me background sync (full reload nahi) — khatam par strip par green ✓ */
  requestBackgroundSync: () => ipcRenderer.invoke("pl-request-background-sync"),
  onBackgroundSyncDone: (callback) => {
    const fn = () => callback();
    ipcRenderer.on("pl-tab-strip-sync-done-ack", fn);
    return () => ipcRenderer.removeListener("pl-tab-strip-sync-done-ack", fn);
  },
  onTabsUpdate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("tabs-update", handler);
    return () => ipcRenderer.removeListener("tabs-update", handler);
  },
});

/** Frameless merged chrome (Windows/Linux); macOS framed — sirf tabs + new */
contextBridge.exposeInMainWorld("plElectronChrome", {
  mergedTitleBar: process.platform === "win32" || process.platform === "linux",
  minimize: () => ipcRenderer.invoke("window-chrome-action", "minimize"),
  maximizeToggle: () => ipcRenderer.invoke("window-chrome-action", "maximize-toggle"),
  close: () => ipcRenderer.invoke("window-chrome-action", "close"),
  showAppMenu: () => ipcRenderer.invoke("show-app-menu"),
  onMaximizedChange: (callback) => {
    const handler = (_event, payload) => callback(payload || {});
    ipcRenderer.on("window-max-state", handler);
    return () => ipcRenderer.removeListener("window-max-state", handler);
  },
});

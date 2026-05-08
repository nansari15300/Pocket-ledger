const { contextBridge, ipcRenderer } = require("electron");

/**
 * Next tab BrowserView — tab strip se “background sync” ke baad strip ko green ✓ dikhane ke liye IPC.
 * `main.js` `pl-tab-strip-sync-done-ack` strip ko forward karta hai.
 */
contextBridge.exposeInMainWorld("plElectronTabBridge", {
  notifyTabStripBackgroundSyncDone: () => {
    try {
      ipcRenderer.send("pl-tab-strip-sync-done-from-app");
    } catch (_) {}
  },
});

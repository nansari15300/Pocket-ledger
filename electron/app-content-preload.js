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

/** Multi-device / Firestore label: renderer `os.hostname` nahi padh sakta — main IPC se string. */
contextBridge.exposeInMainWorld("plElectronDevice", {
  getDisplayLabel: () => ipcRenderer.invoke("pl-device-display-info"),
});

/** Backup location: poora local path (D:\…) + direct file write — web DirectoryHandle path expose nahi karta. */
contextBridge.exposeInMainWorld("plElectronBackup", {
  pickDirectory: () => ipcRenderer.invoke("pl-pick-backup-directory"),
  writeBackupFile: (args) => ipcRenderer.invoke("pl-write-backup-file", args),
  listBackupFiles: (dirPath) => ipcRenderer.invoke("pl-list-backup-files", dirPath),
  readBackupFile: (args) => ipcRenderer.invoke("pl-read-backup-file", args),
});

/** EXE / Linux desktop: local static server — settings → Server */
contextBridge.exposeInMainWorld("plElectronLocalServer", {
  getStatus: () => ipcRenderer.invoke("pl-local-server-get-status"),
  getConfig: () => ipcRenderer.invoke("pl-local-server-get-config"),
  setConfig: (partial) => ipcRenderer.invoke("pl-local-server-set-config", partial),
  start: () => ipcRenderer.invoke("pl-local-server-start"),
  stop: () => ipcRenderer.invoke("pl-local-server-stop"),
  restart: (partial) => ipcRenderer.invoke("pl-local-server-restart", partial),
  listAccessTokens: () => ipcRenderer.invoke("pl-local-server-list-access-tokens"),
  createAccessToken: (input) => ipcRenderer.invoke("pl-local-server-create-access-token", input),
  revokeAccessToken: (id) => ipcRenderer.invoke("pl-local-server-revoke-access-token", id),
});

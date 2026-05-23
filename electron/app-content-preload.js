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

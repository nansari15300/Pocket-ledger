/** `electron/main.js` sab BrowserView tabs par dispatch karta hai — background se wapas aane par listeners + sync. */
export const ELECTRON_FOREGROUND_RESUME_EVENT = "pocket-ledger-electron-resume";

/** EXE: minimize/background ke baad kitni der idle rehne par full resume sync chale. */
export const ELECTRON_FOREGROUND_RESUME_MIN_HIDDEN_MS = 3_000;

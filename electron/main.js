/**
 * Electron main process – EXE build को लागि।
 * App लाई deploy गरेको URL load गर्छ। Set ELECTRON_APP_URL (env) for your deployed app URL.
 */
const { app, BrowserWindow } = require("electron");

const APP_URL = process.env.ELECTRON_APP_URL || "https://YOUR-DEPLOYED-URL.vercel.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });
  win.loadURL(APP_URL);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

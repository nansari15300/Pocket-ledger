/**
 * Runtime audit for PlServer local vs online company detection.
 * Env: PL_PLSERVER_COMPANY_AUDIT=1, PL_PLSERVER_AUDIT_USER_DATA, PL_PLSERVER_AUDIT_QUERY
 */
const fs = require("fs");
const path = require("path");
const { BrowserWindow } = require("electron");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPlServerCompanyDetectionAudit(deps) {
  const staticOut = path.join(deps.appRoot, "..", "out");
  if (!fs.existsSync(path.join(staticOut, "index.html"))) {
    throw new Error(`Static build missing at ${staticOut}`);
  }

  deps.localAppServer.setServerDeps({
    staticPublicDir: staticOut,
    isPackaged: true,
    rewriteReconciliationDocumentUrl: deps.rewriteReconciliationDocumentUrl,
    isAllowedFirebaseProxyTarget: deps.isAllowedFirebaseProxyTarget,
  });

  deps.localAppServer.saveConfig(deps.userDataPath, {
    appRole: "server",
    userWantsRunning: false,
    bindMode: "localhost",
    port: 3902,
    appUiPort: 3902,
  });

  const port = await deps.localAppServer.startStaticServer(deps.userDataPath, { forAppUi: true });
  const query = String(process.env.PL_PLSERVER_AUDIT_QUERY || "pl_company_detection_audit=1").trim();
  const url = `http://127.0.0.1:${port}/?${query}`;

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: deps.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadURL(url);

  const deadline = Date.now() + 90000;
  let report = null;
  while (Date.now() < deadline) {
    try {
      report = await win.webContents.executeJavaScript(
        "window.__PL_COMPANY_DETECTION_AUDIT_REPORT__ || null",
        true
      );
      if (report) break;
    } catch {
      /* app still booting */
    }
    await sleep(500);
  }

  if (!report) {
    try {
      const consoleDump = await win.webContents.executeJavaScript(
        `(function(){
          try { return window.__PL_COMPANY_DETECTION_AUDIT_REPORT__ ; } catch(e) { return { error: String(e) }; }
        })()`,
        true
      );
      report = consoleDump;
    } catch {
      /* ignore */
    }
  }

  if (!win.isDestroyed()) win.destroy();

  if (!report) {
    throw new Error("Audit report not produced within 90s");
  }

  process.stdout.write(`\n__PL_COMPANY_DETECTION_AUDIT_REPORT__\n${JSON.stringify(report, null, 2)}\n`);
  return report;
}

module.exports = { runPlServerCompanyDetectionAudit };

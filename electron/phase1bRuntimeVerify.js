/**
 * Phase 1B runtime verification — automated Host + simulated LAN client.
 * Invoked when PL_PHASE1B_RUNTIME_VERIFY=1 (see scripts/run-phase1b-runtime-verify.mjs).
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { BrowserWindow } = require("electron");
const accessTokens = require("./localAppServerAccessTokens");

const COMPANY_ID = "phase1b-runtime-verify-co";
const VOUCHER_HOST = "phase1b-v-host-save";
const VOUCHER_HTTP_AUTH = "phase1b-v-http-auth";
const VOUCHER_CLIENT_ROUTE = "phase1b-v-client-route";
const VOUCHER_HOST_REGRESSION = "phase1b-v-host-regression";
const VOUCHER_MIRROR = "phase1b-v-mirror-push";
const VOUCHER_NOOP = "phase1b-v-noop-save";
const VOUCHER_RESTART = "phase1b-v-restart-persist";

const CAPTURE_INSTALL_SCRIPT = `
(() => {
  window.__plPhase1bVerifyCapture = {
    sqliteUpserts: 0,
    flushes: 0,
    cloudEnqueues: 0,
    mirrorQueues: 0,
    hostPublishQueues: 0,
    hostPublishSuccesses: 0,
    reset() {
      this.sqliteUpserts = 0;
      this.flushes = 0;
      this.cloudEnqueues = 0;
      this.mirrorQueues = 0;
      this.hostPublishQueues = 0;
      this.hostPublishSuccesses = 0;
    },
    onCompanyDocUpsert() { this.sqliteUpserts++; },
    onFlush() { this.flushes++; },
    onCloudEnqueue() { this.cloudEnqueues++; },
    onMirrorQueue() { this.mirrorQueues++; },
    onHostPublishQueue() { this.hostPublishQueues++; },
    onHostPublishSuccess() { this.hostPublishSuccesses++; },
  };
  return true;
})();
`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function installCapture(wc) {
  await wc.executeJavaScript(CAPTURE_INSTALL_SCRIPT, true);
}

async function readCapture(wc) {
  return wc.executeJavaScript(
    `({
      sqliteUpserts: window.__plPhase1bVerifyCapture?.sqliteUpserts ?? 0,
      flushes: window.__plPhase1bVerifyCapture?.flushes ?? 0,
      cloudEnqueues: window.__plPhase1bVerifyCapture?.cloudEnqueues ?? 0,
      mirrorQueues: window.__plPhase1bVerifyCapture?.mirrorQueues ?? 0,
      hostPublishQueues: window.__plPhase1bVerifyCapture?.hostPublishQueues ?? 0,
      hostPublishSuccesses: window.__plPhase1bVerifyCapture?.hostPublishSuccesses ?? 0,
    })`,
    true
  );
}

async function resetCapture(wc) {
  await wc.executeJavaScript(`window.__plPhase1bVerifyCapture?.reset?.()`, true);
}

function voucherPayload(id, amount) {
  const now = Date.now();
  return {
    id,
    type: "payment",
    amount,
    updatedAt: now,
    lastEditedAt: now,
    createdAt: now,
    isDeleted: false,
  };
}

async function seedCompanyOnBridge(runInServerAppRenderer) {
  return runInServerAppRenderer(
    `(async () => {
      if (typeof window.__plPhase1bVerifySeedCompany !== "function") return { ok: false, error: "shim_missing" };
      return await window.__plPhase1bVerifySeedCompany({
        id: ${JSON.stringify(COMPANY_ID)},
        name: "Phase1B Runtime Verify",
        ownerId: "phase1b-verify-owner",
        storageOption: "local",
        syncPolicy: "offline",
      });
    })()`,
    { requireFn: "__plPhase1bVerifySeedCompany" }
  );
}

async function exportVoucherIds(runMirrorCollectionExportWithMeta) {
  const out = await runMirrorCollectionExportWithMeta(COMPANY_ID, "vouchers");
  const docs = out && typeof out === "object" && Array.isArray(out.docs) ? out.docs : Array.isArray(out) ? out : null;
  if (!docs) return [];
  return docs.map((d) => String(d?.id || "").trim()).filter(Boolean);
}

async function uiUpsertVoucher(uiWc, voucherId, payload) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyUpsertVoucher !== "function") return { ok: false, error: "shim_missing" };
      return await window.__plPhase1bVerifyUpsertVoucher(
        ${JSON.stringify(COMPANY_ID)},
        ${JSON.stringify(voucherId)},
        ${JSON.stringify(payload)}
      );
    })()`,
    true
  );
}

async function uiFlushDb(uiWc) {
  await uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyFlushDb !== "function") return { ok: false };
      return await window.__plPhase1bVerifyFlushDb();
    })()`,
    true
  );
}

async function bridgeHostUpsert(runInServerAppRenderer, docId, data, notify) {
  return runInServerAppRenderer(
    `(async () => {
      if (typeof window.__plHostBridgeCompanyDocUpsert !== "function") return { ok: false, error: "bridge_missing" };
      return await window.__plHostBridgeCompanyDocUpsert({
        companyId: ${JSON.stringify(COMPANY_ID)},
        collectionName: "vouchers",
        docId: ${JSON.stringify(docId)},
        data: ${JSON.stringify(data)},
        notify: ${notify !== false},
      });
    })()`,
    { requireFn: "__plHostBridgeCompanyDocUpsert" }
  );
}

async function installBumpListener(uiWc, companyId, collection) {
  await uiWc.executeJavaScript(
    `(function(){
      window.__plPhase1bVerifyBumpReceived = false;
      window.__plPhase1bVerifyBumpHandler = (ev) => {
        const d = ev && ev.detail;
        if (d && d.companyId === ${JSON.stringify(companyId)} && d.collection === ${JSON.stringify(collection)}) {
          window.__plPhase1bVerifyBumpReceived = true;
        }
      };
      window.addEventListener("pocket-ledger-browser-db-bump", window.__plPhase1bVerifyBumpHandler);
    })()`,
    true
  );
}

async function readBumpReceived(uiWc) {
  return uiWc.executeJavaScript(`Boolean(window.__plPhase1bVerifyBumpReceived)`, true);
}

function httpPostJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw };
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function createUiWindow(port, preloadPath) {
  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await win.loadURL(`http://localhost:${port}/`);
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const ok = await win.webContents.executeJavaScript(
        `typeof window.plElectronBridge !== "undefined" && typeof window.plElectronLocalServer !== "undefined" && typeof window.__plPhase1bVerifyUpsertVoucher === "function"`,
        true
      );
      if (ok) break;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  return win;
}

function assertScenario(name, checks) {
  const failed = checks.filter((c) => !c.pass);
  return {
    name,
    pass: failed.length === 0,
    checks,
    failed,
  };
}

/**
 * @param {object} deps
 * @param {import('electron').App} deps.app
 * @param {string} deps.preloadPath
 * @param {string} deps.userDataPath
 * @param {object} deps.localAppServer
 * @param {() => Promise<number|null>} deps.startSharedLocalServer
 * @param {() => Promise<void>} deps.stopSharingOnly
 * @param {() => Promise<import('electron').WebContents>} deps.ensureServerDataBridgeWindow
 * @param {Function} deps.runInServerAppRenderer
 * @param {Function} deps.runMirrorCollectionExportWithMeta
 * @param {() => { bridgeIpc: number, broadcast: number, mirrorPushBroadcast: number, hostPublish: number, authoritativeHttp: number }} deps.getVerifyStats
 * @param {() => void} deps.resetVerifyStats
 */
async function runPhase1bRuntimeVerify(deps) {
  const report = {
    startedAt: new Date().toISOString(),
    scenarios: [],
    allPassed: false,
  };

  const staticOut = path.join(deps.appRoot, "..", "out");
  if (!fs.existsSync(path.join(staticOut, "index.html"))) {
    throw new Error(`Static build missing at ${staticOut} — run npm run build:static:fast first`);
  }

  deps.localAppServer.setServerDeps({
    staticPublicDir: staticOut,
    isPackaged: true,
    rewriteReconciliationDocumentUrl: deps.rewriteReconciliationDocumentUrl,
    isAllowedFirebaseProxyTarget: deps.isAllowedFirebaseProxyTarget,
  });

  deps.localAppServer.saveConfig(deps.userDataPath, {
    appRole: "both",
    userWantsRunning: true,
    bindMode: "localhost",
    port: 3901,
  });

  deps.resetVerifyStats();

  const sharingPort = await deps.startSharedLocalServer();
  const bridge = await deps.ensureServerDataBridgeWindow();
  if (!bridge || bridge.isDestroyed()) {
    throw new Error("bridge_window_unavailable");
  }

  const status = deps.localAppServer.getStatus(deps.userDataPath);
  const appUiPort = status.appUiPort || sharingPort;
  if (!appUiPort) throw new Error("app_ui_port_unavailable");

  await seedCompanyOnBridge(deps.runInServerAppRenderer);
  await installCapture(bridge);

  const uiWin = await createUiWindow(appUiPort, deps.preloadPath);
  await installCapture(uiWin.webContents);

  const tokenRec = accessTokens.createAccessToken(deps.userDataPath, {
    label: "Phase1B Verify Client",
    allowedCompanyIds: [COMPANY_ID],
  });

  // --- Scenario 1: Host save ---
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  await installBumpListener(uiWin.webContents, COMPANY_ID, "vouchers");

  const payload1 = voucherPayload(VOUCHER_HOST, 100);
  await uiUpsertVoucher(uiWin.webContents, VOUCHER_HOST, payload1);
  await sleep(800);

  const bridgeCap1 = await readCapture(bridge);
  const uiCap1 = await readCapture(uiWin.webContents);
  const stats1 = deps.getVerifyStats();
  const exportIds1 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const bump1 = await readBumpReceived(uiWin.webContents);

  report.scenarios.push(
    assertScenario("Scenario 1 — Host save", [
      { label: "bridge sqlite upserts === 1", pass: bridgeCap1.sqliteUpserts === 1, actual: bridgeCap1.sqliteUpserts },
      { label: "UI sqlite upserts === 0", pass: uiCap1.sqliteUpserts === 0, actual: uiCap1.sqliteUpserts },
      { label: "bridge flush >= 1", pass: bridgeCap1.flushes >= 1, actual: bridgeCap1.flushes },
      { label: "broadcast === 1", pass: stats1.broadcast === 1, actual: stats1.broadcast },
      { label: "bridge IPC === 1", pass: stats1.bridgeIpc === 1, actual: stats1.bridgeIpc },
      { label: "host publish queue === 1", pass: bridgeCap1.hostPublishQueues === 1, actual: bridgeCap1.hostPublishQueues },
      { label: "host publish success === 1", pass: bridgeCap1.hostPublishSuccesses === 1, actual: bridgeCap1.hostPublishSuccesses },
      { label: "host publish server ack === 1", pass: stats1.hostPublish === 1, actual: stats1.hostPublish },
      { label: "mirror push broadcast === 0", pass: stats1.mirrorPushBroadcast === 0, actual: stats1.mirrorPushBroadcast },
      { label: "UI bump received", pass: bump1 === true, actual: bump1 },
      { label: "export contains voucher", pass: exportIds1.includes(VOUCHER_HOST), actual: exportIds1 },
    ])
  );

  // --- Scenario 6 — Authoritative HTTP write (same pipeline as IPC Scenario 1) ---
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  await installBumpListener(uiWin.webContents, COMPANY_ID, "vouchers");

  const payload6 = voucherPayload(VOUCHER_HTTP_AUTH, 150);
  const authUrl = `http://127.0.0.1:${sharingPort}/__pl_authoritative_company_doc_upsert`;
  const authRes = await httpPostJson(
    authUrl,
    { "x-pocket-ledger-access": tokenRec.token },
    {
      companyId: COMPANY_ID,
      collectionName: "vouchers",
      docId: VOUCHER_HTTP_AUTH,
      data: payload6,
      notify: true,
    }
  );

  await sleep(800);

  const bridgeCap6 = await readCapture(bridge);
  const uiCap6 = await readCapture(uiWin.webContents);
  const stats6 = deps.getVerifyStats();
  const exportIds6 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const bump6 = await readBumpReceived(uiWin.webContents);

  report.scenarios.push(
    assertScenario("Scenario 6 — Authoritative HTTP write", [
      { label: "HTTP 200", pass: authRes.status === 200, actual: authRes.status },
      { label: "HTTP body ok", pass: authRes.body?.ok === true, actual: authRes.body },
      { label: "bridge sqlite upserts === 1", pass: bridgeCap6.sqliteUpserts === 1, actual: bridgeCap6.sqliteUpserts },
      { label: "UI sqlite upserts === 0", pass: uiCap6.sqliteUpserts === 0, actual: uiCap6.sqliteUpserts },
      { label: "bridge flush >= 1", pass: bridgeCap6.flushes >= 1, actual: bridgeCap6.flushes },
      { label: "broadcast === 1", pass: stats6.broadcast === 1, actual: stats6.broadcast },
      { label: "bridge IPC === 0", pass: stats6.bridgeIpc === 0, actual: stats6.bridgeIpc },
      { label: "authoritative HTTP === 1", pass: stats6.authoritativeHttp === 1, actual: stats6.authoritativeHttp },
      { label: "host publish queue === 1", pass: bridgeCap6.hostPublishQueues === 1, actual: bridgeCap6.hostPublishQueues },
      { label: "host publish success === 1", pass: bridgeCap6.hostPublishSuccesses === 1, actual: bridgeCap6.hostPublishSuccesses },
      { label: "host publish server ack === 1", pass: stats6.hostPublish === 1, actual: stats6.hostPublish },
      { label: "mirror push broadcast === 0", pass: stats6.mirrorPushBroadcast === 0, actual: stats6.mirrorPushBroadcast },
      { label: "UI bump received", pass: bump6 === true, actual: bump6 },
      { label: "export contains voucher", pass: exportIds6.includes(VOUCHER_HTTP_AUTH), actual: exportIds6 },
    ])
  );

  // --- Scenario 7: Client routing (LAN gate → authoritative HTTP, not local commit / IPC) ---
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  await installBumpListener(uiWin.webContents, COMPANY_ID, "vouchers");

  await uiWin.webContents.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyInstallLanClientGate !== "function") return { ok: false, error: "shim_missing" };
      return await window.__plPhase1bVerifyInstallLanClientGate(
        ${JSON.stringify(`http://127.0.0.1:${sharingPort}`)},
        ${JSON.stringify(tokenRec.token)},
        ${JSON.stringify(COMPANY_ID)}
      );
    })()`,
    true
  );

  const payload7 = voucherPayload(VOUCHER_CLIENT_ROUTE, 175);
  await uiWin.webContents.executeJavaScript(
    `(async () => {
      window.__plPhase1bVerifySkipHostBridgeForNextUpsert = true;
      if (typeof window.__plPhase1bVerifyUpsertVoucher !== "function") return { ok: false, error: "shim_missing" };
      return await window.__plPhase1bVerifyUpsertVoucher(
        ${JSON.stringify(COMPANY_ID)},
        ${JSON.stringify(VOUCHER_CLIENT_ROUTE)},
        ${JSON.stringify(payload7)}
      );
    })()`,
    true
  );
  await sleep(800);

  const bridgeCap7 = await readCapture(bridge);
  const uiCap7 = await readCapture(uiWin.webContents);
  const stats7 = deps.getVerifyStats();
  const exportIds7 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const bump7 = await readBumpReceived(uiWin.webContents);

  report.scenarios.push(
    assertScenario("Scenario 7 — Client authoritative routing", [
      { label: "UI sqlite upserts === 0", pass: uiCap7.sqliteUpserts === 0, actual: uiCap7.sqliteUpserts },
      { label: "bridge sqlite upserts >= 1", pass: bridgeCap7.sqliteUpserts >= 1, actual: bridgeCap7.sqliteUpserts },
      { label: "bridge flush >= 1", pass: bridgeCap7.flushes >= 1, actual: bridgeCap7.flushes },
      { label: "broadcast === 1", pass: stats7.broadcast === 1, actual: stats7.broadcast },
      { label: "bridge IPC === 0", pass: stats7.bridgeIpc === 0, actual: stats7.bridgeIpc },
      { label: "authoritative HTTP === 1", pass: stats7.authoritativeHttp === 1, actual: stats7.authoritativeHttp },
      { label: "mirror queue === 0", pass: uiCap7.mirrorQueues === 0, actual: uiCap7.mirrorQueues },
      { label: "host publish queue >= 1", pass: bridgeCap7.hostPublishQueues >= 1, actual: bridgeCap7.hostPublishQueues },
      { label: "host publish success >= 1", pass: bridgeCap7.hostPublishSuccesses >= 1, actual: bridgeCap7.hostPublishSuccesses },
      { label: "host publish server ack >= 1", pass: stats7.hostPublish >= 1, actual: stats7.hostPublish },
      { label: "mirror push broadcast === 0", pass: stats7.mirrorPushBroadcast === 0, actual: stats7.mirrorPushBroadcast },
      { label: "UI bump received", pass: bump7 === true, actual: bump7 },
      { label: "export contains voucher", pass: exportIds7.includes(VOUCHER_CLIENT_ROUTE), actual: exportIds7 },
    ])
  );

  await uiWin.webContents.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyClearLanClientGate !== "function") return { ok: false };
      return await window.__plPhase1bVerifyClearLanClientGate();
    })()`,
    true
  );

  // --- Scenario 8: Host save regression (unchanged bridge path after client routing) ---
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  await installBumpListener(uiWin.webContents, COMPANY_ID, "vouchers");

  const payload8 = voucherPayload(VOUCHER_HOST_REGRESSION, 200);
  await uiUpsertVoucher(uiWin.webContents, VOUCHER_HOST_REGRESSION, payload8);
  await sleep(800);

  const bridgeCap8 = await readCapture(bridge);
  const uiCap8 = await readCapture(uiWin.webContents);
  const stats8 = deps.getVerifyStats();
  const exportIds8 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const bump8 = await readBumpReceived(uiWin.webContents);

  report.scenarios.push(
    assertScenario("Scenario 8 — Host save regression", [
      { label: "bridge sqlite upserts === 1", pass: bridgeCap8.sqliteUpserts === 1, actual: bridgeCap8.sqliteUpserts },
      { label: "UI sqlite upserts === 0", pass: uiCap8.sqliteUpserts === 0, actual: uiCap8.sqliteUpserts },
      { label: "bridge flush >= 1", pass: bridgeCap8.flushes >= 1, actual: bridgeCap8.flushes },
      { label: "broadcast === 1", pass: stats8.broadcast === 1, actual: stats8.broadcast },
      { label: "bridge IPC === 1", pass: stats8.bridgeIpc === 1, actual: stats8.bridgeIpc },
      { label: "authoritative HTTP === 0", pass: stats8.authoritativeHttp === 0, actual: stats8.authoritativeHttp },
      { label: "host publish queue === 1", pass: bridgeCap8.hostPublishQueues === 1, actual: bridgeCap8.hostPublishQueues },
      { label: "host publish success === 1", pass: bridgeCap8.hostPublishSuccesses === 1, actual: bridgeCap8.hostPublishSuccesses },
      { label: "host publish server ack === 1", pass: stats8.hostPublish === 1, actual: stats8.hostPublish },
      { label: "mirror push broadcast === 0", pass: stats8.mirrorPushBroadcast === 0, actual: stats8.mirrorPushBroadcast },
      { label: "UI bump received", pass: bump8 === true, actual: bump8 },
      { label: "export contains voucher", pass: exportIds8.includes(VOUCHER_HOST_REGRESSION), actual: exportIds8 },
    ])
  );

  // --- Scenario 2: Mirror apply (simulated LAN client) ---
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await installBumpListener(uiWin.webContents, COMPANY_ID, "vouchers");

  const mirrorDoc = voucherPayload(VOUCHER_MIRROR, 250);
  const pushUrl = `http://127.0.0.1:${sharingPort}/__pl_company_mirror_push`;
  const pushRes = await httpPostJson(
    pushUrl,
    { "x-pocket-ledger-access": tokenRec.token },
    {
      companyId: COMPANY_ID,
      collection: "vouchers",
      docs: [mirrorDoc],
      mirrorProtocol: 3,
    }
  );

  await sleep(400);
  const bridgeCap2 = await readCapture(bridge);
  const stats2 = deps.getVerifyStats();
  const exportIds2 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const bump2 = await readBumpReceived(uiWin.webContents);

  report.scenarios.push(
    assertScenario("Scenario 2 — Mirror apply", [
      { label: "mirror push HTTP 200", pass: pushRes.status === 200, actual: pushRes.status },
      { label: "push body ok", pass: pushRes.body?.ok === true, actual: pushRes.body },
      { label: "bridge sqlite upserts >= 1", pass: bridgeCap2.sqliteUpserts >= 1, actual: bridgeCap2.sqliteUpserts },
      { label: "mirror push broadcast === 1", pass: stats2.mirrorPushBroadcast === 1, actual: stats2.mirrorPushBroadcast },
      { label: "UI bump received", pass: bump2 === true, actual: bump2 },
      {
        label: "export contains mirrored voucher",
        pass: exportIds2.includes(VOUCHER_MIRROR),
        actual: exportIds2,
      },
    ])
  );

  // --- Scenario 3: No-op save (identical notify:false bridge apply — user notify:true always re-stamps) ---
  const stableNoopDoc = {
    id: VOUCHER_NOOP,
    type: "payment",
    amount: 1,
    updatedAt: 1_700_000_000_000,
    lastEditedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    isDeleted: false,
  };
  await bridgeHostUpsert(deps.runInServerAppRenderer, VOUCHER_NOOP, stableNoopDoc, false);
  await sleep(200);

  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);

  await bridgeHostUpsert(deps.runInServerAppRenderer, VOUCHER_NOOP, stableNoopDoc, false);
  await sleep(300);

  const bridgeCap3 = await readCapture(bridge);
  const uiCap3 = await readCapture(uiWin.webContents);
  const stats3 = deps.getVerifyStats();

  report.scenarios.push(
    assertScenario("Scenario 3 — No-op save", [
      { label: "bridge sqlite upserts === 0", pass: bridgeCap3.sqliteUpserts === 0, actual: bridgeCap3.sqliteUpserts },
      { label: "UI sqlite upserts === 0", pass: uiCap3.sqliteUpserts === 0, actual: uiCap3.sqliteUpserts },
      { label: "broadcast === 0", pass: stats3.broadcast === 0, actual: stats3.broadcast },
      { label: "bridge IPC === 0", pass: stats3.bridgeIpc === 0, actual: stats3.bridgeIpc },
      { label: "host publish server ack === 0", pass: stats3.hostPublish === 0, actual: stats3.hostPublish },
      { label: "mirror queue === 0", pass: bridgeCap3.mirrorQueues === 0, actual: bridgeCap3.mirrorQueues },
      { label: "host publish queue === 0", pass: bridgeCap3.hostPublishQueues === 0, actual: bridgeCap3.hostPublishQueues },
      { label: "host publish success === 0", pass: bridgeCap3.hostPublishSuccesses === 0, actual: bridgeCap3.hostPublishSuccesses },
      { label: "cloud enqueue === 0", pass: bridgeCap3.cloudEnqueues === 0, actual: bridgeCap3.cloudEnqueues },
    ])
  );

  // --- Scenario 4: Sharing OFF regression ---
  await deps.stopSharingOnly();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);

  await uiWin.webContents.executeJavaScript(
    `(function(){
      try { if (typeof window.__plInvalidateBrowserDbCache === "function") window.__plInvalidateBrowserDbCache(); } catch (e) {}
    })()`,
    true
  );
  await sleep(200);

  const localPayload = voucherPayload("phase1b-v-sharing-off", 50);
  await uiUpsertVoucher(uiWin.webContents, "phase1b-v-sharing-off", localPayload);
  await uiFlushDb(uiWin.webContents);
  await deps.runInServerAppRenderer(
    `(async () => {
      if (typeof window.__plPhase1bVerifyFlushDb === "function") await window.__plPhase1bVerifyFlushDb();
      return { ok: true };
    })()`,
    { requireFn: "__plPhase1bVerifyFlushDb" }
  );
  await sleep(400);

  const uiHasLocal = await uiWin.webContents.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyGetVoucher !== "function") return false;
      const row = await window.__plPhase1bVerifyGetVoucher(${JSON.stringify(COMPANY_ID)}, "phase1b-v-sharing-off");
      return Boolean(row && row.id);
    })()`,
    true
  ).catch(() => false);

  const bridgeCap4 = await readCapture(bridge);
  const uiCap4 = await readCapture(uiWin.webContents);
  const stats4 = deps.getVerifyStats();
  report.scenarios.push(
    assertScenario("Scenario 4 — Sharing OFF regression", [
      { label: "no bridge IPC", pass: stats4.bridgeIpc === 0, actual: stats4.bridgeIpc },
      { label: "no broadcast", pass: stats4.broadcast === 0, actual: stats4.broadcast },
      { label: "UI local sqlite upsert >= 1", pass: uiCap4.sqliteUpserts >= 1, actual: uiCap4.sqliteUpserts },
      { label: "bridge sqlite upserts === 0", pass: bridgeCap4.sqliteUpserts === 0, actual: bridgeCap4.sqliteUpserts },
      { label: "UI renderer has local-save voucher", pass: uiHasLocal === true, actual: uiHasLocal },
    ])
  );

  // Re-enable sharing for scenario 5
  deps.localAppServer.saveConfig(deps.userDataPath, { userWantsRunning: true });
  await deps.startSharedLocalServer();
  await deps.ensureServerDataBridgeWindow();

  // --- Scenario 5: Restart persistence ---
  const restartPayload = voucherPayload(VOUCHER_RESTART, 999);
  await uiUpsertVoucher(uiWin.webContents, VOUCHER_RESTART, restartPayload);
  await sleep(400);

  const markerPath = path.join(deps.userDataPath, "phase1b-restart-marker.json");
  const exportBeforeRestart = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  fs.writeFileSync(
    markerPath,
    JSON.stringify({
      companyId: COMPANY_ID,
      voucherIds: exportBeforeRestart,
      expectRestart: VOUCHER_RESTART,
    }),
    "utf8"
  );

  if (!uiWin.isDestroyed()) uiWin.destroy();

  report.scenarios.push({
    name: "Scenario 5 — Restart persistence (phase A seed)",
    pass: exportBeforeRestart.includes(VOUCHER_RESTART),
    checks: [
      {
        label: "pre-restart export contains restart voucher",
        pass: exportBeforeRestart.includes(VOUCHER_RESTART),
        actual: exportBeforeRestart,
      },
    ],
    failed: exportBeforeRestart.includes(VOUCHER_RESTART)
      ? []
      : [{ label: "pre-restart export contains restart voucher", pass: false, actual: exportBeforeRestart }],
    markerPath,
    phase: "A",
  });

  report.allPassed = report.scenarios.every((s) => s.pass);
  report.finishedAt = new Date().toISOString();
  return report;
}

/** Phase B after Electron restart — read persisted export only. */
async function runPhase1bRuntimeVerifyRestartPhase(deps) {
  const markerPath = path.join(deps.userDataPath, "phase1b-restart-marker.json");
  if (!fs.existsSync(markerPath)) {
    throw new Error("restart marker missing — run phase A first");
  }
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));

  const staticOut = path.join(deps.appRoot, "..", "out");
  deps.localAppServer.setServerDeps({
    staticPublicDir: staticOut,
    isPackaged: true,
    rewriteReconciliationDocumentUrl: deps.rewriteReconciliationDocumentUrl,
    isAllowedFirebaseProxyTarget: deps.isAllowedFirebaseProxyTarget,
  });

  deps.localAppServer.saveConfig(deps.userDataPath, {
    appRole: "both",
    userWantsRunning: true,
    bindMode: "localhost",
  });

  await deps.startSharedLocalServer();
  await deps.ensureServerDataBridgeWindow();

  const exportIds = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const expect = String(marker.expectRestart || VOUCHER_RESTART);
  const hostStill = exportIds.includes(VOUCHER_HOST);
  const mirrorStill = exportIds.includes(VOUCHER_MIRROR);
  const restartStill = exportIds.includes(expect);

  const scenario = assertScenario("Scenario 5 — Restart persistence (phase B)", [
    { label: "export contains host-save voucher", pass: hostStill, actual: exportIds },
    { label: "export contains mirror voucher", pass: mirrorStill, actual: exportIds },
    { label: "export contains restart voucher", pass: restartStill, actual: exportIds },
  ]);

  return {
    startedAt: new Date().toISOString(),
    scenarios: [scenario],
    allPassed: scenario.pass,
    finishedAt: new Date().toISOString(),
  };
}

module.exports = { runPhase1bRuntimeVerify, runPhase1bRuntimeVerifyRestartPhase, COMPANY_ID };

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
const VOUCHER_PENDING_9 = "phase1b-v-pending-9";
const VOUCHER_PENDING_10 = "phase1b-v-pending-10";
const VOUCHER_PENDING_11 = "phase1b-v-pending-11";
const VOUCHER_PENDING_12A = "phase1b-v-pending-12a";
const VOUCHER_PENDING_12B = "phase1b-v-pending-12b";
const VOUCHER_PENDING_12C = "phase1b-v-pending-12c";
const VOUCHER_PENDING_13 = "phase1b-v-pending-13";
const VOUCHER_PENDING_14 = "phase1b-v-pending-14";
const VOUCHER_PENDING_15 = "phase1b-v-pending-15";
const VOUCHER_PENDING_16 = "phase1b-v-pending-16";
const VOUCHER_M4_17 = "phase1b-v-m4-plshared-17";
const VOUCHER_M4_18 = "phase1b-v-m4-plshared-18";
const VOUCHER_M4_20 = "phase1b-v-m4-plshared-20";
const VOUCHER_READ_21 = "phase1b-v-read-pull-21";
const VOUCHER_READ_23 = "phase1b-v-read-fresh-23";
const VOUCHER_PILOT_ROUTE_LIMIT = "phase1b-v-pilot-route-limit";
const VOUCHER_PILOT_ATTACH = "phase1b-v-pilot-attach-local";
const MAX_AUTO_RETRIES_PILOT = 12;
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

/** Fixed timestamps so replay idempotency (notify:false) can noop on the Host. */
function stableVoucherPayload(id, amount) {
  return {
    id,
    type: "payment",
    amount,
    updatedAt: 1_700_000_001_000,
    lastEditedAt: 1_700_000_001_000,
    createdAt: 1_700_000_001_000,
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

async function installLanClientGateUi(uiWc, sharingPort, token) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyInstallLanClientGate !== "function") return { ok: false };
      return await window.__plPhase1bVerifyInstallLanClientGate(
        ${JSON.stringify(`http://127.0.0.1:${sharingPort}`)},
        ${JSON.stringify(token)},
        ${JSON.stringify(COMPANY_ID)}
      );
    })()`,
    true
  );
}

async function clearLanClientGateUi(uiWc) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyClearLanClientGate !== "function") return { ok: false };
      return await window.__plPhase1bVerifyClearLanClientGate();
    })()`,
    true
  );
}

async function seedPlServerSharedClientCompanyUi(uiWc) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifySeedPlServerSharedClientCompany !== "function") return { ok: false };
      return await window.__plPhase1bVerifySeedPlServerSharedClientCompany(
        ${JSON.stringify(COMPANY_ID)},
        "Phase1B Runtime Verify"
      );
    })()`,
    true
  );
}

async function pullLiveSyncUi(uiWc, companyId = COMPANY_ID) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyPullPlServerSharedCompanyLive !== "function") {
        return { ok: false, fullPull: false, error: "shim_missing" };
      }
      return await window.__plPhase1bVerifyPullPlServerSharedCompanyLive(${JSON.stringify(companyId)});
    })()`,
    true
  );
}

async function getClientVoucherUi(uiWc, voucherId, companyId = COMPANY_ID) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyGetVoucher !== "function") return null;
      return await window.__plPhase1bVerifyGetVoucher(${JSON.stringify(companyId)}, ${JSON.stringify(voucherId)});
    })()`,
    true
  );
}

async function countPendingAuthoritativeUi(uiWc) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyCountPendingAuthoritativeWrites !== "function") return -1;
      return await window.__plPhase1bVerifyCountPendingAuthoritativeWrites();
    })()`,
    true
  );
}

async function drainPendingAuthoritativeUi(uiWc) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyDrainPendingAuthoritativeQueue !== "function") return { drained: -1 };
      return await window.__plPhase1bVerifyDrainPendingAuthoritativeQueue();
    })()`,
    true
  );
}

async function coldStartPendingReplayUi(uiWc) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyColdStartPendingReplay !== "function") return { drained: -1 };
      return await window.__plPhase1bVerifyColdStartPendingReplay();
    })()`,
    true
  );
}

async function getPendingStateUi(uiWc, docId) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyGetPendingAuthoritativeState !== "function") return null;
      return await window.__plPhase1bVerifyGetPendingAuthoritativeState(
        ${JSON.stringify(COMPANY_ID)},
        ${JSON.stringify(docId)}
      );
    })()`,
    true
  );
}

async function setPendingRetryCountUi(uiWc, docId, retryCount) {
  return uiWc.executeJavaScript(
    `(async () => {
      const fn = window.__plPhase1bVerifySetPendingAuthoritativeRetryCount;
      if (typeof fn !== "function") return { ok: false };
      return await fn(${JSON.stringify(COMPANY_ID)}, ${JSON.stringify(docId)}, ${retryCount});
    })()`,
    true
  );
}

async function lanClientUpsertVoucher(uiWc, voucherId, payload) {
  return uiWc.executeJavaScript(
    `(async () => {
      window.__plPhase1bVerifySkipHostBridgeForNextUpsert = true;
      if (typeof window.__plPhase1bVerifyUpsertVoucher !== "function") return { ok: false };
      return await window.__plPhase1bVerifyUpsertVoucher(
        ${JSON.stringify(COMPANY_ID)},
        ${JSON.stringify(voucherId)},
        ${JSON.stringify(payload)}
      );
    })()`,
    true
  );
}

async function drainUntilPendingZero(uiWc, maxRounds = 12) {
  for (let i = 0; i < maxRounds; i += 1) {
    await drainPendingAuthoritativeUi(uiWc);
    await sleep(500);
    const remaining = await countPendingAuthoritativeUi(uiWc);
    if (remaining === 0) return 0;
  }
  return countPendingAuthoritativeUi(uiWc);
}

async function enableVerifyLanClientReplayRoute(uiWc) {
  await uiWc.executeJavaScript(`window.__plPhase1bVerifySimulateLanClientAuthoritativeRoute = true;`, true);
}

async function clearAllPendingUi(uiWc) {
  return uiWc.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyClearAllPendingAuthoritativeWrites !== "function") return { ok: false };
      return await window.__plPhase1bVerifyClearAllPendingAuthoritativeWrites();
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
 * @param {() => Promise<number|null>} deps.resumeHostSharingAfterBootIfConfigured
 * @param {(cfg: object, st: object) => boolean} deps.shouldOfferTrayStartSharing
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

  // --- Milestone 3: Pending authoritative write scenarios (9–16) ---
  await clearLanClientGateUi(uiWin.webContents);
  await clearAllPendingUi(uiWin.webContents);
  await uiWin.webContents.executeJavaScript(
    `window.__plPhase1bVerifyForceRecoverPendingSends = true; window.__plPhase1bVerifyPauseBackgroundAuthoritativeReplay = true;`,
    true
  );

  // Scenario 9 — Host unavailable → pending created
  await installLanClientGateUi(uiWin.webContents, sharingPort, tokenRec.token);
  await enableVerifyLanClientReplayRoute(uiWin.webContents);
  await deps.stopSharingOnly();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);

  const payload9 = voucherPayload(VOUCHER_PENDING_9, 901);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_9, payload9);
  await sleep(400);

  const pending9 = await countPendingAuthoritativeUi(uiWin.webContents);
  const uiCap9 = await readCapture(uiWin.webContents);
  const bridgeCap9 = await readCapture(bridge);
  const stats9 = deps.getVerifyStats();

  report.scenarios.push(
    assertScenario("Scenario 9 — Host unavailable → pending created", [
      { label: "pending queue count === 1", pass: pending9 === 1, actual: pending9 },
      { label: "UI sqlite upserts === 0", pass: uiCap9.sqliteUpserts === 0, actual: uiCap9.sqliteUpserts },
      { label: "bridge sqlite upserts === 0", pass: bridgeCap9.sqliteUpserts === 0, actual: bridgeCap9.sqliteUpserts },
      { label: "authoritative HTTP === 0", pass: stats9.authoritativeHttp === 0, actual: stats9.authoritativeHttp },
      { label: "bridge IPC === 0", pass: stats9.bridgeIpc === 0, actual: stats9.bridgeIpc },
      { label: "mirror queue === 0", pass: uiCap9.mirrorQueues === 0, actual: uiCap9.mirrorQueues },
    ])
  );

  // Scenario 10 — Reconnect → replay succeeds
  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);

  const drain10 = await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(800);

  const pending10 = await countPendingAuthoritativeUi(uiWin.webContents);
  const stats10 = deps.getVerifyStats();
  const bridgeCap10 = await readCapture(bridge);
  const exportIds10 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 10 — Reconnect → replay succeeds", [
      { label: "drain drained >= 1", pass: (drain10?.drained ?? 0) >= 1, actual: drain10 },
      { label: "pending queue count === 0", pass: pending10 === 0, actual: pending10 },
      { label: "authoritative HTTP === 1", pass: stats10.authoritativeHttp === 1, actual: stats10.authoritativeHttp },
      { label: "bridge sqlite upserts >= 1", pass: bridgeCap10.sqliteUpserts >= 1, actual: bridgeCap10.sqliteUpserts },
      { label: "export contains voucher", pass: exportIds10.includes(VOUCHER_PENDING_9), actual: exportIds10 },
    ])
  );

  // Scenario 11 — Cold start while pending → replay after restart simulation
  await deps.stopSharingOnly();
  deps.resetVerifyStats();
  const payload11 = voucherPayload(VOUCHER_PENDING_11, 911);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_11, payload11);
  await sleep(300);
  const pending11Before = await countPendingAuthoritativeUi(uiWin.webContents);

  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  const cold11 = await coldStartPendingReplayUi(uiWin.webContents);
  await sleep(800);

  const pending11After = await countPendingAuthoritativeUi(uiWin.webContents);
  const stats11 = deps.getVerifyStats();
  const exportIds11 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 11 — Cold start replay while pending", [
      { label: "pending before >= 1", pass: pending11Before >= 1, actual: pending11Before },
      { label: "cold start drained >= 1", pass: (cold11?.drained ?? 0) >= 1, actual: cold11 },
      { label: "pending queue count === 0", pass: pending11After === 0, actual: pending11After },
      { label: "authoritative HTTP >= 1", pass: stats11.authoritativeHttp >= 1, actual: stats11.authoritativeHttp },
      { label: "export contains voucher", pass: exportIds11.includes(VOUCHER_PENDING_11), actual: exportIds11 },
    ])
  );

  // Scenario 12 — Multiple queued writes
  await clearAllPendingUi(uiWin.webContents);
  await deps.stopSharingOnly();
  deps.resetVerifyStats();
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_12A, voucherPayload(VOUCHER_PENDING_12A, 921));
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_12B, voucherPayload(VOUCHER_PENDING_12B, 922));
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_12C, voucherPayload(VOUCHER_PENDING_12C, 923));
  await sleep(300);
  const pending12Before = await countPendingAuthoritativeUi(uiWin.webContents);

  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  const pending12After = await drainUntilPendingZero(uiWin.webContents, 20);
  await sleep(400);

  const stats12 = deps.getVerifyStats();
  const exportIds12 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 12 — Multiple queued writes", [
      { label: "pending before === 3", pass: pending12Before === 3, actual: pending12Before },
      { label: "pending queue count === 0", pass: pending12After === 0, actual: pending12After },
      { label: "authoritative HTTP === 3", pass: stats12.authoritativeHttp === 3, actual: stats12.authoritativeHttp },
      { label: "export contains 12a", pass: exportIds12.includes(VOUCHER_PENDING_12A), actual: exportIds12 },
      { label: "export contains 12b", pass: exportIds12.includes(VOUCHER_PENDING_12B), actual: exportIds12 },
      { label: "export contains 12c", pass: exportIds12.includes(VOUCHER_PENDING_12C), actual: exportIds12 },
    ])
  );

  // Scenario 13 — Duplicate replay protection (parallel drain)
  await clearAllPendingUi(uiWin.webContents);
  await deps.stopSharingOnly();
  const payload13 = voucherPayload(VOUCHER_PENDING_13, 931);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_13, payload13);
  await sleep(200);
  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await resetCapture(bridge);

  await uiWin.webContents.executeJavaScript(
    `(async () => {
      const drain = window.__plPhase1bVerifyDrainPendingAuthoritativeQueue;
      if (typeof drain !== "function") return { ok: false };
      const [a, b] = await Promise.all([drain(), drain()]);
      return { ok: true, a, b };
    })()`,
    true
  );
  await sleep(800);

  const pending13 = await countPendingAuthoritativeUi(uiWin.webContents);
  const stats13 = deps.getVerifyStats();

  report.scenarios.push(
    assertScenario("Scenario 13 — Duplicate replay protection", [
      { label: "pending queue count === 0", pass: pending13 === 0, actual: pending13 },
      { label: "authoritative HTTP === 1", pass: stats13.authoritativeHttp === 1, actual: stats13.authoritativeHttp },
    ])
  );

  // Scenario 14 — Authentication failure
  await clearAllPendingUi(uiWin.webContents);
  await clearLanClientGateUi(uiWin.webContents);
  await installLanClientGateUi(uiWin.webContents, sharingPort, "invalid-verify-token");
  await deps.stopSharingOnly();
  const payload14 = voucherPayload(VOUCHER_PENDING_14, 941);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_14, payload14);
  await sleep(200);
  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(400);

  const state14 = await getPendingStateUi(uiWin.webContents, VOUCHER_PENDING_14);
  const stats14 = deps.getVerifyStats();
  const bridgeCap14 = await readCapture(bridge);

  report.scenarios.push(
    assertScenario("Scenario 14 — Authentication failure", [
      { label: "state failed_permanent", pass: state14 === "failed_permanent", actual: state14 },
      { label: "authoritative HTTP === 0", pass: stats14.authoritativeHttp === 0, actual: stats14.authoritativeHttp },
      { label: "bridge sqlite upserts === 0", pass: bridgeCap14.sqliteUpserts === 0, actual: bridgeCap14.sqliteUpserts },
    ])
  );

  // Scenario 15 — Permanent rejection (company not allowed for token)
  await clearAllPendingUi(uiWin.webContents);
  await clearLanClientGateUi(uiWin.webContents);
  const denyTokenRec = accessTokens.createAccessToken(deps.userDataPath, {
    label: "Phase1B Verify Deny Company",
    allowedCompanyIds: ["other-company-not-verify"],
  });
  await installLanClientGateUi(uiWin.webContents, sharingPort, denyTokenRec.token);
  await deps.stopSharingOnly();
  const payload15 = voucherPayload(VOUCHER_PENDING_15, 951);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_15, payload15);
  await sleep(200);
  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(400);

  const state15 = await getPendingStateUi(uiWin.webContents, VOUCHER_PENDING_15);
  const stats15 = deps.getVerifyStats();

  report.scenarios.push(
    assertScenario("Scenario 15 — Permanent rejection", [
      { label: "state failed_permanent", pass: state15 === "failed_permanent", actual: state15 },
      { label: "authoritative HTTP === 0", pass: stats15.authoritativeHttp === 0, actual: stats15.authoritativeHttp },
    ])
  );

  // Scenario 16 — Success boundary crash recovery (skip delete then replay)
  await clearAllPendingUi(uiWin.webContents);
  await clearLanClientGateUi(uiWin.webContents);
  await installLanClientGateUi(uiWin.webContents, sharingPort, tokenRec.token);
  await enableVerifyLanClientReplayRoute(uiWin.webContents);
  await deps.stopSharingOnly();
  const payload16 = stableVoucherPayload(VOUCHER_PENDING_16, 961);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PENDING_16, payload16);
  await sleep(200);
  await deps.startSharedLocalServer();

  deps.resetVerifyStats();
  await resetCapture(bridge);
  await uiWin.webContents.executeJavaScript(`window.__plPhase1bVerifySkipPendingDeleteOnReplaySuccess = true;`, true);
  const stats16BeforeFirst = deps.getVerifyStats();
  await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(300);

  const pending16Mid = await countPendingAuthoritativeUi(uiWin.webContents);
  const stats16AfterFirst = deps.getVerifyStats();
  const firstHttpDelta = stats16AfterFirst.authoritativeHttp - stats16BeforeFirst.authoritativeHttp;

  await resetCapture(bridge);
  await uiWin.webContents.executeJavaScript(`window.__plPhase1bVerifySkipPendingDeleteOnReplaySuccess = false;`, true);
  const stats16BeforeSecond = deps.getVerifyStats();
  await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(600);

  const pending16Final = await countPendingAuthoritativeUi(uiWin.webContents);
  const stats16AfterSecond = deps.getVerifyStats();
  const secondHttpDelta = stats16AfterSecond.authoritativeHttp - stats16BeforeSecond.authoritativeHttp;
  const bridgeCap16Second = await readCapture(bridge);
  const exportIds16 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 16 — Success boundary crash recovery", [
      { label: "pending after first replay >= 1", pass: pending16Mid >= 1, actual: pending16Mid },
      { label: "first authoritative HTTP delta === 1", pass: firstHttpDelta === 1, actual: firstHttpDelta },
      { label: "second authoritative HTTP delta === 1", pass: secondHttpDelta === 1, actual: secondHttpDelta },
      { label: "second bridge sqlite upserts === 0", pass: bridgeCap16Second.sqliteUpserts === 0, actual: bridgeCap16Second.sqliteUpserts },
      { label: "pending queue count === 0", pass: pending16Final === 0, actual: pending16Final },
      { label: "export contains voucher", pass: exportIds16.includes(VOUCHER_PENDING_16), actual: exportIds16 },
    ])
  );

  // --- Milestone 4: plServerShared production LAN client routing (17–20) ---
  await clearAllPendingUi(uiWin.webContents);
  await installLanClientGateUi(uiWin.webContents, sharingPort, tokenRec.token);
  await seedPlServerSharedClientCompanyUi(uiWin.webContents);
  await sleep(200);

  // Scenario 17 — plServerShared client online save → authoritative HTTP
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  const payload17 = voucherPayload(VOUCHER_M4_17, 1717);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_M4_17, payload17);
  await sleep(800);

  const uiCap17 = await readCapture(uiWin.webContents);
  const bridgeCap17 = await readCapture(bridge);
  const stats17 = deps.getVerifyStats();
  const exportIds17 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 17 — plServerShared client authoritative online", [
      { label: "UI sqlite upserts === 0", pass: uiCap17.sqliteUpserts === 0, actual: uiCap17.sqliteUpserts },
      { label: "authoritative HTTP === 1", pass: stats17.authoritativeHttp === 1, actual: stats17.authoritativeHttp },
      { label: "mirror queue === 0", pass: uiCap17.mirrorQueues === 0, actual: uiCap17.mirrorQueues },
      { label: "bridge sqlite upserts >= 1", pass: bridgeCap17.sqliteUpserts >= 1, actual: bridgeCap17.sqliteUpserts },
      { label: "export contains voucher", pass: exportIds17.includes(VOUCHER_M4_17), actual: exportIds17 },
    ])
  );

  // Scenario 18 — plServerShared client offline → pending enqueue
  await clearAllPendingUi(uiWin.webContents);
  await deps.stopSharingOnly();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  const payload18 = voucherPayload(VOUCHER_M4_18, 1818);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_M4_18, payload18);
  await sleep(400);

  const pending18 = await countPendingAuthoritativeUi(uiWin.webContents);
  const uiCap18 = await readCapture(uiWin.webContents);
  const stats18 = deps.getVerifyStats();

  report.scenarios.push(
    assertScenario("Scenario 18 — plServerShared client offline pending", [
      { label: "pending queue count === 1", pass: pending18 === 1, actual: pending18 },
      { label: "UI sqlite upserts === 0", pass: uiCap18.sqliteUpserts === 0, actual: uiCap18.sqliteUpserts },
      { label: "mirror queue === 0", pass: uiCap18.mirrorQueues === 0, actual: uiCap18.mirrorQueues },
      { label: "authoritative HTTP === 0", pass: stats18.authoritativeHttp === 0, actual: stats18.authoritativeHttp },
    ])
  );

  // Scenario 19 — plServerShared reconnect → replay succeeds
  await deps.startSharedLocalServer();
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(800);

  const pending19 = await countPendingAuthoritativeUi(uiWin.webContents);
  const stats19 = deps.getVerifyStats();
  const exportIds19 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 19 — plServerShared reconnect replay", [
      { label: "pending queue count === 0", pass: pending19 === 0, actual: pending19 },
      { label: "authoritative HTTP === 1", pass: stats19.authoritativeHttp === 1, actual: stats19.authoritativeHttp },
      { label: "export contains voucher", pass: exportIds19.includes(VOUCHER_M4_18), actual: exportIds19 },
    ])
  );

  // Scenario 20 — plServerShared: mirror push not primary transport
  await clearAllPendingUi(uiWin.webContents);
  deps.resetVerifyStats();
  await resetCapture(uiWin.webContents);
  const payload20 = voucherPayload(VOUCHER_M4_20, 2020);
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_M4_20, payload20);
  await sleep(800);

  const uiCap20 = await readCapture(uiWin.webContents);
  const stats20 = deps.getVerifyStats();

  report.scenarios.push(
    assertScenario("Scenario 20 — plServerShared no mirror push on save", [
      { label: "mirror queue === 0", pass: uiCap20.mirrorQueues === 0, actual: uiCap20.mirrorQueues },
      { label: "authoritative HTTP === 1", pass: stats20.authoritativeHttp === 1, actual: stats20.authoritativeHttp },
    ])
  );

  // --- Milestone 5A: Read-path live pull (21–23) ---
  // Scenario 21 — Host write → client pull → client SQLite reflects Host
  deps.resetVerifyStats();
  await resetCapture(bridge);
  await resetCapture(uiWin.webContents);
  const payload21 = voucherPayload(VOUCHER_READ_21, 2101);
  await bridgeHostUpsert(deps.runInServerAppRenderer, VOUCHER_READ_21, payload21, true);
  await sleep(400);
  const exportIds21Host = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);
  const pull21 = await pullLiveSyncUi(uiWin.webContents);
  await sleep(200);
  const clientAfter21 = await getClientVoucherUi(uiWin.webContents, VOUCHER_READ_21);

  report.scenarios.push(
    assertScenario("Scenario 21 — Host write → client live pull", [
      { label: "host export contains voucher", pass: exportIds21Host.includes(VOUCHER_READ_21), actual: exportIds21Host },
      { label: "pull ok === true", pass: pull21?.ok === true, actual: pull21 },
      { label: "pull fullPull === true", pass: pull21?.fullPull === true, actual: pull21 },
      { label: "client voucher after pull", pass: Boolean(clientAfter21?.id === VOUCHER_READ_21), actual: clientAfter21 },
    ])
  );

  // Scenario 23 — Freshness: Host-only voucher visible on client after pull
  deps.resetVerifyStats();
  const payload23 = voucherPayload(VOUCHER_READ_23, 2301);
  await bridgeHostUpsert(deps.runInServerAppRenderer, VOUCHER_READ_23, payload23, true);
  await sleep(400);
  const clientBefore23 = await getClientVoucherUi(uiWin.webContents, VOUCHER_READ_23);
  const pull23 = await pullLiveSyncUi(uiWin.webContents);
  await sleep(200);
  const clientAfter23 = await getClientVoucherUi(uiWin.webContents, VOUCHER_READ_23);
  const exportIds23 = await exportVoucherIds(deps.runMirrorCollectionExportWithMeta);

  report.scenarios.push(
    assertScenario("Scenario 23 — Read freshness after Host write", [
      { label: "client missing voucher before pull", pass: clientBefore23 == null, actual: clientBefore23 },
      { label: "host export contains voucher", pass: exportIds23.includes(VOUCHER_READ_23), actual: exportIds23 },
      { label: "pull ok === true", pass: pull23?.ok === true, actual: pull23 },
      { label: "client voucher after pull", pass: Boolean(clientAfter23?.id === VOUCHER_READ_23), actual: clientAfter23 },
    ])
  );

  // Scenario 22 — Pull failure honesty when Host sharing unavailable
  await deps.stopSharingOnly();
  const pull22 = await pullLiveSyncUi(uiWin.webContents);
  await deps.startSharedLocalServer();
  await sleep(300);

  report.scenarios.push(
    assertScenario("Scenario 22 — Live pull failure returns ok:false", [
      { label: "pull ok === false", pass: pull22?.ok === false, actual: pull22 },
      { label: "pull fullPull === false", pass: pull22?.fullPull === false, actual: pull22 },
    ])
  );

  // --- LAN office pilot blockers (24–27) ---
  // Scenario 24 — H1: boot resume when userWantsRunning true (simulated crash/reboot)
  await deps.stopSharingOnly();
  deps.localAppServer.saveConfig(deps.userDataPath, { userWantsRunning: true });
  const st24Before = deps.localAppServer.getStatus(deps.userDataPath);
  await deps.resumeHostSharingAfterBootIfConfigured();
  await sleep(300);
  const st24After = deps.localAppServer.getStatus(deps.userDataPath);

  report.scenarios.push(
    assertScenario("Scenario 24 — H1 boot resume sharing when userWantsRunning", [
      { label: "userWantsRunning === true", pass: st24Before.userWantsRunning === true, actual: st24Before.userWantsRunning },
      { label: "sharing inactive before resume", pass: st24Before.sharingActive === false, actual: st24Before.sharingActive },
      { label: "app UI serving before resume", pass: st24Before.appUiServing === true, actual: st24Before.appUiServing },
      { label: "sharing active after resume", pass: st24After.sharingActive === true, actual: st24After.sharingActive },
    ])
  );

  // Scenario 25 — H1: explicit stop preserved (no auto resume)
  await deps.stopSharingOnly();
  deps.localAppServer.saveConfig(deps.userDataPath, { userWantsRunning: false });
  await deps.localAppServer.startStaticServer(deps.userDataPath, { forAppUi: true });
  const st25Before = deps.localAppServer.getStatus(deps.userDataPath);
  await deps.resumeHostSharingAfterBootIfConfigured();
  const st25After = deps.localAppServer.getStatus(deps.userDataPath);

  report.scenarios.push(
    assertScenario("Scenario 25 — H1 explicit stop not auto-resumed", [
      { label: "userWantsRunning === false", pass: st25Before.userWantsRunning === false, actual: st25Before.userWantsRunning },
      { label: "sharing inactive before", pass: st25Before.sharingActive === false, actual: st25Before.sharingActive },
      { label: "app UI serving before", pass: st25Before.appUiServing === true, actual: st25Before.appUiServing },
      { label: "sharing still inactive after", pass: st25After.sharingActive === false, actual: st25After.sharingActive },
    ])
  );

  // Scenario 26 — H2: tray offers restart whenever sharing off but app UI up
  deps.localAppServer.saveConfig(deps.userDataPath, { userWantsRunning: true });
  await deps.stopSharingOnly();
  const cfg26a = deps.localAppServer.loadConfig(deps.userDataPath);
  const st26a = deps.localAppServer.getStatus(deps.userDataPath);
  const tray26a = deps.shouldOfferTrayStartSharing(cfg26a, st26a);

  deps.localAppServer.saveConfig(deps.userDataPath, { userWantsRunning: false });
  const cfg26b = deps.localAppServer.loadConfig(deps.userDataPath);
  const st26b = deps.localAppServer.getStatus(deps.userDataPath);
  const tray26b = deps.shouldOfferTrayStartSharing(cfg26b, st26b);

  await deps.startSharedLocalServer();
  const cfg26c = deps.localAppServer.loadConfig(deps.userDataPath);
  const st26c = deps.localAppServer.getStatus(deps.userDataPath);
  const tray26c = deps.shouldOfferTrayStartSharing(cfg26c, st26c);

  report.scenarios.push(
    assertScenario("Scenario 26 — H2 tray restart when sharing inactive", [
      { label: "tray start when userWantsRunning true", pass: tray26a === true, actual: tray26a },
      { label: "tray start when userWantsRunning false (stopped)", pass: tray26b === true, actual: tray26b },
      { label: "tray start hidden when sharing active", pass: tray26c === false, actual: tray26c },
    ])
  );

  // Scenario 27 — P1: route_unavailable reaches failed_permanent after retry limit
  await clearAllPendingUi(uiWin.webContents);
  await installLanClientGateUi(uiWin.webContents, sharingPort, tokenRec.token);
  await enableVerifyLanClientReplayRoute(uiWin.webContents);
  await deps.stopSharingOnly();
  await lanClientUpsertVoucher(uiWin.webContents, VOUCHER_PILOT_ROUTE_LIMIT, voucherPayload(VOUCHER_PILOT_ROUTE_LIMIT, 2701));
  await sleep(300);
  const pending27Before = await countPendingAuthoritativeUi(uiWin.webContents);
  const bump27 = await setPendingRetryCountUi(uiWin.webContents, VOUCHER_PILOT_ROUTE_LIMIT, MAX_AUTO_RETRIES_PILOT);
  const drain27 = await drainPendingAuthoritativeUi(uiWin.webContents);
  await sleep(200);
  const state27 = await getPendingStateUi(uiWin.webContents, VOUCHER_PILOT_ROUTE_LIMIT);
  await deps.startSharedLocalServer();

  report.scenarios.push(
    assertScenario("Scenario 27 — P1 route_unavailable permanent after retry limit", [
      { label: "pending created", pass: pending27Before === 1, actual: pending27Before },
      { label: "retry count seeded", pass: bump27?.ok === true, actual: bump27 },
      { label: "state failed_permanent", pass: state27 === "failed_permanent", actual: state27 },
      { label: "permanentFailures >= 1", pass: (drain27?.permanentFailures ?? 0) >= 1, actual: drain27 },
    ])
  );

  // Scenario 28 — Local attachment ref survives host bridge write + export
  const attachPayload28 = {
    ...voucherPayload(VOUCHER_PILOT_ATTACH, 2801),
    fileUrls: ["local:phase1b-verify-attach-ref"],
    files: [],
  };
  await uiWin.webContents.executeJavaScript(
    `(async () => {
      if (typeof window.__plPhase1bVerifyUpsertVoucher !== "function") return { ok: false };
      return await window.__plPhase1bVerifyUpsertVoucher(
        ${JSON.stringify(COMPANY_ID)},
        ${JSON.stringify(VOUCHER_PILOT_ATTACH)},
        ${JSON.stringify(attachPayload28)}
      );
    })()`,
    true
  );
  await sleep(500);
  const exportOut28 = await deps.runMirrorCollectionExportWithMeta(COMPANY_ID, "vouchers");
  const docs28 =
    exportOut28 && typeof exportOut28 === "object" && Array.isArray(exportOut28.docs)
      ? exportOut28.docs
      : Array.isArray(exportOut28)
        ? exportOut28
        : [];
  const exportIds28 = docs28.map((d) => String(d?.id || "").trim()).filter(Boolean);
  const exportRow28 = docs28.find((d) => String(d?.id) === VOUCHER_PILOT_ATTACH);
  const exportUrls28 = Array.isArray(exportRow28?.fileUrls) ? exportRow28.fileUrls : [];

  report.scenarios.push(
    assertScenario("Scenario 28 — Local attachment ref survives host bridge export", [
      { label: "export contains voucher", pass: exportIds28.includes(VOUCHER_PILOT_ATTACH), actual: exportIds28 },
      {
        label: "export fileUrls contains local ref",
        pass: exportUrls28.some((u) => String(u).includes("local:phase1b-verify-attach-ref")),
        actual: exportUrls28,
      },
    ])
  );

  await clearLanClientGateUi(uiWin.webContents);
  await uiWin.webContents.executeJavaScript(
    `delete window.__plPhase1bVerifySimulateLanClientAuthoritativeRoute; delete window.__plPhase1bVerifyForceRecoverPendingSends; delete window.__plPhase1bVerifyPauseBackgroundAuthoritativeReplay;`,
    true
  );
  deps.localAppServer.saveConfig(deps.userDataPath, { userWantsRunning: true });
  await deps.startSharedLocalServer();

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

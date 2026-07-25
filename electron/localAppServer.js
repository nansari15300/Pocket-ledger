const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const handler = require("serve-handler");
const accessTokens = require("./localAppServerAccessTokens");
const { PL_MIRROR_PROTOCOL_VERSION, evaluateMirrorProtocol } = require("./plMirrorProtocol.cjs");
const {
  EXE_APP_UI_PORT_START,
  EXE_APP_UI_PORT_COUNT,
  consecutivePortCandidates,
} = require("./plWebPorts.cjs");
const { packagedStaticServeHeaders } = require("./packagedStaticHeaders.cjs");
const { fetchPublicIpAddress } = require("./fetchPublicIpAddress");
const plTraceLog = require("./plTraceLog");

const CONFIG_FILE = "pl-local-server-config.json";
const TOKEN_FILE = "pl-local-app-client-token.json";
const PERSISTED_PORT_FILE = "pl-electron-static-port.json";
const PL_CLIENT_HEADER = "x-pocket-ledger-app";
const PL_ACCESS_HEADER = "x-pocket-ledger-access";
const PL_ELECTRON_MARKER_HEADER = "x-pocket-ledger-client";
const PL_APP_ACCOUNT_HEADER = "x-pocket-ledger-app-account";
const PL_CLIENT_PING_HEADER = "x-pocket-ledger-client-ping-ms";
const PL_ELECTRON_MARKER_VALUE = "pocket-ledger-electron";

const DEFAULT_CONFIG = {
  /** Sharing port; packaged EXE keeps its localhost-only app UI on port 3000. */
  port: 3001,
  /** EXE BrowserView origin — set once on first bind; sharing port change iske saath login break nahi karta. */
  appUiPort: null,
  /** Starting PLServer from a fresh EXE must be reachable by LAN clients. */
  bindMode: "lan",
  autoStartOnBoot: false,
  /** Fresh install: sharing OFF until user taps Start server (or enables auto-start). */
  userWantsRunning: false,
  appRole: "both",
  remoteServerUrl: "",
  clientAccessToken: "",
  publicHost: "",
  requireRemoteAccessToken: false,
  selectedInviteUrls: [],
  sharedLocalCompanyIds: null,
  showServerSwitchInHeader: false,
};

let appUiServer = null;
let appUiServerPort = null;
let sharingServer = null;
let sharingServerPort = null;
let companyDeltaExportProvider = null;
let companyDeltaCollectionExportProvider = null;
let clientToken = null;
let staticPublicDir = "";
let isPackaged = false;
let rewriteReconciliationDocumentUrl = null;
let isAllowedFirebaseProxyTarget = null;
let listShareableCompaniesProvider = null;
let localCompanyAuthProvider = null;
let companyLoginMetaProvider = null;
let attachmentBlobProvider = null;
let attachmentBlobWriteProvider = null;
let companyDeltaPushProvider = null;
let authoritativeCompanyDocUpsertProvider = null;
let companyRegistryPatchProvider = null;
let mirrorHealthProvider = null;
const mirrorEventClients = new Set();
const serverClientStats = new Map();

function setDeltaHealthProvider(fn) {
  mirrorHealthProvider = typeof fn === "function" ? fn : null;
}

function setShareableCompaniesProvider(fn) {
  listShareableCompaniesProvider = typeof fn === "function" ? fn : null;
}

function setLocalCompanyAuthProvider(fn) {
  localCompanyAuthProvider = typeof fn === "function" ? fn : null;
}

function setCompanyLoginMetaProvider(fn) {
  companyLoginMetaProvider = typeof fn === "function" ? fn : null;
}

function setAttachmentBlobProvider(fn) {
  attachmentBlobProvider = typeof fn === "function" ? fn : null;
}

function setAttachmentBlobWriteProvider(fn) {
  attachmentBlobWriteProvider = typeof fn === "function" ? fn : null;
}

function setCompanyDeltaPushProvider(fn) {
  companyDeltaPushProvider = typeof fn === "function" ? fn : null;
}

function setAuthoritativeCompanyDocUpsertProvider(fn) {
  authoritativeCompanyDocUpsertProvider = typeof fn === "function" ? fn : null;
}

function setCompanyRegistryPatchProvider(fn) {
  companyRegistryPatchProvider = typeof fn === "function" ? fn : null;
}

function setCompanyDeltaExportProvider(fn) {
  companyDeltaExportProvider = typeof fn === "function" ? fn : null;
}

function setCompanyDeltaCollectionExportProvider(fn) {
  companyDeltaCollectionExportProvider = typeof fn === "function" ? fn : null;
}

const DELTA_EXPORT_HTTP_TIMEOUT_MS = {
  bundle: 95_000,
  vouchers: 125_000,
  collection: 50_000,
};

function deltaCollectionHttpTimeoutMs(collection) {
  return String(collection || "").trim() === "vouchers"
    ? DELTA_EXPORT_HTTP_TIMEOUT_MS.vouchers
    : DELTA_EXPORT_HTTP_TIMEOUT_MS.collection;
}

async function runDeltaExportProviderWithTimeout(providerPromise, timeoutMs, timeoutLabel) {
  let timer = null;
  try {
    return await Promise.race([
      providerPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${timeoutLabel}_timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function stubShareableCompaniesFromIds(allowedIds) {
  if (!Array.isArray(allowedIds) || allowedIds.length === 0) return [];
  return allowedIds.map((id) => ({
    id: String(id).trim(),
    name: String(id).trim(),
    storageOption: "local",
    ownerEmail: null,
  })).filter((row) => row.id);
}

function normalizeSharedLocalCompanyIds(raw) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const id of raw) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

function filterShareableByHostConfig(all, cfg) {
  const hostIds = normalizeSharedLocalCompanyIds(cfg && cfg.sharedLocalCompanyIds);
  if (hostIds === null) return all;
  if (!hostIds.length) return [];
  const allowed = new Set(hostIds);
  return all.filter((c) => c && c.id && allowed.has(String(c.id).trim()));
}

const SHAREABLE_COMPANIES_CACHE_MS = 4_000;
/** Remote gate clients: allow bridge + disk snapshot before falling back. */
const SHAREABLE_PROVIDER_TIMEOUT_MS = 8_000;
let shareableCompaniesCache = { atMs: 0, cfgKey: "", rows: null };

function normalizeAccountEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function requestAppAccountEmail(req) {
  const fromHeader = normalizeAccountEmail(headerValue(req, PL_APP_ACCOUNT_HEADER));
  if (fromHeader) return fromHeader;
  try {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    return normalizeAccountEmail(requestUrl.searchParams.get("appAccount"));
  } catch {
    return "";
  }
}

function cleanRemoteIp(req) {
  const raw = String(req?.socket?.remoteAddress || "").trim();
  return raw.replace(/^::ffff:/, "") || null;
}

function hashClientLabel(value) {
  const s = String(value || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function requestCompanyId(req, requestUrl) {
  try {
    const u = requestUrl || new URL(req.url || "/", "http://localhost");
    const fromQuery =
      u.searchParams.get("companyId") ||
      u.searchParams.get("company") ||
      u.searchParams.get("pl_company") ||
      "";
    if (String(fromQuery || "").trim()) return String(fromQuery).trim();
    const pathname = String(u.pathname || "");
    const match = pathname.match(/^\/__pl_company_(?:delta|mirror)\/([^/]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]).trim();
  } catch {
    /* stats only */
  }
  return "";
}

function companyNameForStats(companyId) {
  const cid = String(companyId || "").trim();
  if (!cid || !Array.isArray(shareableCompaniesCache.rows)) return null;
  const row = shareableCompaniesCache.rows.find((c) => String(c?.id || "").trim() === cid);
  return row?.name ? String(row.name) : null;
}

function requestClientPingMs(req, requestUrl) {
  const fromHeader = Number(headerValue(req, PL_CLIENT_PING_HEADER));
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return Math.round(fromHeader);
  try {
    const u = requestUrl || new URL(req.url || "/", "http://localhost");
    const fromQuery = Number(u.searchParams.get("clientPingMs"));
    if (Number.isFinite(fromQuery) && fromQuery >= 0) return Math.round(fromQuery);
  } catch {
    /* stats only */
  }
  return null;
}

function clientStatsIdentity(req, companyId = "") {
  const ip = cleanRemoteIp(req);
  const appEmail = requestAppAccountEmail(req);
  const userAgent = headerValue(req, "user-agent");
  const deviceFingerprint = `${ip || "unknown"}|${hashClientLabel(userAgent)}`;
  const companyKey = String(companyId || "").trim() || "no_company";
  let key = `${appEmail || "anon"}|${deviceFingerprint}|${companyKey}`;
  if (!appEmail) {
    for (const [existingKey, row] of serverClientStats.entries()) {
      if (row?.email && row?.deviceFingerprint === deviceFingerprint && (row.companyKey || "no_company") === companyKey) {
        key = existingKey;
        break;
      }
    }
  } else {
    const anonKey = `anon|${deviceFingerprint}|${companyKey}`;
    const anon = serverClientStats.get(anonKey);
    if (anon && !serverClientStats.has(key)) {
      serverClientStats.set(key, {
        ...anon,
        key,
        email: appEmail,
        user: appEmail.split("@")[0],
        device: anon.device || requestDeviceLabel(req),
      });
      serverClientStats.delete(anonKey);
    } else if (anon) {
      const prev = serverClientStats.get(key);
      serverClientStats.set(key, {
        ...prev,
        downloadBytes: Number(prev?.downloadBytes || 0) + Number(anon.downloadBytes || 0),
        uploadBytes: Number(prev?.uploadBytes || 0) + Number(anon.uploadBytes || 0),
        requestCount: Number(prev?.requestCount || 0) + Number(anon.requestCount || 0),
      });
      serverClientStats.delete(anonKey);
    }
  }
  return { key, ip, appEmail, deviceFingerprint, companyKey };
}

function requestDeviceLabel(req) {
  const ua = headerValue(req, "user-agent").toLowerCase();
  if (headerValue(req, PL_ELECTRON_MARKER_HEADER) === PL_ELECTRON_MARKER_VALUE) return "EXE";
  if (ua.includes("capacitor") || ua.includes("wv")) return "APK/WebView";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("chrome/")) return "Chrome";
  if (ua.includes("firefox/")) return "Firefox";
  return "Web";
}

function base64PayloadByteLength(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const comma = raw.indexOf(",");
  const base64 = (comma >= 0 ? raw.slice(comma + 1) : raw).replace(/\s+/g, "");
  if (!base64) return 0;
  try {
    return Buffer.byteLength(base64, "base64");
  } catch {
    return 0;
  }
}

function recordServerClientTraffic(req, downloadBytes = 0, options = {}) {
  const ip = cleanRemoteIp(req);
  const appEmail = requestAppAccountEmail(req);
  if (isRequestFromLocalhost(req) && !appEmail) return;
  if (!ip && !appEmail) return;
  const uploadBytes = options.countUploadBytes === true
    ? Math.max(0, Number(options.uploadBytes ?? req?.headers?.["content-length"] ?? 0))
    : 0;
  const companyId = String(options.companyId || requestCompanyId(req) || "").trim();
  const identity = clientStatsIdentity(req, companyId);
  const key = identity.key;
  const pingMs =
    Number.isFinite(Number(options.pingMs)) && Number(options.pingMs) >= 0
      ? Math.round(Number(options.pingMs))
      : requestClientPingMs(req);
  const prev = serverClientStats.get(key) || {
    key,
    email: appEmail || null,
    user: appEmail ? appEmail.split("@")[0] : null,
    ip,
    device: requestDeviceLabel(req),
    deviceFingerprint: identity.deviceFingerprint,
    companyKey: identity.companyKey,
    companyIds: [],
    companyNames: [],
    pingMs: null,
    downloadBytes: 0,
    uploadBytes: 0,
    requestCount: 0,
    lastSeenAtMs: 0,
  };
  const companyIds = Array.isArray(prev.companyIds) ? [...prev.companyIds] : [];
  const companyNames = Array.isArray(prev.companyNames) ? [...prev.companyNames] : [];
  if (companyId && !companyIds.includes(companyId)) companyIds.push(companyId);
  const companyName = companyNameForStats(companyId);
  if (companyName && !companyNames.includes(companyName)) companyNames.push(companyName);
  serverClientStats.set(key, {
    ...prev,
    email: appEmail || prev.email || null,
    user: appEmail ? appEmail.split("@")[0] : prev.user || null,
    ip: ip || prev.ip || null,
    device: prev.device || requestDeviceLabel(req),
    deviceFingerprint: identity.deviceFingerprint || prev.deviceFingerprint || null,
    companyKey: identity.companyKey || prev.companyKey || "no_company",
    companyIds,
    companyNames,
    pingMs: pingMs != null ? pingMs : prev.pingMs ?? null,
    downloadBytes: Number(prev.downloadBytes || 0) + Math.max(0, Number(downloadBytes || 0)),
    uploadBytes: Number(prev.uploadBytes || 0) + Math.max(0, Number(uploadBytes || 0)),
    requestCount: Number(prev.requestCount || 0) + 1,
    lastSeenAtMs: Date.now(),
  });
}

function recordServerClientDownload(req, downloadBytes = 0, options = {}) {
  const bytes = Math.max(0, Number(downloadBytes || 0));
  if (!bytes) return;
  const ip = cleanRemoteIp(req);
  const appEmail = requestAppAccountEmail(req);
  if (!ip && !appEmail) return;
  const key = clientStatsIdentity(req, options.companyId || requestCompanyId(req)).key;
  const prev = serverClientStats.get(key);
  if (!prev) {
    recordServerClientTraffic(req, bytes);
    return;
  }
  serverClientStats.set(key, {
    ...prev,
    downloadBytes: Number(prev.downloadBytes || 0) + bytes,
    lastSeenAtMs: Date.now(),
  });
}

function installServerClientDownloadMeter(req, res) {
  if (!req || !res || res.__plDownloadMeterInstalled) return;
  res.__plDownloadMeterInstalled = true;
  const originalEnd = res.end;
  res.end = function patchedEnd(chunk, encoding, cb) {
    try {
      let bytes = 0;
      if (Buffer.isBuffer(chunk)) bytes = chunk.length;
      else if (typeof chunk === "string") bytes = Buffer.byteLength(chunk, typeof encoding === "string" ? encoding : "utf8");
      else if (chunk instanceof Uint8Array) bytes = chunk.byteLength;
      recordServerClientDownload(req, bytes);
    } catch {
      /* telemetry only */
    }
    return originalEnd.call(this, chunk, encoding, cb);
  };
}

function listServerClientStats() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, row] of Array.from(serverClientStats.entries())) {
    if (Number(row?.lastSeenAtMs || 0) < cutoff) serverClientStats.delete(key);
  }
  return Array.from(serverClientStats.values()).sort(
    (a, b) => Number(b.lastSeenAtMs || 0) - Number(a.lastSeenAtMs || 0)
  );
}

function companyAllowsAppAccount(company, appEmail) {
  if (!company || !appEmail) return false;
  const email = normalizeAccountEmail(appEmail);
  if (!email) return false;
  const allowed = Array.isArray(company.accessEmails) ? company.accessEmails : [];
  const direct = [company.ownerEmail, company.accessAccount];
  if (direct.some((value) => normalizeAccountEmail(value) === email)) return true;
  if (allowed.some((value) => normalizeAccountEmail(value) === email)) return true;
  // Shared local user rows — accessEmails kabhi incomplete ho to bhi email-share match.
  const localUsers = Array.isArray(company.localCompanyUsers) ? company.localCompanyUsers : [];
  for (const user of localUsers) {
    if (normalizeAccountEmail(user?.shareEmail) === email) return true;
    const username = normalizeAccountEmail(user?.username);
    if (username.includes("@") && username === email) return true;
  }
  return false;
}

function publicCompanySummary(company, appEmail) {
  if (!company || typeof company !== "object") return company;
  const { accessEmails, ...publicRow } = company;
  void accessEmails;
  return { ...publicRow, accessAccount: appEmail };
}

function companyClientDataDeleteCommandsForAppAccount(rows, appEmail) {
  const email = normalizeAccountEmail(appEmail);
  if (!email || !Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const company of rows) {
    const commands = Array.isArray(company?.clientDataDeleteCommands)
      ? company.clientDataDeleteCommands
      : [];
    for (const raw of commands) {
      if (!raw || typeof raw !== "object") continue;
      const targetEmail = normalizeAccountEmail(raw.targetEmail);
      const companyId = String(raw.companyId || company?.id || "").trim();
      const id = String(raw.id || "").trim();
      const deleteAtMs = Number(raw.deleteAtMs);
      if (!id || !companyId || targetEmail !== email || !Number.isFinite(deleteAtMs)) continue;
      const key = `${companyId}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id,
        companyId,
        companyName: raw.companyName || company?.name || null,
        targetEmail,
        requestedByEmail: normalizeAccountEmail(raw.requestedByEmail) || null,
        requestedAtMs: Number.isFinite(Number(raw.requestedAtMs)) ? Number(raw.requestedAtMs) : deleteAtMs,
        deleteAtMs,
        source: raw.source === "online" ? "online" : "pl_server",
        reason: "unshare",
      });
    }
  }
  return out;
}

function shareableCompaniesCacheKey(cfg) {
  const hostIds = normalizeSharedLocalCompanyIds(cfg && cfg.sharedLocalCompanyIds);
  return JSON.stringify(hostIds ?? null);
}

async function invokeShareableCompaniesProvider() {
  if (!listShareableCompaniesProvider) return null;
  const providerStartedMs = Date.now();
  try {
    const rows = await Promise.race([
      listShareableCompaniesProvider(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("shareable_provider_timeout")), SHAREABLE_PROVIDER_TIMEOUT_MS)
      ),
    ]);
    plTraceLog.traceLog("PL-SERVER", "shareable_companies_provider_done", {
      ms: Date.now() - providerStartedMs,
      count: Array.isArray(rows) ? rows.length : 0,
    });
    return Array.isArray(rows) ? rows : null;
  } catch (e) {
    plTraceLog.traceLog("PL-SERVER", "shareable_companies_provider_failed", {
      ms: Date.now() - providerStartedMs,
      error: String(e?.message || e),
    });
    return null;
  }
}

async function shareableCompaniesForToken(allowedIds, cfg, options = {}) {
  const hostIds = normalizeSharedLocalCompanyIds(cfg && cfg.sharedLocalCompanyIds);
  const forceFresh = options && options.forceFresh === true;
  const idSet =
    Array.isArray(allowedIds) && allowedIds.length > 0
      ? new Set(allowedIds.map((x) => String(x || "").trim()).filter(Boolean))
      : null;
  const cacheKey = shareableCompaniesCacheKey(cfg);
  const now = Date.now();
  let all = [];
  if (
    !forceFresh &&
    shareableCompaniesCache.rows &&
    shareableCompaniesCache.cfgKey === cacheKey &&
    now - shareableCompaniesCache.atMs < SHAREABLE_COMPANIES_CACHE_MS
  ) {
    all = shareableCompaniesCache.rows;
  } else if (listShareableCompaniesProvider) {
    if (!forceFresh && !idSet && Array.isArray(hostIds) && hostIds.length > 0) {
      // Stale-while-revalidate: serve last good rows immediately.
      if (shareableCompaniesCache.rows && shareableCompaniesCache.cfgKey === cacheKey) {
        all = shareableCompaniesCache.rows;
      }
      void invokeShareableCompaniesProvider().then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          shareableCompaniesCache = { atMs: Date.now(), cfgKey: cacheKey, rows };
        }
      });
    } else {
      const rows = await invokeShareableCompaniesProvider();
      if (Array.isArray(rows) && rows.length > 0) {
        all = rows;
        shareableCompaniesCache = { atMs: now, cfgKey: cacheKey, rows: all };
      } else if (shareableCompaniesCache.rows && shareableCompaniesCache.cfgKey === cacheKey) {
        // Timeout / empty bridge — keep last good list (EXE/APK/web remote Test).
        all = shareableCompaniesCache.rows;
      } else if (Array.isArray(rows)) {
        all = rows;
        shareableCompaniesCache = { atMs: now, cfgKey: cacheKey, rows: all };
      }
    }
  }
  all = filterShareableByHostConfig(all, cfg);
  const filtered = all.filter((c) => {
    if (!c || !c.id) return false;
    const id = String(c.id).trim();
    if (!idSet) return true;
    return idSet.has(id);
  });
  if (filtered.length > 0) return filtered;
  // Email-less id stubs break remote app-account filter (empty Gate list) — only when we have nothing better.
  if (!idSet && Array.isArray(hostIds) && hostIds.length > 0) {
    return stubShareableCompaniesFromIds(hostIds);
  }
  if (idSet?.size) return stubShareableCompaniesFromIds([...idSet]);
  return filtered;
}

function setServerDeps(deps) {
  staticPublicDir = deps.staticPublicDir || "";
  isPackaged = !!deps.isPackaged;
  rewriteReconciliationDocumentUrl = deps.rewriteReconciliationDocumentUrl || null;
  isAllowedFirebaseProxyTarget = deps.isAllowedFirebaseProxyTarget || null;
}

function configPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE);
}

function tokenPath(userDataPath) {
  return path.join(userDataPath, TOKEN_FILE);
}

function readPersistedPackagedPort(userDataPath) {
  if (!isPackaged) return null;
  try {
    const f = path.join(userDataPath, PERSISTED_PORT_FILE);
    const n = Number(JSON.parse(fs.readFileSync(f, "utf8")).port);
    if (Number.isFinite(n) && n > 0 && n < 65536) return n;
  } catch (_) {}
  return null;
}

function writePersistedPackagedPort(userDataPath, port) {
  if (!isPackaged) return;
  try {
    const f = path.join(userDataPath, PERSISTED_PORT_FILE);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ port }), "utf8");
  } catch (_) {}
}

function normalizeAppRole(raw) {
  if (raw === "server" || raw === "client" || raw === "both") return raw;
  return "both";
}

function normalizeBindMode(raw) {
  if (raw === "lan" || raw === "internet") return raw;
  return "localhost";
}

function loadConfig(userDataPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(userDataPath), "utf8"));
    const port = Number(raw.port);
    const appUiPortRaw = Number(raw.appUiPort);
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      port: Number.isFinite(port) && port > 0 && port < 65536 ? port : DEFAULT_CONFIG.port,
      appUiPort:
        Number.isFinite(appUiPortRaw) && appUiPortRaw > 0 && appUiPortRaw < 65536 ? appUiPortRaw : null,
      bindMode: normalizeBindMode(raw.bindMode),
      autoStartOnBoot: raw.autoStartOnBoot === true,
      userWantsRunning: raw.userWantsRunning === true,
      appRole: normalizeAppRole(raw.appRole),
      remoteServerUrl: typeof raw.remoteServerUrl === "string" ? raw.remoteServerUrl.trim() : "",
      clientAccessToken: "",
      publicHost: typeof raw.publicHost === "string" ? raw.publicHost.trim() : "",
      requireRemoteAccessToken: false,
      selectedInviteUrls: Array.isArray(raw.selectedInviteUrls)
        ? raw.selectedInviteUrls.map((u) => String(u || "").trim()).filter(Boolean)
        : [],
      sharedLocalCompanyIds: normalizeSharedLocalCompanyIds(raw.sharedLocalCompanyIds),
      showServerSwitchInHeader: raw.showServerSwitchInHeader === true,
    };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(userDataPath, partial) {
  const prev = loadConfig(userDataPath);
  const next = { ...prev, ...partial };
  next.clientAccessToken = "";
  next.requireRemoteAccessToken = false;
  delete next["app" + "OnlyAccess"];
  if (partial && partial.appRole != null) next.appRole = normalizeAppRole(partial.appRole);
  if (partial && partial.bindMode != null) next.bindMode = normalizeBindMode(partial.bindMode);
  if (partial && Object.prototype.hasOwnProperty.call(partial, "sharedLocalCompanyIds")) {
    next.sharedLocalCompanyIds = normalizeSharedLocalCompanyIds(partial.sharedLocalCompanyIds);
  }
  /** Auto-start ON ⇒ har app open / reboot par sharing resume (installer update ke baad bhi). */
  if (partial && partial.autoStartOnBoot === true) {
    next.userWantsRunning = true;
  }
  try {
    fs.mkdirSync(path.dirname(configPath(userDataPath)), { recursive: true });
    fs.writeFileSync(configPath(userDataPath), JSON.stringify(next, null, 2), "utf8");
  } catch (_) {}
  return next;
}

function getOrCreateClientToken(userDataPath) {
  if (clientToken) return clientToken;
  try {
    const f = tokenPath(userDataPath);
    const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
    if (parsed && typeof parsed.token === "string" && parsed.token.length >= 16) {
      clientToken = parsed.token;
      return clientToken;
    }
  } catch (_) {}
  clientToken = require("crypto").randomBytes(24).toString("hex");
  try {
    fs.mkdirSync(path.dirname(tokenPath(userDataPath)), { recursive: true });
    fs.writeFileSync(tokenPath(userDataPath), JSON.stringify({ token: clientToken }), "utf8");
  } catch (_) {}
  return clientToken;
}

function shouldHostLocalServer(cfg) {
  return cfg.appRole === "server" || cfg.appRole === "both";
}

function shouldUseRemoteEntry(cfg) {
  if (cfg.appRole === "client") return Boolean(cfg.remoteServerUrl);
  return false;
}

let publicHostAutoDetectInflight = null;

function shouldAutoDetectPublicHost(cfg) {
  if (!shouldHostLocalServer(cfg)) return false;
  if (String(cfg.publicHost || "").trim()) return false;
  if (cfg.bindMode === "localhost") return false;
  return true;
}

function schedulePublicHostAutoDetect(userDataPath, cfg) {
  if (!shouldAutoDetectPublicHost(cfg)) return;
  if (publicHostAutoDetectInflight) return;
  publicHostAutoDetectInflight = fetchPublicIpAddress()
    .then((ip) => {
      if (!ip) return;
      const latest = loadConfig(userDataPath);
      if (String(latest.publicHost || "").trim()) return;
      if (!shouldAutoDetectPublicHost(latest)) return;
      saveConfig(userDataPath, { publicHost: ip });
    })
    .catch(() => {})
    .finally(() => {
      publicHostAutoDetectInflight = null;
    });
}

async function ensurePublicHostAutoDetected(userDataPath) {
  const cfg = loadConfig(userDataPath);
  if (!shouldAutoDetectPublicHost(cfg)) return String(cfg.publicHost || "").trim();
  const ip = await fetchPublicIpAddress();
  if (!ip) return "";
  const latest = loadConfig(userDataPath);
  if (String(latest.publicHost || "").trim()) return latest.publicHost;
  saveConfig(userDataPath, { publicHost: ip });
  return ip;
}

function resolveAppUiPort(userDataPath, cfg) {
  const fromCfg = Number(cfg?.appUiPort);
  if (Number.isFinite(fromCfg) && fromCfg > 0 && fromCfg < 65536) return fromCfg;
  const persisted = readPersistedPackagedPort(userDataPath);
  if (persisted != null) return persisted;
  return null;
}

function packagedAppUiPortCandidates(userDataPath, cfg) {
  const persisted = readPersistedPackagedPort(userDataPath);
  const resolved = resolveAppUiPort(userDataPath, cfg);
  return consecutivePortCandidates(
    EXE_APP_UI_PORT_START,
    EXE_APP_UI_PORT_COUNT,
    resolved,
    persisted
  );
}

function sharingPortCandidates(cfg) {
  const preferred = Number(cfg.port);
  return consecutivePortCandidates(
    EXE_APP_UI_PORT_START,
    EXE_APP_UI_PORT_COUNT,
    Number.isFinite(preferred) && preferred > 0 ? preferred : null
  );
}

function headerValue(req, name) {
  const h = req.headers[name] || req.headers[name.toLowerCase()];
  return typeof h === "string" ? h : Array.isArray(h) ? h[0] : "";
}

function isLocalHostName(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function isPrivateLanHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (isLocalHostName(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

function isElectronAppRequest(req) {
  const marker = headerValue(req, PL_ELECTRON_MARKER_HEADER);
  if (marker === PL_ELECTRON_MARKER_VALUE) return true;
  const legacy = headerValue(req, PL_CLIENT_HEADER);
  return typeof legacy === "string" && legacy.length >= 8;
}

function tokenFromRequest(req) {
  const fromHeader = headerValue(req, PL_ACCESS_HEADER).trim();
  if (fromHeader) return fromHeader;
  try {
    const u = new URL(req.url || "/", "http://localhost");
    const fromQuery = (u.searchParams.get("pl_access") || "").trim();
    if (fromQuery) return fromQuery;
  } catch {
    /* fall through */
  }
  const cookie = headerValue(req, "cookie");
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)pl_access=([^;]*)/);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1].trim());
      } catch {
        return match[1].trim();
      }
    }
  }
  return "";
}

function attachPlAccessTokenCookie(req, res, userDataPath) {
  const tok = tokenFromRequest(req);
  if (!tok || !accessTokens.validateAccessToken(userDataPath, tok)) return;
  const cookieVal = `pl_access=${encodeURIComponent(tok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", cookieVal);
  } else {
    const arr = Array.isArray(prev) ? prev : [String(prev)];
    res.setHeader("Set-Cookie", [...arr, cookieVal]);
  }
}

function isAccessTokenRequest(req, userDataPath) {
  const tok = tokenFromRequest(req);
  if (!tok) return false;
  return accessTokens.validateAccessToken(userDataPath, tok);
}

function matchShareableCompanyRow(requestCompanyId, rows) {
  const id = String(requestCompanyId || "").trim();
  if (!id || !Array.isArray(rows)) return null;
  const exact = rows.find((row) => String(row?.id || "").trim() === id);
  if (exact) return exact;
  const lastUnderscore = id.lastIndexOf("_");
  const slug = lastUnderscore > 0 ? id.slice(0, lastUnderscore) : "";
  if (slug) {
    const bySlug = rows.find((row) => String(row?.id || "").trim() === slug);
    if (bySlug) return bySlug;
    const byPrefix = rows.find((row) => String(row?.id || "").trim().startsWith(`${slug}_`));
    if (byPrefix) return byPrefix;
    const byName = rows.find((row) => {
      const name = String(row?.name || "").trim();
      return name === slug || name === id;
    });
    if (byName) return byName;
  }
  return rows.find((row) => String(row?.name || "").trim() === id) || null;
}

/**
 * Remote API auth for Gate / EXE / APK / browser clients.
 * - Localhost: always allowed
 * - Remote clients are restricted to companies explicitly owned/shared with their app account.
 */
function authorizeRemoteDataAccess(req, userDataPath, cfg, companyId) {
  if (isRequestFromLocalhost(req)) {
    const resolvedCompanyId = companyId ? String(companyId).trim() : null;
    return { ok: true, open: true, ids: null, rec: null, resolvedCompanyId };
  }
  void userDataPath;
  void cfg;
  const appEmail = requestAppAccountEmail(req);
  if (!appEmail) return { ok: false, error: "missing_app_account" };
  if (!companyId) return { ok: true, open: false, ids: null, rec: { label: appEmail }, resolvedCompanyId: null };
  const rows = Array.isArray(shareableCompaniesCache.rows) ? shareableCompaniesCache.rows : [];
  const company = matchShareableCompanyRow(companyId, rows);
  if (!company || !companyAllowsAppAccount(company, appEmail)) {
    return { ok: false, error: "company_not_shared_with_account" };
  }
  const resolvedCompanyId = String(company.id || "").trim();
  return { ok: true, open: false, ids: [resolvedCompanyId], rec: { label: appEmail }, resolvedCompanyId };
}

async function authorizeRemoteDataAccessFresh(req, userDataPath, cfg, companyId) {
  let auth = authorizeRemoteDataAccess(req, userDataPath, cfg, companyId);
  if (auth.ok) return auth;
  // Empty share cache / id mismatch: force list refresh then fuzzy-match again.
  if (auth.error === "missing_app_account") return auth;
  await shareableCompaniesForToken(null, cfg, { forceFresh: true });
  auth = authorizeRemoteDataAccess(req, userDataPath, cfg, companyId);
  if (auth.ok) return auth;
  // Client kabhi local stub id bhejta hai — fuzzy match after refresh.
  const appEmail = requestAppAccountEmail(req);
  if (!appEmail || !companyId) return auth;
  const rows = Array.isArray(shareableCompaniesCache.rows) ? shareableCompaniesCache.rows : [];
  const company = matchShareableCompanyRow(companyId, rows);
  if (company && companyAllowsAppAccount(company, appEmail)) {
    return {
      ok: true,
      open: false,
      ids: [String(company.id || "").trim()],
      rec: { label: appEmail },
      resolvedCompanyId: String(company.id || "").trim(),
    };
  }
  return auth;
}

function sendRemoteAuthFailure(response, auth, asOkEnvelope) {
  const error = auth && auth.error ? auth.error : "invalid_or_missing_token";
  response.statusCode = 403;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(
    asOkEnvelope ? JSON.stringify({ ok: false, error }) : JSON.stringify({ error })
  );
}

function broadcastPlMirrorEvent(companyId, collection, source, docs, extra) {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  if (!cid || !col) return;
  const payload = JSON.stringify({
    companyId: cid,
    collection: col,
    source: source || "pl_server_write",
    docs: Array.isArray(docs) ? docs : undefined,
    ...(extra && typeof extra === "object" ? extra : {}),
    at: Date.now(),
  });
  for (const client of Array.from(mirrorEventClients)) {
    if (!client || client.companyId !== cid) continue;
    try {
      client.response.write(`event: change\ndata: ${payload}\n\n`);
    } catch (_) {
      mirrorEventClients.delete(client);
      try {
        client.response.end();
      } catch (_) {}
    }
  }
}

function requestHostname(req) {
  try {
    const host = headerValue(req, "host");
    if (host) return host.split(":")[0];
    return new URL(req.url || "/", "http://localhost").hostname;
  } catch {
    return "";
  }
}

function isRequestFromLocalhost(req) {
  return isLocalHostName(requestHostname(req));
}

function blockedExternalBrowserHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pocket Ledger</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem"><h1>Pocket Ledger app only</h1><p>Open this address in the <strong>Pocket Ledger desktop app</strong>, not Chrome or Edge.</p></body></html>`;
}

function escapeHtmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remote browser / Gate client: token paste form — `?pl_access=` ya `pl_access` cookie se aage badhega. */
function blockedAccessTokenHtml(req, userDataPath) {
  let actionPath = "/";
  try {
    const u = new URL(req.url || "/", "http://localhost");
    actionPath = u.pathname || "/";
  } catch (_) {}
  const tok = tokenFromRequest(req);
  const showInvalid = !!tok && !accessTokens.validateAccessToken(userDataPath, tok);
  const invalidBlock = showInvalid
    ? `<p style="margin:0 0 1rem;padding:0.75rem 1rem;border-radius:0.5rem;background:#fef2f2;color:#991b1b;border:1px solid #fecaca">That access token is not valid. Copy the <strong>full</strong> token from the server PC (Settings → Server → Access tokens → Show / Copy), not the short preview.</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pocket Ledger — Access token</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f7fb; color: #0f172a; padding: 1.5rem; }
    .card { width: 100%; max-width: 28rem; background: #fff; border: 1px solid #dbe3ef; border-radius: 1rem; padding: 1.5rem; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 0.5rem; font-size: 1.35rem; }
    p { margin: 0 0 1rem; line-height: 1.5; color: #475569; font-size: 0.95rem; }
    label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
    input[type="password"], input[type="text"] { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 1rem; }
    button { margin-top: 1rem; width: 100%; padding: 0.7rem 1rem; border: 0; border-radius: 0.5rem; background: #2563eb; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .hint { margin-top: 1rem; font-size: 0.8rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Access token required</h1>
    <p>Ask the server owner for a Pocket Ledger access token, then paste it below to open this server in your browser.</p>
    ${invalidBlock}
    <form method="GET" action="${escapeHtmlText(actionPath)}">
      <label for="pl_access">Access token</label>
      <input id="pl_access" name="pl_access" type="password" autocomplete="off" placeholder="Paste token from server owner" required autofocus />
      <button type="submit">Continue</button>
    </form>
    <p class="hint">Pocket Ledger app users: you can also add the token under <strong>Settings → Server → Client</strong> or <strong>Gate → Server PCs</strong>.</p>
  </div>
</body>
</html>`;
}

function buildPublicServerListingUrl(publicHostRaw, port) {
  const ph = String(publicHostRaw || "").trim();
  if (!ph || !Number.isFinite(port) || port <= 0) return null;
  try {
    let href = ph;
    if (!/^https?:\/\//i.test(href)) href = `http://${href}`;
    const u = new URL(href);
    const hostname = u.hostname;
    if (!hostname) return null;
    const portPart = u.port || String(port);
    return `http://${hostname}:${portPart}/`;
  } catch (_) {
    const bare = ph
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .split("/")[0];
    if (!bare) return null;
    if (/^[\d.a-f:[\]-]+:\d+$/i.test(bare) || /^[^:/]+:\d+$/.test(bare)) {
      return `http://${bare}/`;
    }
    return `http://${bare}:${port}/`;
  }
}

function listLanUrls(port, publicHost) {
  const urls = [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name] || []) {
        if (!ni || ni.internal || ni.family !== "IPv4") continue;
        urls.push(`http://${ni.address}:${port}/`);
      }
    }
  } catch (_) {}
  const pub = buildPublicServerListingUrl(publicHost, port);
  if (pub) urls.push(pub);
  return [...new Set(urls)];
}

/** Gate page / dev browser: cross-origin fetch to `/__pl_access_context` (token in header). */
function applyPlAccessContextCors(req, res) {
  const origin = headerValue(req, "origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    `Accept, Content-Type, ${PL_ACCESS_HEADER}, ${PL_CLIENT_HEADER}, ${PL_ELECTRON_MARKER_HEADER}, ${PL_APP_ACCOUNT_HEADER}, ${PL_CLIENT_PING_HEADER}`
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

function shouldRedirectToRemoteClientUrl(req, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (requestUrl.searchParams.get("pl_remote_client") === "1") return false;
  /** Host hidden bridge — remote staff flag se ServerShareableCompaniesBridge skip na ho. */
  if (requestUrl.searchParams.get("pl_server_data_bridge") === "1") return false;
  const pathname = String(requestUrl.pathname || "/");
  if (pathname.startsWith("/__") || pathname.startsWith("/api/") || pathname === "/favicon.ico") return false;
  const assetExt = path.extname(pathname).toLowerCase();
  if (
    assetExt &&
    ![".html", ".htm"].includes(assetExt)
  ) {
    return false;
  }
  const accept = headerValue(req, "accept").toLowerCase();
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

const PL_SERVER_RELAY_TIMEOUT_MS = 180_000;
const PL_SERVER_RELAY_MAX_BINARY_BYTES = 12 * 1024 * 1024;
const PL_SERVER_RELAY_ALLOWED_PREFIXES = ["/__pl_", "/__firebase_blob_proxy"];
const PL_SERVER_RELAY_SHARING_PORTS = new Set(["3001", "37123"]);

function loopbackPlServerRelayUrl(raw) {
  try {
    const parsed = new URL(raw);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    if (!PL_SERVER_RELAY_SHARING_PORTS.has(port)) return null;
    if (!PL_SERVER_RELAY_ALLOWED_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))) return null;
    return `http://127.0.0.1:${port}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function isAllowedPlServerRelayUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return PL_SERVER_RELAY_ALLOWED_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

async function readJsonRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

/** EXE app UI port — same-origin relay for remote Gate / PL server HTTP (mirrors Next API route). */
async function handlePlServerHttpRelay(request, response) {
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  let payload;
  try {
    payload = await readJsonRequestBody(request);
  } catch {
    response.statusCode = 400;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }
  const url = String(payload.url || "").trim();
  if (!url || !isAllowedPlServerRelayUrl(url)) {
    response.statusCode = 400;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Invalid or disallowed PL server URL" }));
    return;
  }
  const method = String(payload.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    response.statusCode = 400;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Only GET and POST are supported" }));
    return;
  }
  const forwardHeaders = { Accept: "application/json" };
  const incoming = payload.headers && typeof payload.headers === "object" ? payload.headers : {};
  for (const [key, value] of Object.entries(incoming)) {
    const k = String(key || "").trim();
    if (!k || k.toLowerCase() === "host") continue;
    forwardHeaders[k] = String(value ?? "");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PL_SERVER_RELAY_TIMEOUT_MS);
  const loopbackUrl = loopbackPlServerRelayUrl(url);
  const candidateUrls = loopbackUrl && loopbackUrl !== url ? [loopbackUrl, url] : [url];
  let lastErr = null;
  try {
    for (const targetUrl of candidateUrls) {
      try {
        const upstream = await fetch(targetUrl, {
          method,
          headers: forwardHeaders,
          body: method === "POST" && payload.body != null ? String(payload.body) : undefined,
          cache: "no-store",
          signal: controller.signal,
        });
        if (payload.responseMode === "binary") {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          if (buffer.byteLength > PL_SERVER_RELAY_MAX_BINARY_BYTES) {
            response.statusCode = 413;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "Attachment too large for relay" }));
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              status: upstream.status,
              bodyBase64: buffer.toString("base64"),
              contentType: upstream.headers.get("content-type"),
            })
          );
          return;
        }
        const body = await upstream.text();
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ status: upstream.status, body }));
        return;
      } catch (err) {
        lastErr = err;
        if (targetUrl === candidateUrls[candidateUrls.length - 1]) break;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || "relay_fetch_failed"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /abort|timeout/i.test(msg);
    response.statusCode = 502;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        error: timedOut
          ? "Host server timed out — check that sharing is on and the address is reachable from the internet."
          : "Cannot reach host server — verify public IP, port forwarding, and firewall.",
      })
    );
  } finally {
    clearTimeout(timer);
  }
}

function createRequestHandler(userDataPath) {
  return async (request, response) => {
    const cfg = loadConfig(userDataPath);
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      if (
        requestUrl.pathname.startsWith("/__pl_") ||
        requestUrl.pathname === "/api/pl-server-http-relay"
      ) {
        if (requestUrl.pathname !== "/__pl_server_ping") {
          recordServerClientTraffic(request, 0);
        }
        plTraceLog.traceLog("PL-SERVER-HTTP", request.method || "GET", {
          path: requestUrl.pathname,
          remoteAddress: request.socket?.remoteAddress || null,
          origin: request.headers.origin || null,
        });
      }
      if (requestUrl.pathname === "/api/pl-server-http-relay") {
        await handlePlServerHttpRelay(request, response);
        return;
      }
      if (requestUrl.pathname === "/__firebase_blob_proxy") {
        const target = requestUrl.searchParams.get("url") || "";
        if (!isAllowedFirebaseProxyTarget || !isAllowedFirebaseProxyTarget(target)) {
          response.statusCode = 400;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end("Invalid target URL");
          return;
        }
        const upstream = await fetch(target, { method: "GET" });
        if (!upstream.ok) {
          response.statusCode = upstream.status;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end(`Upstream error: ${upstream.status}`);
          return;
        }
        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        response.statusCode = 200;
        response.setHeader("content-type", contentType);
        response.setHeader("cache-control", "private, max-age=60");
        const buffer = Buffer.from(await upstream.arrayBuffer());
        response.end(buffer);
        return;
      }
      if (requestUrl.pathname === "/__pl_server_ping") {
        const clientPingMs = requestClientPingMs(request, requestUrl);
        const pingCompanyId = requestCompanyId(request, requestUrl);
        if (clientPingMs != null || pingCompanyId) {
          recordServerClientTraffic(request, 0, { pingMs: clientPingMs, companyId: pingCompanyId });
        }
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        const sharingPort = sharingServerPort || appUiServerPort || cfg.port || null;
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(
          JSON.stringify({
            ok: true,
            ping: true,
            sharingPort,
            appUiPort: appUiServerPort || cfg.appUiPort || null,
            ts: Date.now(),
          })
        );
        plTraceLog.traceLog("PL-SERVER-HTTP", "ping_ok", {
          remoteAddress: request.socket?.remoteAddress || null,
          sharingPort,
        });
        return;
      }
      if (requestUrl.pathname === "/__pl_access_context") {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        const accessStartedMs = Date.now();
        plTraceLog.traceLog("PL-SERVER-HTTP", "access_context_start", {
          remoteAddress: request.socket?.remoteAddress || null,
        });
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, null);
        if (!auth.ok) {
          plTraceLog.traceLog("PL-SERVER-HTTP", "access_context_denied", {
            remoteAddress: request.socket?.remoteAddress || null,
            ms: Date.now() - accessStartedMs,
          });
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        if (auth.open) {
          const companies = await shareableCompaniesForToken(null, cfg, { forceFresh: true });
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(
            JSON.stringify({
              unrestricted: true,
              allowedCompanyIds: null,
              label: null,
              companies,
            })
          );
          plTraceLog.traceLog("PL-SERVER-HTTP", "access_context_ok", {
            remoteAddress: request.socket?.remoteAddress || null,
            ms: Date.now() - accessStartedMs,
            companyCount: Array.isArray(companies) ? companies.length : 0,
          });
          return;
        }
        const appEmail = requestAppAccountEmail(request);
        const shareableRows = await shareableCompaniesForToken(auth.ids, cfg, { forceFresh: true });
        const filterAudit = shareableRows.map((company) => {
          const allowed = Boolean(appEmail) && companyAllowsAppAccount(company, appEmail);
          const localUsers = Array.isArray(company?.localCompanyUsers) ? company.localCompanyUsers : [];
          return {
            id: String(company?.id || "").trim(),
            name: String(company?.name || "").trim(),
            appEmail,
            ownerEmail: normalizeAccountEmail(company?.ownerEmail),
            accessAccount: normalizeAccountEmail(company?.accessAccount),
            accessEmailCount: Array.isArray(company?.accessEmails) ? company.accessEmails.length : 0,
            localCompanyUserCount: localUsers.length,
            localCompanyUsers: localUsers.slice(0, 10).map((u) => ({
              username: String(u?.username || "").trim(),
              shareEmail: normalizeAccountEmail(u?.shareEmail),
              role: String(u?.role || "").trim(),
            })),
            allowed,
            reason: !appEmail
              ? "missing_app_email"
              : allowed
                ? "matched"
                : "email_not_in_owner_or_access_list",
          };
        });
        const companies = shareableRows
          .filter((company) => companyAllowsAppAccount(company, appEmail))
          .map((company) => publicCompanySummary(company, appEmail));
        const clientDataDeleteCommands = companyClientDataDeleteCommandsForAppAccount(shareableRows, appEmail);
        plTraceLog.traceLog("PL-SERVER-HTTP", "access_context_filter_audit", {
          remoteAddress: request.socket?.remoteAddress || null,
          appEmail,
          sourceCompanyCount: shareableRows.length,
          allowedCompanyCount: companies.length,
          dataDeleteCommandCount: clientDataDeleteCommands.length,
          rows: filterAudit.slice(0, 25),
        });
        const allowedCompanyIds = companies.map((company) => String(company.id));
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(
          JSON.stringify({
            label: auth.rec?.label || null,
            allowedCompanyIds,
            companies,
            clientDataDeleteCommands,
          })
        );
        plTraceLog.traceLog("PL-SERVER-HTTP", "access_context_ok", {
          remoteAddress: request.socket?.remoteAddress || null,
          ms: Date.now() - accessStartedMs,
          companyCount: Array.isArray(companies) ? companies.length : 0,
        });
        return;
      }
      if (
        requestUrl.pathname === "/__pl_company_delta_events" ||
        requestUrl.pathname === "/__pl_company_mirror_events"
      ) {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        const companyId = String(requestUrl.searchParams.get("companyId") || "").trim();
        if (!companyId) {
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "missing_company_id" }));
          return;
        }
        const auth = await authorizeRemoteDataAccessFresh(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          plTraceLog.traceLog("PL-SERVER-HTTP", "delta_events_denied", {
            remoteAddress: request.socket?.remoteAddress || null,
            companyId,
            appEmail: requestAppAccountEmail(request),
            error: auth.error || null,
          });
          sendRemoteAuthFailure(response, auth, true);
          return;
        }
        const sseCompanyId = String(auth.resolvedCompanyId || companyId).trim();
        const sseOrigin = headerValue(request, "origin");
        const sseCorsHeaders = {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "Access-Control-Allow-Origin": sseOrigin || "*",
          Vary: "Origin",
        };
        response.writeHead(200, sseCorsHeaders);
        if (typeof response.flushHeaders === "function") response.flushHeaders();
        response.write(`: connected ${Date.now()}\n\n`);
        response.write(`event: ready\ndata: ${JSON.stringify({ companyId: sseCompanyId, at: Date.now() })}\n\n`);
        const client = { companyId: sseCompanyId, response };
        mirrorEventClients.add(client);
        let closed = false;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(ping);
          mirrorEventClients.delete(client);
        };
        const ping = setInterval(() => {
          if (closed || response.writableEnded || response.destroyed) {
            cleanup();
            return;
          }
          try {
            response.write(`event: ping\ndata: ${Date.now()}\n\n`);
          } catch (_) {
            cleanup();
          }
        }, 25000);
        request.on("close", cleanup);
        response.on("close", cleanup);
        response.on("error", cleanup);
        return;
      }
      const mirrorCollectionMatch = requestUrl.pathname.match(
        /^\/__pl_company_(?:delta|mirror)\/([^/]+)\/([^/]+)\/?$/
      );
      if (
        requestUrl.pathname === "/__pl_delta_health" ||
        requestUrl.pathname === "/__pl_mirror_health"
      ) {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        const companyId = String(requestUrl.searchParams.get("companyId") || "").trim();
        if (!companyId) {
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "missing_company_id" }));
          return;
        }
        const auth = await authorizeRemoteDataAccessFresh(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, true);
          return;
        }
        if (!mirrorHealthProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "delta_health_unavailable" }));
          return;
        }
        try {
          const payload = await mirrorHealthProvider(companyId);
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(payload && typeof payload === "object" ? payload : { ok: false }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "delta_health_failed" }));
        }
        return;
      }
      if (mirrorCollectionMatch) {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        const companyId = decodeURIComponent(String(mirrorCollectionMatch[1] || "")).trim();
        const collection = decodeURIComponent(String(mirrorCollectionMatch[2] || "")).trim();
        if (!companyId || !collection) {
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "missing_company_or_collection" }));
          return;
        }
        const auth = await authorizeRemoteDataAccessFresh(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        const exportCompanyId = auth.resolvedCompanyId || companyId;
        if (!companyDeltaCollectionExportProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "delta_collection_export_unavailable" }));
          return;
        }
        try {
          const exportStartedMs = Date.now();
          plTraceLog.traceLog("PL-SERVER-HTTP", "delta_collection_export_start", {
            remoteAddress: request.socket?.remoteAddress || null,
            companyId,
            collection,
          });
          let docs;
          try {
            docs = await runDeltaExportProviderWithTimeout(
              companyDeltaCollectionExportProvider(exportCompanyId, collection),
              deltaCollectionHttpTimeoutMs(collection),
              "delta_collection_export"
            );
          } catch (exportErr) {
            if (String(exportErr?.message || "").includes("timeout")) {
              plTraceLog.traceLog("PL-SERVER-HTTP", "delta_collection_export_timeout", {
                remoteAddress: request.socket?.remoteAddress || null,
                companyId,
                collection,
                ms: Date.now() - exportStartedMs,
              });
              response.statusCode = 504;
              response.setHeader("content-type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "delta_collection_export_timeout" }));
              return;
            }
            throw exportErr;
          }
          plTraceLog.traceLog("PL-SERVER-HTTP", "delta_collection_export_done", {
            remoteAddress: request.socket?.remoteAddress || null,
            companyId,
            collection,
            ms: Date.now() - exportStartedMs,
            count: Array.isArray(docs) ? docs.length : null,
          });
          if (docs == null) {
            response.statusCode = 404;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "company_or_collection_not_found" }));
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ collection, docs }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "delta_collection_export_failed" }));
        }
        return;
      }
      const mirrorMatch = requestUrl.pathname.match(/^\/__pl_company_(?:delta|mirror)\/([^/]+)\/?$/);
      if (mirrorMatch) {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        const companyId = decodeURIComponent(String(mirrorMatch[1] || "")).trim();
        if (!companyId) {
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "missing_company_id" }));
          return;
        }
        const auth = await authorizeRemoteDataAccessFresh(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        const exportCompanyId = auth.resolvedCompanyId || companyId;
        if (!companyDeltaExportProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "delta_export_unavailable" }));
          return;
        }
        try {
          const exportStartedMs = Date.now();
          let bundle;
          try {
            bundle = await runDeltaExportProviderWithTimeout(
              companyDeltaExportProvider(exportCompanyId),
              DELTA_EXPORT_HTTP_TIMEOUT_MS.bundle,
              "delta_export"
            );
          } catch (exportErr) {
            if (String(exportErr?.message || "").includes("timeout")) {
              plTraceLog.traceLog("PL-SERVER-HTTP", "delta_export_timeout", {
                remoteAddress: request.socket?.remoteAddress || null,
                companyId,
                ms: Date.now() - exportStartedMs,
              });
              response.statusCode = 504;
              response.setHeader("content-type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "delta_export_timeout" }));
              return;
            }
            throw exportErr;
          }
          if (!bundle) {
            response.statusCode = 404;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "company_not_found" }));
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(bundle));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "delta_export_failed" }));
        }
        return;
      }
      if (requestUrl.pathname === "/__pl_attachment") {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        const companyIdParam = String(requestUrl.searchParams.get("companyId") || "").trim();
        const refParam = String(requestUrl.searchParams.get("ref") || "").trim();

        async function validatePlAttachmentAccess(companyId) {
          let auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          if (!auth.ok && auth.error === "company_not_shared_with_account") {
            const appEmail = requestAppAccountEmail(request);
            const freshRows = await shareableCompaniesForToken(null, cfg, { forceFresh: true });
            const company = Array.isArray(freshRows)
              ? freshRows.find((row) => String(row?.id || "").trim() === String(companyId).trim())
              : null;
            plTraceLog.traceLog("PL-SERVER-HTTP", "attachment_access_fresh_check", {
              remoteAddress: request.socket?.remoteAddress || null,
              companyId,
              appEmail,
              sourceCompanyCount: Array.isArray(freshRows) ? freshRows.length : 0,
              matchedCompany: Boolean(company),
              accessEmailCount: Array.isArray(company?.accessEmails) ? company.accessEmails.length : 0,
              allowed: Boolean(company && companyAllowsAppAccount(company, appEmail)),
            });
            if (company && companyAllowsAppAccount(company, appEmail)) {
              auth = { ok: true, open: false, ids: [String(companyId).trim()], rec: { label: appEmail } };
            }
          }
          if (!auth.ok) {
            plTraceLog.traceLog("PL-SERVER-HTTP", "attachment_access_denied", {
              remoteAddress: request.socket?.remoteAddress || null,
              companyId,
              appEmail: requestAppAccountEmail(request),
              error: auth.error || null,
              ref: refParam,
            });
            sendRemoteAuthFailure(response, auth, false);
            return false;
          }
          plTraceLog.traceLog("PL-SERVER-HTTP", "attachment_access_allowed", {
            remoteAddress: request.socket?.remoteAddress || null,
            companyId,
            appEmail: requestAppAccountEmail(request),
            ref: refParam,
          });
          return true;
        }

        if (request.method === "POST") {
          let body = {};
          try {
            body = await readJsonBody(request);
          } catch (_) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "invalid_json" }));
            return;
          }
          const companyId = String(body.companyId || companyIdParam || "").trim();
          const id = String(body.id || refParam || "").trim();
          const base64 = String(body.base64 || body.blob || "").trim();
          if (!companyId || !id || !base64) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_fields" }));
            return;
          }
          if (!(await validatePlAttachmentAccess(companyId))) return;
          if (!attachmentBlobWriteProvider) {
            response.statusCode = 503;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "attachment_write_unavailable" }));
            return;
          }
          try {
            const result = await attachmentBlobWriteProvider(companyId, {
              id,
              base64,
              sha256Hex: body.sha256Hex || body.sha256,
              contentType: body.contentType,
              fileName: body.fileName,
              storagePathPrefix: body.storagePathPrefix,
              docPath: body.docPath,
              field: body.field,
            });
            const out = result && typeof result === "object" ? result : { ok: false, error: "write_failed" };
            if (!out.ok) {
              response.statusCode = 500;
              response.setHeader("content-type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ ok: false, error: String(out.error || "attachment_write_failed") }));
              return;
            }
            response.statusCode = 200;
            response.setHeader("content-type", "application/json; charset=utf-8");
            recordServerClientTraffic(request, 0, {
              companyId,
              countUploadBytes: true,
              uploadBytes: base64PayloadByteLength(base64),
            });
            response.end(JSON.stringify({ ok: true, deduped: out.deduped === true }));
          } catch (_) {
            response.statusCode = 500;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "attachment_write_failed" }));
          }
          return;
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        const companyId = companyIdParam;
        const ref = refParam;
        if (!companyId || !ref) {
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "missing_fields" }));
          return;
        }
        if (!(await validatePlAttachmentAccess(companyId))) return;
        if (!attachmentBlobProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "attachment_read_unavailable" }));
          return;
        }
        try {
          const payload = await attachmentBlobProvider(companyId, ref);
          if (!payload || !payload.buffer || !Buffer.isBuffer(payload.buffer) || payload.buffer.length <= 0) {
            response.statusCode = 404;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "attachment_not_found" }));
            return;
          }
          if (request.method === "HEAD") {
            response.statusCode = 200;
            response.setHeader(
              "content-type",
              String(payload.contentType || "application/octet-stream")
            );
            response.setHeader("content-length", String(payload.buffer.length));
            response.setHeader("cache-control", "private, max-age=120");
            response.end();
            return;
          }
          response.statusCode = 200;
          response.setHeader(
            "content-type",
            String(payload.contentType || "application/octet-stream")
          );
          response.setHeader("content-length", String(payload.buffer.length));
          response.setHeader("cache-control", "private, max-age=120");
          response.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Length");
          recordServerClientDownload(request, payload.buffer.length, { companyId });
          response.end(payload.buffer);
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "attachment_read_failed" }));
        }
        return;
      }
      if (
        requestUrl.pathname === "/__pl_company_delta_push" ||
        requestUrl.pathname === "/__pl_company_mirror_push"
      ) {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const body = await readJsonBody(request);
          const companyId = String(body.companyId || "").trim();
          const collection = String(body.collection || "").trim();
          const docs = Array.isArray(body.docs) ? body.docs : [];
          if (!companyId || !collection || !docs.length) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_fields" }));
            return;
          }
          const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          if (!auth.ok) {
            sendRemoteAuthFailure(response, auth, true);
            return;
          }
          const protoEval = evaluateMirrorProtocol(body.mirrorProtocol, PL_MIRROR_PROTOCOL_VERSION);
          if (protoEval.action === "reject") {
            // Older cached browser bundles can still send the same delta doc shape.
            // Accept the write and avoid returning `mirrorProtocol` so those clients don't keep the queue stuck.
            console.warn("[DeltaProtocol] accepting legacy push", protoEval.code, protoEval.message || "");
          }
          if (protoEval.action === "warn") {
            console.warn("[DeltaProtocol]", protoEval.code, protoEval.message || "");
          }
          if (!companyDeltaPushProvider) {
            response.statusCode = 503;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "delta_push_unavailable" }));
            return;
          }
          const hostSelfPublish = body.hostSelfPublish === true;
          const result = await companyDeltaPushProvider(companyId, collection, docs, { hostSelfPublish });
          if (result && typeof result === "object" && result.ok !== false) {
            broadcastPlMirrorEvent(
              companyId,
              collection,
              hostSelfPublish ? "pl_host_self_publish" : "pl_client_push",
              hostSelfPublish ? docs : undefined
            );
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(result && typeof result === "object" ? result : { ok: true }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "delta_push_failed" }));
        }
        return;
      }
      if (requestUrl.pathname === "/__pl_company_meta_bump") {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const body = await readJsonBody(request);
          const companyId = String(body.companyId || "").trim();
          if (!companyId) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_company_id" }));
            return;
          }
          const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          if (!auth.ok) {
            sendRemoteAuthFailure(response, auth, true);
            return;
          }
          broadcastPlMirrorEvent(companyId, "company_meta", "pl_host_company_meta", undefined, {
            company: body.company && typeof body.company === "object" ? body.company : undefined,
          });
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ ok: true }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "company_meta_bump_failed" }));
        }
        return;
      }
      if (requestUrl.pathname === "/__pl_company_registry_patch") {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const body = await readJsonBody(request);
          const companyId = String(body.companyId || "").trim();
          const customUnits = Array.isArray(body.customUnits)
            ? body.customUnits.filter((x) => typeof x === "string" && String(x).trim())
            : [];
          if (!companyId || !customUnits.length) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_fields" }));
            return;
          }
          const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          if (!auth.ok) {
            sendRemoteAuthFailure(response, auth, true);
            return;
          }
          if (!companyRegistryPatchProvider) {
            response.statusCode = 503;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "registry_patch_unavailable" }));
            return;
          }
          const result = await companyRegistryPatchProvider(companyId, { customUnits });
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(result && typeof result === "object" ? result : { ok: true }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "registry_patch_failed" }));
        }
        return;
      }
      if (requestUrl.pathname === "/__pl_authoritative_company_doc_upsert") {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const body = await readJsonBody(request);
          const companyId = String(body.companyId || "").trim();
          const collectionName = String(body.collectionName || "").trim();
          const docId = String(body.docId || "").trim();
          const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : null;
          if (!companyId || !collectionName || !docId || !data) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_fields" }));
            return;
          }
          const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          if (!auth.ok) {
            sendRemoteAuthFailure(response, auth, true);
            return;
          }
          if (!authoritativeCompanyDocUpsertProvider) {
            response.statusCode = 503;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "authoritative_upsert_unavailable" }));
            return;
          }
          const payload = {
            companyId,
            collectionName,
            docId,
            data,
            notify: body.notify !== false,
            skipCloudSyncEnqueue: body.skipCloudSyncEnqueue,
            skipPlanMutationGate: body.skipPlanMutationGate,
            force: body.force,
          };
          const result = await authoritativeCompanyDocUpsertProvider(payload);
          if (result && typeof result === "object" && result.ok !== false) {
            broadcastPlMirrorEvent(companyId, collectionName, "pl_authoritative_upsert");
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(result && typeof result === "object" ? result : { ok: true }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "authoritative_upsert_failed" }));
        }
        return;
      }
      if (requestUrl.pathname === "/__pl_company_login_meta") {
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        const companyId = String(requestUrl.searchParams.get("companyId") || "").trim();
        const appEmail = String(requestUrl.searchParams.get("appEmail") || "").trim();
        if (!companyId) {
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "missing_company_id" }));
          return;
        }
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        if (!companyLoginMetaProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "server_login_meta_unavailable" }));
          return;
        }
        try {
          const meta = await companyLoginMetaProvider(companyId, appEmail || null);
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify(meta && typeof meta === "object" ? meta : { requiresLogin: true, usernameHint: null }));
        } catch (_) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "login_meta_failed" }));
        }
        return;
      }
      if (requestUrl.pathname === "/__pl_company_login") {
        console.log("[PL-SERVER-LOGIN]", "request_received", {
          method: request.method,
          origin: request.headers.origin || null,
          remoteAddress: request.socket?.remoteAddress || null,
        });
        plTraceLog.traceLog("PL-SERVER-HTTP", "company_login_start", {
          remoteAddress: request.socket?.remoteAddress || null,
          origin: request.headers.origin || null,
        });
        applyPlAccessContextCors(request, response);
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
          return;
        }
        try {
          const body = await readJsonBody(request);
          const companyId = String(body.companyId || "").trim();
          const username = String(body.username || "").trim();
          const password = String(body.password || "").trim();
          console.log("[PL-SERVER-LOGIN]", "body_parsed", {
            companyId,
            username,
            passwordPresent: Boolean(password),
          });
          if (!companyId) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_company_id" }));
            return;
          }
          const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          console.log("[PL-SERVER-LOGIN]", "remote_access_checked", {
            companyId,
            ok: auth.ok,
            reason: auth.reason || null,
          });
          if (!auth.ok) {
            sendRemoteAuthFailure(response, auth, true);
            return;
          }
          if (!localCompanyAuthProvider) {
            console.warn("[PL-SERVER-LOGIN]", "provider_missing", { companyId });
            response.statusCode = 503;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "server_login_unavailable" }));
            return;
          }
          console.log("[PL-SERVER-LOGIN]", "provider_start", { companyId, username });
          plTraceLog.traceLog("PL-SERVER-HTTP", "company_login_provider_start", { companyId, username });
          const authResult = await Promise.race([
            localCompanyAuthProvider(companyId, username, password),
            new Promise((resolve) =>
              setTimeout(() => resolve({ ok: false, error: "server_login_provider_timeout" }), 60000)
            ),
          ]);
          console.log("[PL-SERVER-LOGIN]", "provider_done", {
            companyId,
            ok: authResult?.ok === true,
            error: authResult?.error || null,
            hasToken: Boolean(authResult?.token),
            hasUser: Boolean(authResult?.user),
          });
          plTraceLog.traceLog("PL-SERVER-HTTP", "company_login_provider_done", {
            companyId,
            ok: authResult?.ok === true,
            error: authResult?.error || null,
          });
          if (!authResult || authResult.ok !== true) {
            response.statusCode = 401;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(
              JSON.stringify({
                ok: false,
                error: String(authResult?.error || "Invalid username or password"),
              })
            );
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(
            JSON.stringify({
              ok: true,
              token: authResult.token,
              user: authResult.user,
            })
          );
          return;
        } catch (err) {
          console.warn("[PL-SERVER-LOGIN]", "handler_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          response.statusCode = 400;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "bad_request" }));
          return;
        }
      }
    } catch {
      /* fall through */
    }

    const fromLocalhost = isRequestFromLocalhost(request);
    const isServerRole = cfg.appRole === "server" || cfg.appRole === "both";

    if (isServerRole && !cfg.userWantsRunning && !fromLocalhost && !isElectronAppRequest(request)) {
      response.statusCode = 503;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        "<!DOCTYPE html><html><body style=\"font-family:system-ui;padding:2rem\"><h1>Server stopped</h1><p>The owner turned off remote sharing. Try again later.</p></body></html>"
      );
      return;
    }

    attachPlAccessTokenCookie(request, response, userDataPath);

    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      if (rewriteReconciliationDocumentUrl) {
        const rewritten = rewriteReconciliationDocumentUrl(requestUrl);
        if (rewritten) {
          request = Object.assign({}, request, { url: rewritten });
        }
      }
    } catch {
      /* fall through */
    }

    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      if (shouldRedirectToRemoteClientUrl(request, requestUrl)) {
        requestUrl.searchParams.set("pl_remote_client", "1");
        response.statusCode = 302;
        response.setHeader("location", `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`);
        response.setHeader("cache-control", "no-store");
        response.end();
        return;
      }
    } catch {
      /* serve normally */
    }

    return handler(request, response, {
      public: staticPublicDir,
      cleanUrls: true,
      headers: packagedStaticServeHeaders(isPackaged),
    });
  };
}

function forceCloseHttpServer(server) {
  try {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
  } catch (_) {}
}

function closeHttpServerInstance(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const forceTimer = setTimeout(finish, 1500);
    forceCloseHttpServer(server);
    try {
      server.close(() => {
        clearTimeout(forceTimer);
        finish();
      });
    } catch (_) {
      clearTimeout(forceTimer);
      finish();
    }
  });
}

function stopSharingServer() {
  if (!sharingServer) return Promise.resolve();
  const server = sharingServer;
  sharingServer = null;
  sharingServerPort = null;
  return closeHttpServerInstance(server);
}

function stopAppUiServer() {
  if (!appUiServer) return Promise.resolve();
  const server = appUiServer;
  appUiServer = null;
  appUiServerPort = null;
  return closeHttpServerInstance(server);
}

function stopStaticServer() {
  return Promise.all([stopSharingServer(), stopAppUiServer()]).then(() => undefined);
}

function listenHostForConfig(cfg) {
  if (!cfg.userWantsRunning) return "127.0.0.1";
  return cfg.bindMode === "localhost" ? "127.0.0.1" : "0.0.0.0";
}

function listenOnPort(server, port, host) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      server.removeAllListeners("error");
      const addressInfo = server.address();
      if (!addressInfo || typeof addressInfo === "string") {
        reject(new Error("Unable to resolve static server port."));
        return;
      }
      resolve(addressInfo.port);
    };
    server.removeAllListeners("error");
    server.once("error", (err) => reject(err));
    server.listen(port, host, finish);
  });
}

function tryListenWithCandidates(server, candidates, host) {
  return new Promise((resolve, reject) => {
    let candidateIndex = 0;
    const tryNext = () => {
      if (candidateIndex >= candidates.length) {
        reject(new Error("PL_PACKAGED_STATIC_PORT_EXHAUSTED"));
        return;
      }
      const port = candidates[candidateIndex++];
      server.removeAllListeners("error");
      server.once("error", (err) => {
        if (err && err.code === "EADDRINUSE") {
          tryNext();
          return;
        }
        reject(err);
      });
      server.listen(port, host, () => {
        server.removeAllListeners("error");
        const addressInfo = server.address();
        if (!addressInfo || typeof addressInfo === "string") {
          reject(new Error("Unable to resolve static server port."));
          return;
        }
        resolve(addressInfo.port);
      });
    };
    tryNext();
  });
}

function startAppUiServer(userDataPath) {
  if (appUiServer && appUiServerPort) {
    return Promise.resolve(appUiServerPort);
  }
  const cfg = loadConfig(userDataPath);
  if (!shouldHostLocalServer(cfg)) {
    return Promise.reject(new Error("PL_LOCAL_SERVER_ROLE_CLIENT_ONLY"));
  }
  appUiServer = http.createServer(createRequestHandler(userDataPath));
  const candidates = isPackaged
    ? packagedAppUiPortCandidates(userDataPath, cfg)
    : [resolveAppUiPort(userDataPath, cfg) || cfg.port || 3000];
  return tryListenWithCandidates(appUiServer, candidates, "127.0.0.1").then((port) => {
    appUiServerPort = port;
    writePersistedPackagedPort(userDataPath, port);
    if (Number(cfg.appUiPort) !== port) {
      saveConfig(userDataPath, { appUiPort: port });
    }
    plTraceLog.traceLog("PL-SERVER", "app_ui_listening", { port, host: "127.0.0.1" });
    return port;
  });
}

function sharingServerMatchesConfig(cfg) {
  if (!sharingServer || !sharingServerPort) return false;
  const expectedHost = listenHostForConfig(cfg);
  const addr = sharingServer.address();
  if (!addr || typeof addr === "string") return false;
  const hostOk =
    addr.address === expectedHost ||
    (expectedHost === "0.0.0.0" && (addr.address === "::" || addr.address === "0.0.0.0"));
  // A busy configured port may legitimately bind to the next packaged candidate.
  return hostOk && Number(addr.port) === Number(sharingServerPort);
}

function startSharingServer(userDataPath) {
  const cfg = loadConfig(userDataPath);
  if (!shouldHostLocalServer(cfg)) {
    return Promise.reject(new Error("PL_LOCAL_SERVER_ROLE_CLIENT_ONLY"));
  }
  if (!cfg.userWantsRunning) {
    return Promise.reject(new Error("PL_LOCAL_SERVER_STOPPED"));
  }
  if (sharingServerMatchesConfig(cfg)) {
    return Promise.resolve(sharingServerPort);
  }
  return stopSharingServer().then(() => {
    sharingServer = http.createServer(createRequestHandler(userDataPath));
    const host = listenHostForConfig(cfg);
    const candidates = sharingPortCandidates(cfg);
    return tryListenWithCandidates(sharingServer, candidates, host).then((port) => {
      sharingServerPort = port;
      plTraceLog.traceLog("PL-SERVER", "sharing_listening", { port, host, configuredPort: cfg.port });
      // Saved `cfg.port` mat badlo — busy port par fallback se refresh pe user ka port reset na ho.
      return port;
    });
  });
}

function startStaticServer(userDataPath, options = {}) {
  if (options.forAppUi) {
    return startAppUiServer(userDataPath);
  }
  return startSharingServer(userDataPath);
}

async function restartSharingServer(userDataPath) {
  await stopSharingServer();
  const cfg = loadConfig(userDataPath);
  if (!shouldHostLocalServer(cfg) || !cfg.userWantsRunning) {
    return null;
  }
  await ensurePublicHostAutoDetected(userDataPath);
  return startSharingServer(userDataPath);
}

function getAppUiServerPort() {
  return appUiServerPort;
}

function getSharingServerPort() {
  return sharingServerPort;
}

function getStaticServerPort() {
  return appUiServerPort;
}

function getServerListenAddress() {
  if (sharingServer && sharingServerPort) {
    const addr = sharingServer.address();
    if (addr && typeof addr !== "string") return { host: addr.address, port: addr.port };
  }
  if (appUiServer && appUiServerPort) {
    const addr = appUiServer.address();
    if (addr && typeof addr !== "string") return { host: addr.address, port: addr.port };
  }
  return null;
}

function normalizeRemoteServerUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    if (!u.hostname) return "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "";
    return u.origin + "/";
  } catch {
    return "";
  }
}

async function restartStaticServer(userDataPath, options = {}) {
  if (options.forAppUi) {
    await stopAppUiServer();
    return startAppUiServer(userDataPath);
  }
  return restartSharingServer(userDataPath);
}

function getStatus(userDataPath) {
  const cfg = loadConfig(userDataPath);
  schedulePublicHostAutoDetect(userDataPath, cfg);
  const hosting = shouldHostLocalServer(cfg);
  const appUiUp = Boolean(appUiServer && appUiServerPort);
  const sharingUp = Boolean(sharingServer && sharingServerPort && cfg.userWantsRunning);
  const resolvedAppUiPort = appUiServerPort || resolveAppUiPort(userDataPath, cfg);
  const sharingPort = sharingUp ? sharingServerPort : null;
  return {
    running: sharingUp,
    appUiServing: appUiUp,
    sharingActive: sharingUp,
    port: sharingPort || resolvedAppUiPort || null,
    appUiPort: resolvedAppUiPort || null,
    sharingPort,
    configuredPort: cfg.port,
    bindMode: cfg.bindMode,
    autoStartOnBoot: cfg.autoStartOnBoot,
    userWantsRunning: cfg.userWantsRunning,
    appRole: cfg.appRole,
    remoteServerUrl: cfg.remoteServerUrl,
    publicHost: cfg.publicHost,
    requireRemoteAccessToken: cfg.requireRemoteAccessToken,
    urls:
      sharingPort && hosting && cfg.userWantsRunning
        ? listLanUrls(sharingPort, cfg.publicHost)
        : appUiUp && hosting
          ? [`http://127.0.0.1:${resolvedAppUiPort}/`, `http://localhost:${resolvedAppUiPort}/`]
          : [],
    clientHeader: PL_CLIENT_HEADER,
    accessHeader: PL_ACCESS_HEADER,
    electronMarkerHeader: PL_ELECTRON_MARKER_HEADER,
    clients: listServerClientStats(),
    portForwardHint:
      cfg.bindMode !== "localhost"
        ? "On your router, forward the external TCP port to this PC's LAN IP and server port. Allow the port in Windows Firewall."
        : null,
  };
}

function applyLoginItemSettings(electronApp, autoStartOnBoot) {
  try {
    electronApp.setLoginItemSettings({
      openAtLogin: !!autoStartOnBoot,
      openAsHidden: false,
    });
  } catch (_) {}
}

module.exports = {
  PL_CLIENT_HEADER,
  PL_ACCESS_HEADER,
  PL_ELECTRON_MARKER_HEADER,
  PL_ELECTRON_MARKER_VALUE,
  setServerDeps,
  setShareableCompaniesProvider,
  setCompanyLoginMetaProvider,
  setLocalCompanyAuthProvider,
  setAttachmentBlobProvider,
  setAttachmentBlobWriteProvider,
  setCompanyDeltaPushProvider,
  setCompanyMirrorPushProvider: setCompanyDeltaPushProvider,
  setAuthoritativeCompanyDocUpsertProvider,
  setCompanyRegistryPatchProvider,
  setCompanyDeltaExportProvider,
  setCompanyMirrorExportProvider: setCompanyDeltaExportProvider,
  setCompanyDeltaCollectionExportProvider,
  setCompanyMirrorCollectionExportProvider: setCompanyDeltaCollectionExportProvider,
  setDeltaHealthProvider,
  setMirrorHealthProvider: setDeltaHealthProvider,
  loadConfig,
  saveConfig,
  getOrCreateClientToken,
  startStaticServer,
  startAppUiServer,
  startSharingServer,
  restartStaticServer,
  restartSharingServer,
  stopStaticServer,
  stopSharingServer,
  listenHostForConfig,
  getStaticServerPort,
  getAppUiServerPort,
  getSharingServerPort,
  getServerListenAddress,
  resolveAppUiPort,
  getStatus,
  applyLoginItemSettings,
  listLanUrls,
  shouldHostLocalServer,
  shouldUseRemoteEntry,
  normalizeRemoteServerUrl,
  accessTokens,
};

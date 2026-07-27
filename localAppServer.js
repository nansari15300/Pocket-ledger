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

const CONFIG_FILE = "pl-local-server-config.json";
const TOKEN_FILE = "pl-local-app-client-token.json";
const PERSISTED_PORT_FILE = "pl-electron-static-port.json";
const PL_CLIENT_HEADER = "x-pocket-ledger-app";
const PL_ACCESS_HEADER = "x-pocket-ledger-access";
const PL_ELECTRON_MARKER_HEADER = "x-pocket-ledger-client";
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

async function shareableCompaniesForToken(allowedIds, cfg) {
  const hostIds = normalizeSharedLocalCompanyIds(cfg && cfg.sharedLocalCompanyIds);
  const idSet =
    Array.isArray(allowedIds) && allowedIds.length > 0
      ? new Set(allowedIds.map((x) => String(x || "").trim()).filter(Boolean))
      : null;
  let all = [];
  if (listShareableCompaniesProvider) {
    try {
      const rows = await listShareableCompaniesProvider();
      if (Array.isArray(rows)) all = rows;
    } catch (_) {
      /* fallback below */
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

/**
 * Remote API auth for Gate / EXE / APK / browser clients.
 * - Localhost: always allowed
 * - PLServer is token-free: open remote data access; company login/roles still apply at app level.
 */
function authorizeRemoteDataAccess(req, userDataPath, cfg, companyId) {
  if (isRequestFromLocalhost(req)) {
    return { ok: true, open: true, ids: null, rec: null };
  }
  void cfg;
  void companyId;
  return { ok: true, open: true, ids: null, rec: null };
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
    `Accept, Content-Type, ${PL_ACCESS_HEADER}, ${PL_CLIENT_HEADER}, ${PL_ELECTRON_MARKER_HEADER}`
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

function shouldRedirectToRemoteClientUrl(req, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (requestUrl.searchParams.get("pl_remote_client") === "1") return false;
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

function createRequestHandler(userDataPath) {
  return async (request, response) => {
    const cfg = loadConfig(userDataPath);
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
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
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, null);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        if (auth.open) {
          const companies = await shareableCompaniesForToken(null, cfg);
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
          return;
        }
        const companies = await shareableCompaniesForToken(auth.ids, cfg);
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(
          JSON.stringify({
            label: auth.rec?.label || null,
            allowedCompanyIds: auth.ids,
            companies,
          })
        );
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
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, true);
          return;
        }
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
        response.write(`event: ready\ndata: ${JSON.stringify({ companyId, at: Date.now() })}\n\n`);
        const client = { companyId, response };
        mirrorEventClients.add(client);
        const ping = setInterval(() => {
          try {
            response.write(`event: ping\ndata: ${Date.now()}\n\n`);
          } catch (_) {
            clearInterval(ping);
            mirrorEventClients.delete(client);
          }
        }, 25000);
        request.on("close", () => {
          clearInterval(ping);
          mirrorEventClients.delete(client);
        });
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
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
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
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        if (!companyDeltaCollectionExportProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "delta_collection_export_unavailable" }));
          return;
        }
        try {
          const docs = await companyDeltaCollectionExportProvider(companyId, collection);
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
        const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
        if (!auth.ok) {
          sendRemoteAuthFailure(response, auth, false);
          return;
        }
        if (!companyDeltaExportProvider) {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "delta_export_unavailable" }));
          return;
        }
        try {
          const bundle = await companyDeltaExportProvider(companyId);
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
          const auth = authorizeRemoteDataAccess(request, userDataPath, cfg, companyId);
          if (!auth.ok) {
            sendRemoteAuthFailure(response, auth, false);
            return false;
          }
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
              hostSelfPublish ? "pl_host_self_publish" : "pl_client_push"
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

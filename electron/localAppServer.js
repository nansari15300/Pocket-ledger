const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const handler = require("serve-handler");
const accessTokens = require("./localAppServerAccessTokens");

const CONFIG_FILE = "pl-local-server-config.json";
const TOKEN_FILE = "pl-local-app-client-token.json";
const PERSISTED_PORT_FILE = "pl-electron-static-port.json";
const PL_CLIENT_HEADER = "x-pocket-ledger-app";
const PL_ACCESS_HEADER = "x-pocket-ledger-access";
const PL_ELECTRON_MARKER_HEADER = "x-pocket-ledger-client";
const PL_ELECTRON_MARKER_VALUE = "pocket-ledger-electron";

const DEFAULT_CONFIG = {
  port: 3000,
  bindMode: "localhost",
  appOnlyAccess: true,
  autoStartOnBoot: false,
  userWantsRunning: true,
  appRole: "both",
  remoteServerUrl: "",
  clientAccessToken: "",
  publicHost: "",
  requireRemoteAccessToken: true,
};

let staticServer = null;
let staticServerPort = null;
let clientToken = null;
let staticPublicDir = "";
let isPackaged = false;
let rewriteReconciliationDocumentUrl = null;
let isAllowedFirebaseProxyTarget = null;

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
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      port: Number.isFinite(port) && port > 0 && port < 65536 ? port : DEFAULT_CONFIG.port,
      bindMode: normalizeBindMode(raw.bindMode),
      appOnlyAccess: raw.appOnlyAccess !== false,
      autoStartOnBoot: raw.autoStartOnBoot === true,
      userWantsRunning: raw.userWantsRunning !== false,
      appRole: normalizeAppRole(raw.appRole),
      remoteServerUrl: typeof raw.remoteServerUrl === "string" ? raw.remoteServerUrl.trim() : "",
      clientAccessToken: typeof raw.clientAccessToken === "string" ? raw.clientAccessToken.trim() : "",
      publicHost: typeof raw.publicHost === "string" ? raw.publicHost.trim() : "",
      requireRemoteAccessToken: raw.requireRemoteAccessToken !== false,
    };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(userDataPath, partial) {
  const next = { ...loadConfig(userDataPath), ...partial };
  if (partial && partial.appRole != null) next.appRole = normalizeAppRole(partial.appRole);
  if (partial && partial.bindMode != null) next.bindMode = normalizeBindMode(partial.bindMode);
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

function packagedStaticPortCandidates(userDataPath, preferred) {
  const persisted = readPersistedPackagedPort(userDataPath);
  const fallbacks = [37123, 38123, 39123, 40123, 41123];
  const ordered = [...(persisted != null ? [persisted] : []), preferred, ...fallbacks];
  const seen = new Set();
  const out = [];
  for (const n of ordered) {
    if (typeof n === "number" && n > 0 && n < 65536 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
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

function isAccessTokenRequest(req, userDataPath) {
  const tok = headerValue(req, PL_ACCESS_HEADER);
  if (!tok) return false;
  return accessTokens.validateAccessToken(userDataPath, tok);
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

function blockedAccessTokenHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pocket Ledger</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem"><h1>Access token required</h1><p>Ask the server owner for a Pocket Ledger access token and enter it in <strong>Settings → Server → Client</strong>.</p></body></html>`;
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
  const ph = String(publicHost || "").trim();
  if (ph) {
    const host = ph.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    urls.push(`http://${host}:${port}/`);
  }
  return [...new Set(urls)];
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
        const fromLocalhost = isRequestFromLocalhost(request);
        if (fromLocalhost) {
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ unrestricted: true, allowedCompanyIds: null, label: null }));
          return;
        }
        const tok = headerValue(request, PL_ACCESS_HEADER);
        const rec = accessTokens.getAccessTokenRecord(userDataPath, tok);
        if (!rec) {
          response.statusCode = 403;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "invalid_or_missing_token" }));
          return;
        }
        accessTokens.validateAccessToken(userDataPath, tok);
        const ids = accessTokens.normalizeCompanyIds(rec.allowedCompanyIds);
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(
          JSON.stringify({
            label: rec.label || null,
            allowedCompanyIds: ids.length > 0 ? ids : null,
          })
        );
        return;
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

    if (cfg.appOnlyAccess && !fromLocalhost && !isElectronAppRequest(request)) {
      response.statusCode = 403;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(blockedExternalBrowserHtml());
      return;
    }

    if (
      isServerRole &&
      cfg.requireRemoteAccessToken &&
      !fromLocalhost &&
      !isAccessTokenRequest(request, userDataPath)
    ) {
      response.statusCode = 403;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(blockedAccessTokenHtml());
      return;
    }

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

    return handler(request, response, {
      public: staticPublicDir,
      cleanUrls: true,
      headers: [
        {
          source: "**/*.mjs",
          headers: [{ key: "Content-Type", value: "text/javascript; charset=utf-8" }],
        },
      ],
    });
  };
}

function stopStaticServer() {
  if (!staticServer) return Promise.resolve();
  return new Promise((resolve) => {
    staticServer.close(() => {
      staticServer = null;
      staticServerPort = null;
      resolve();
    });
  });
}

function listenHostForConfig(cfg) {
  if (!cfg.userWantsRunning) return "127.0.0.1";
  return cfg.bindMode === "localhost" ? "127.0.0.1" : "0.0.0.0";
}

function startStaticServer(userDataPath, options = {}) {
  if (staticServer && staticServerPort) {
    return Promise.resolve(staticServerPort);
  }

  const cfg = { ...loadConfig(userDataPath), ...options };
  if (!shouldHostLocalServer(cfg)) {
    return Promise.reject(new Error("PL_LOCAL_SERVER_ROLE_CLIENT_ONLY"));
  }
  if (!options.forAppUi && !cfg.userWantsRunning) {
    return Promise.reject(new Error("PL_LOCAL_SERVER_STOPPED"));
  }

  const preferred = cfg.port;
  const host = listenHostForConfig(cfg);

  staticServer = http.createServer(createRequestHandler(userDataPath));

  return new Promise((resolve, reject) => {
    const finish = () => {
      staticServer.removeAllListeners("error");
      const addressInfo = staticServer.address();
      if (!addressInfo || typeof addressInfo === "string") {
        reject(new Error("Unable to resolve static server port."));
        return;
      }
      staticServerPort = addressInfo.port;
      writePersistedPackagedPort(userDataPath, staticServerPort);
      resolve(staticServerPort);
    };

    const candidates = isPackaged
      ? packagedStaticPortCandidates(userDataPath, preferred)
      : [preferred];

    let candidateIndex = 0;
    const tryNextCandidate = () => {
      if (candidateIndex >= candidates.length) {
        reject(new Error("PL_PACKAGED_STATIC_PORT_EXHAUSTED"));
        return;
      }
      const port = candidates[candidateIndex++];
      staticServer.removeAllListeners("error");
      staticServer.once("error", (err) => {
        if (err && err.code === "EADDRINUSE") {
          tryNextCandidate();
          return;
        }
        reject(err);
      });
      staticServer.listen(port, host, finish);
    };

    tryNextCandidate();
  });
}

function getStaticServerPort() {
  return staticServerPort;
}

function getServerListenAddress() {
  if (!staticServer || !staticServerPort) return null;
  const addr = staticServer.address();
  if (!addr || typeof addr === "string") return null;
  return { host: addr.address, port: addr.port };
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
  await stopStaticServer();
  return startStaticServer(userDataPath, options);
}

function getStatus(userDataPath) {
  const cfg = loadConfig(userDataPath);
  const port = staticServerPort || cfg.port;
  const hosting = shouldHostLocalServer(cfg);
  const processUp = Boolean(staticServer && staticServerPort);
  const sharingActive = processUp && cfg.userWantsRunning;
  return {
    running: sharingActive,
    appUiServing: processUp,
    sharingActive,
    port: staticServerPort || null,
    configuredPort: cfg.port,
    bindMode: cfg.bindMode,
    appOnlyAccess: cfg.appOnlyAccess,
    autoStartOnBoot: cfg.autoStartOnBoot,
    userWantsRunning: cfg.userWantsRunning,
    appRole: cfg.appRole,
    remoteServerUrl: cfg.remoteServerUrl,
    publicHost: cfg.publicHost,
    requireRemoteAccessToken: cfg.requireRemoteAccessToken,
    urls:
      staticServerPort && hosting && cfg.userWantsRunning
        ? listLanUrls(staticServerPort, cfg.publicHost)
        : processUp && hosting
          ? [`http://127.0.0.1:${staticServerPort}/`, `http://localhost:${staticServerPort}/`]
          : [],
    clientHeader: PL_CLIENT_HEADER,
    accessHeader: PL_ACCESS_HEADER,
    electronMarkerHeader: PL_ELECTRON_MARKER_HEADER,
    portForwardHint:
      cfg.bindMode !== "localhost"
        ? "Router me TCP port forward: external port → this PC LAN IP + server port. Firewall me port allow karein."
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
  loadConfig,
  saveConfig,
  getOrCreateClientToken,
  startStaticServer,
  restartStaticServer,
  stopStaticServer,
  listenHostForConfig,
  getStaticServerPort,
  getServerListenAddress,
  getStatus,
  applyLoginItemSettings,
  listLanUrls,
  shouldHostLocalServer,
  shouldUseRemoteEntry,
  normalizeRemoteServerUrl,
  accessTokens,
};

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
let listShareableCompaniesProvider = null;
let localCompanyAuthProvider = null;

function setShareableCompaniesProvider(fn) {
  listShareableCompaniesProvider = typeof fn === "function" ? fn : null;
}

function setLocalCompanyAuthProvider(fn) {
  localCompanyAuthProvider = typeof fn === "function" ? fn : null;
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

async function shareableCompaniesForToken(allowedIds) {
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
  if (!all.length && idSet?.size) {
    return stubShareableCompaniesFromIds([...idSet]);
  }
  return all.filter((c) => {
    if (!c || !c.id) return false;
    const id = String(c.id).trim();
    if (!idSet) return true;
    return idSet.has(id);
  });
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
  const prev = loadConfig(userDataPath);
  const next = { ...prev, ...partial };
  if (partial && partial.appRole != null) next.appRole = normalizeAppRole(partial.appRole);
  if (partial && partial.bindMode != null) next.bindMode = normalizeBindMode(partial.bindMode);
  if (partial && partial.port != null) {
    const newPort = Number(partial.port);
    const oldPort = Number(prev.port);
    if (Number.isFinite(newPort) && newPort > 0 && newPort < 65536 && newPort !== oldPort) {
      try {
        fs.unlinkSync(path.join(userDataPath, PERSISTED_PORT_FILE));
      } catch (_) {}
    }
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

function packagedStaticPortCandidates(userDataPath, preferred) {
  const persisted = readPersistedPackagedPort(userDataPath);
  const fallbacks = [37123, 38123, 39123, 40123, 41123];
  // Settings → Port (preferred) pehle — warna purana persisted (e.g. 37123) user ke 30000 ko ignore karta tha.
  const ordered = [
    preferred,
    ...(persisted != null && persisted !== preferred ? [persisted] : []),
    ...fallbacks,
  ];
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
        const fromLocalhost = isRequestFromLocalhost(request);
        if (fromLocalhost) {
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ unrestricted: true, allowedCompanyIds: null, label: null }));
          return;
        }
        const tok = tokenFromRequest(request);
        const rec = accessTokens.getAccessTokenRecord(userDataPath, tok);
        if (!rec) {
          response.statusCode = 403;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "invalid_or_missing_token" }));
          return;
        }
        accessTokens.validateAccessToken(userDataPath, tok);
        const ids = accessTokens.normalizeCompanyIds(rec.allowedCompanyIds);
        const companies = await shareableCompaniesForToken(ids);
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(
          JSON.stringify({
            label: rec.label || null,
            allowedCompanyIds: ids.length > 0 ? ids : null,
            companies,
          })
        );
        return;
      }
      if (requestUrl.pathname === "/__pl_company_login") {
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
        const accessTok = tokenFromRequest(request);
        if (!accessTok || !accessTokens.validateAccessToken(userDataPath, accessTok)) {
          response.statusCode = 403;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ ok: false, error: "invalid_or_missing_token" }));
          return;
        }
        try {
          const body = await readJsonBody(request);
          const companyId = String(body.companyId || "").trim();
          const username = String(body.username || "").trim();
          const password = String(body.password || "").trim();
          if (!companyId || !username || !password) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "missing_fields" }));
            return;
          }
          const rec = accessTokens.getAccessTokenRecord(userDataPath, accessTok);
          const allowedIds = accessTokens.normalizeCompanyIds(rec?.allowedCompanyIds);
          if (allowedIds.length > 0 && !allowedIds.includes(companyId)) {
            response.statusCode = 403;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "company_not_allowed_for_token" }));
            return;
          }
          if (!localCompanyAuthProvider) {
            response.statusCode = 503;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, error: "server_login_unavailable" }));
            return;
          }
          const authResult = await localCompanyAuthProvider(companyId, username, password);
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
        } catch (_) {
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

    if (
      cfg.appOnlyAccess &&
      !fromLocalhost &&
      !isElectronAppRequest(request) &&
      !isAccessTokenRequest(request, userDataPath)
    ) {
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
      response.end(blockedAccessTokenHtml(request, userDataPath));
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

function stopStaticServer() {
  if (!staticServer) return Promise.resolve();
  const server = staticServer;
  staticServer = null;
  staticServerPort = null;
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
  setLocalCompanyAuthProvider,
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

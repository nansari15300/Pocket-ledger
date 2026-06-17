/**
 * Packaged EXE: localhost par `out/` static serve + Firebase blob proxy.
 * PL Server / remote sharing / access tokens hata diye — online-only app.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const handler = require("serve-handler");

const PERSISTED_PORT_FILE = "pl-electron-static-port.json";
const DEFAULT_PORT = 3000;
const FALLBACK_PORTS = [37123, 38123, 39123, 40123, 41123];

let staticServer = null;
let staticServerPort = null;
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

function packagedStaticPortCandidates(userDataPath) {
  const persisted = readPersistedPackagedPort(userDataPath);
  const ordered = [DEFAULT_PORT, ...(persisted != null && persisted !== DEFAULT_PORT ? [persisted] : []), ...FALLBACK_PORTS];
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

function createRequestHandler() {
  return async (request, response) => {
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
      if (rewriteReconciliationDocumentUrl) {
        const rewritten = rewriteReconciliationDocumentUrl(requestUrl);
        if (rewritten) {
          request = Object.assign({}, request, { url: rewritten });
        }
      }
    } catch {
      /* fall through to static */
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
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
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

function startStaticServer(userDataPath) {
  if (staticServer && staticServerPort) {
    return Promise.resolve(staticServerPort);
  }

  staticServer = http.createServer(createRequestHandler());
  const host = "127.0.0.1";
  const candidates = isPackaged ? packagedStaticPortCandidates(userDataPath) : [DEFAULT_PORT];

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

module.exports = {
  setServerDeps,
  startStaticServer,
  stopStaticServer,
  getStaticServerPort,
  getServerListenAddress,
};

/**
 * Zero-dependency static server for portable Pocket Ledger zip.
 * Serves files from the folder this script lives in (same level as index.html).
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const publicDir = __dirname;
const DEFAULT_PORT = 3000;
const FALLBACK_PORTS = [37123, 38123, 39123, 40123];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function safeJoinPublic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const rel = decoded.replace(/^\/+/, "");
  const abs = path.resolve(publicDir, rel);
  if (abs !== publicDir && !abs.startsWith(publicDir + path.sep)) return null;
  return abs;
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function resolveStaticPath(urlPath) {
  let pathname = (urlPath || "/").split("?")[0].split("#")[0];
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/+$/, "") || "/";

  if (pathname.includes("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) {
    const direct = safeJoinPublic(pathname);
    if (direct && fileExists(direct)) return direct;
    return null;
  }

  const rewritten = rewriteReconciliationDocumentUrl(new URL(pathname, "http://localhost"));
  if (rewritten) {
    const p = safeJoinPublic(rewritten);
    if (p && fileExists(p)) return p;
  }

  const candidates = [];
  if (pathname === "/") {
    candidates.push("/index.html");
  } else {
    candidates.push(pathname, `${pathname}.html`, `${pathname}/index.html`);
  }

  for (const c of candidates) {
    const p = safeJoinPublic(c);
    if (p && fileExists(p)) return p;
  }
  return null;
}

function rewriteReconciliationDocumentUrl(requestUrl) {
  const pathname = (requestUrl.pathname || "/").replace(/\/+$/, "") || "/";
  if (pathname.includes("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) return null;
  if (pathname === "/reconciliation") {
    return `/reconciliation/index.html${requestUrl.search || ""}`;
  }
  const legacy = pathname.match(/^\/reconciliation\/([^/]+)$/);
  if (legacy && legacy[1] !== "__placeholder__") {
    return `/reconciliation/index.html${requestUrl.search || ""}`;
  }
  return null;
}

function isAllowedFirebaseProxyTarget(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host.includes("firebasestorage.googleapis.com") ||
      host.includes("firebasestorage.app") ||
      host.includes("storage.googleapis.com")
    );
  } catch {
    return false;
  }
}

function sendFile(response, filePath) {
  const stat = fs.statSync(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType(filePath));
  response.setHeader("Content-Length", stat.size);
  response.setHeader("Cache-Control", filePath.includes(`${path.sep}_next${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  fs.createReadStream(filePath).pipe(response);
}

function sendFallback(response) {
  for (const name of ["404.html", "index.html"]) {
    const p = path.join(publicDir, name);
    if (fileExists(p)) {
      sendFile(response, p);
      return;
    }
  }
  response.statusCode = 404;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end("Not found");
}

async function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  try {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/__firebase_blob_proxy") {
      const target = requestUrl.searchParams.get("url") || "";
      if (!isAllowedFirebaseProxyTarget(target)) {
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
      response.statusCode = 200;
      response.setHeader("content-type", upstream.headers.get("content-type") || "application/octet-stream");
      response.setHeader("cache-control", "private, max-age=60");
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }

    const filePath = resolveStaticPath(requestUrl.pathname + requestUrl.search);
    if (filePath) {
      if (request.method === "HEAD") {
        const stat = fs.statSync(filePath);
        response.statusCode = 200;
        response.setHeader("Content-Type", contentType(filePath));
        response.setHeader("Content-Length", stat.size);
        response.end();
        return;
      }
      sendFile(response, filePath);
      return;
    }
    sendFallback(response);
  } catch (err) {
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(err?.message || "Server error");
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(port));
  });
}

async function main() {
  if (!fileExists(path.join(publicDir, "index.html"))) {
    console.error("[Pocket Ledger] index.html missing — zip corrupt ya galat folder.");
    process.exit(1);
  }

  const host = "127.0.0.1";
  const preferred = Number(process.env.PORT || process.env.PL_PORT);
  const candidates = [
    ...(Number.isFinite(preferred) && preferred > 0 ? [preferred] : []),
    DEFAULT_PORT,
    ...FALLBACK_PORTS,
  ].filter((p, i, a) => a.indexOf(p) === i);

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  for (const port of candidates) {
    try {
      await listen(server, port, host);
      console.log("");
      console.log("  Pocket Ledger (portable)");
      console.log(`  Browser: http://${host}:${port}/`);
      console.log("  Band karne ke liye: Ctrl+C ya window band karo");
      console.log("");
      return;
    } catch (err) {
      if (err && err.code === "EADDRINUSE") continue;
      throw err;
    }
  }
  console.error("[Pocket Ledger] Port busy — 3000 band karke dubara Start dabao.");
  process.exit(1);
}

main().catch((err) => {
  console.error("[Pocket Ledger]", err?.message || err);
  process.exit(1);
});

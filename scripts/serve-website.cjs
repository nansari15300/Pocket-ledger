/**
 * Serve website/dist on http://127.0.0.1:4173 (marketing only).
 * /releases/* is served from repo releases/ so download buttons work here too.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "website", "dist");
const releasesRoot = path.join(__dirname, "..", "releases");
const port = Number(process.env.WEBSITE_PORT || 4173);

if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("[website:serve] Run npm run website:build first.");
  process.exit(1);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".exe": "application/octet-stream",
  ".apk": "application/vnd.android.package-archive",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const st = fs.statSync(filePath);
  const headers = {
    "Content-Type": types[ext] || "application/octet-stream",
    "Content-Length": String(st.size),
  };
  if (ext === ".exe" || ext === ".apk") {
    const name = path.basename(filePath);
    headers["Content-Disposition"] =
      "attachment; filename=\"" + name.replace(/"/g, "") + "\"; filename*=UTF-8''" + encodeURIComponent(name);
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/releases" || urlPath.startsWith("/releases/")) {
      const rel = urlPath.replace(/^\/releases\/?/, "");
      const filePath = path.join(releasesRoot, rel);
      if (!filePath.startsWith(releasesRoot) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Release file not found");
        return;
      }
      sendFile(res, filePath);
      return;
    }
    let filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath) && !path.extname(urlPath)) {
      const asDir = path.join(root, urlPath.replace(/^\//, ""), "index.html");
      if (asDir.startsWith(root) && fs.existsSync(asDir)) filePath = asDir;
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    sendFile(res, filePath);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e && e.message ? e.message : e));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[website:serve] http://127.0.0.1:${port}/`);
});

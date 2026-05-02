/**
 * `npm run build:static` se pehle: canonical site se `app_settings/plans` jaisa raw JSON lao,
 * `public/plans-seed-raw.json` me likho — APK/Electron `out/` me bundle ho, offline pe billing limits sahi rahein.
 *
 * Env (optional):
 * - PLANS_SEED_FILE — local path copy (fetch skip)
 * - PLANS_SEED_URL — poora URL (priority)
 * - PLANS_SEED_ORIGIN + PLANS_SEED_PATH — default https://pocket-ledger.com/plans-seed-raw.json
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = path.join(__dirname, "..");
const dest = path.join(root, "public", "plans-seed-raw.json");

const fileOverride = process.env.PLANS_SEED_FILE && String(process.env.PLANS_SEED_FILE).trim();
if (fileOverride && fs.existsSync(fileOverride)) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(fileOverride, dest);
  console.log("[plans-seed] Copied PLANS_SEED_FILE → public/plans-seed-raw.json");
  process.exit(0);
}

const defaultOrigin = "https://pocket-ledger.com";
const defaultPath = "/plans-seed-raw.json";
const fullUrl =
  process.env.PLANS_SEED_URL && String(process.env.PLANS_SEED_URL).trim()
    ? String(process.env.PLANS_SEED_URL).trim()
    : `${process.env.PLANS_SEED_ORIGIN || defaultOrigin}${process.env.PLANS_SEED_PATH || defaultPath}`;

function fetchUrl(urlString, redirectDepth = 0) {
  if (redirectDepth > 5) return Promise.reject(new Error("too many redirects"));
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "pocket-ledger-static-build/1" },
        timeout: 25_000,
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const loc = res.headers.location;
          if (!loc) {
            reject(new Error("redirect without location"));
            return;
          }
          const next = new URL(loc, urlString).toString();
          res.resume();
          fetchUrl(next, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

(async () => {
  try {
    const body = await fetchUrl(fullUrl);
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON must be a Firestore-shaped object (e.g. { basic: {...}, ... })");
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(parsed) + "\n", "utf8");
    console.log("[plans-seed] Wrote public/plans-seed-raw.json from", fullUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[plans-seed] Fetch failed:", msg, "—", fullUrl);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, "{}\n", "utf8");
      console.log("[plans-seed] Created empty {} (merge → bundled DEFAULT_PLANS at runtime)");
    } else {
      console.log("[plans-seed] Keeping existing public/plans-seed-raw.json");
    }
  }
})();

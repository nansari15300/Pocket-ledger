const https = require("https");

/** Best-effort public IPv4 — empty field only; never overwrite user DDNS. */
const PUBLIC_IP_PROVIDERS = [
  "https://api.ipify.org?format=text",
  "https://checkip.amazonaws.com",
  "https://ipv4.icanhazip.com",
];

function parseIpv4(text) {
  const m = String(text || "")
    .trim()
    .match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  if (!m) return null;
  const ip = m[1];
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ip;
}

function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`http_${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

async function fetchPublicIpAddress() {
  for (const url of PUBLIC_IP_PROVIDERS) {
    try {
      const ip = parseIpv4(await fetchText(url, 8000));
      if (ip) return ip;
    } catch {
      /* try next provider */
    }
  }
  return null;
}

module.exports = { fetchPublicIpAddress };

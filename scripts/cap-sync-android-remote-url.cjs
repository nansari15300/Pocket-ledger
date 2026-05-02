#!/usr/bin/env node
/**
 * Android sync with Capacitor WebView pointing at REMOTE_SITE (default pocket-ledger.com).
 * Equivalent: CAP_USE_REMOTE_WEB=1 CAP_REMOTE_WEB_URL=https://example.com npx cap sync android
 */
process.env.CAP_USE_REMOTE_WEB = "1";
if (!process.env.CAP_REMOTE_WEB_URL) {
  process.env.CAP_REMOTE_WEB_URL = "https://pocket-ledger.com";
}
const { spawnSync } = require("child_process");
const r = spawnSync("npx", ["cap", "sync", "android"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(typeof r.status === "number" ? r.status : 1);

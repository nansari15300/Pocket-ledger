#!/usr/bin/env node
/**
 * Remote WebView sync: Gradle-apk khulte hi `CAP_REMOTE_WEB_URL` par site load —
 * APK dobara banana kam, sirf HTTPS deploy + WebView reload.
 *
 * Usage:
 *   npm run cap:sync:remote
 *   npm run cap:sync:remote -- https://staging.pocket-ledger.com
 *
 * Offline/bundled wapas: `CAP_USE_REMOTE_WEB` hata kar `npm run cap:sync`
 */
const { spawnSync } = require("child_process");

const argUrl = process.argv[2]?.trim()?.replace(/\/+$/, "") || "";

const mergedEnv = {
  ...process.env,
  CAP_USE_REMOTE_WEB: "1",
  CAP_REMOTE_WEB_URL:
    argUrl ||
    process.env.CAP_REMOTE_WEB_URL?.trim()?.replace(/\/+$/, "") ||
    "https://pocket-ledger.com",
};

const r = spawnSync("npx", ["cap", "sync", "android"], {
  stdio: "inherit",
  shell: true,
  env: mergedEnv,
});

console.log(
  `[cap-sync-android-remote-url] CAP_REMOTE_WEB_URL=${mergedEnv.CAP_REMOTE_WEB_URL} (native project updated — Gradle se run/build karo)`
);

process.exit(typeof r.status === "number" ? r.status : 1);

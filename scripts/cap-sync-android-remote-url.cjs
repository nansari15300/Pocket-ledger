#!/usr/bin/env node
/**
 * Pehle CAP_USE_REMOTE_WEB=1 se remote site load hota tha — ab `capacitor.config` hamesha bundled `out`.
 * Script backward-compat: sirf `cap sync android` (koi URL env nahi).
 */
const { spawnSync } = require("child_process");
const r = spawnSync("npx", ["cap", "sync", "android"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
console.log("[cap-sync-android-remote-url] Remote WebView URL deprecated — native bundle from webDir only.");
process.exit(typeof r.status === "number" ? r.status : 1);

#!/usr/bin/env node
/**
 * Bundled WebView: `out/` ko APK ke andar copy + **server.url hata kar** native offline shell.
 *
 * Jab PowerShell/User env me `CAP_USE_REMOTE_WEB=1` permanently ho to bhi remote inject nahi hoga —
 * yahan child env se dono vars hata kar `cap sync` chalaya jata hai.
 *
 * Usage: `npm run cap:sync:bundled` (sync se pehle `npm run build:static` chalao taaki `out/` fresh ho)
 */
const { spawnSync } = require("child_process");

const mergedEnv = { ...process.env };
delete mergedEnv.CAP_USE_REMOTE_WEB;
delete mergedEnv.CAP_REMOTE_WEB_URL;

const r = spawnSync("npx", ["cap", "sync", "android"], {
  stdio: "inherit",
  shell: true,
  env: mergedEnv,
});

console.log(
  "[cap-sync-android-bundled] Remote server vars cleared — WebView ab `out/` (assets/public) se load karega. Gradle se APK build karo."
);

process.exit(typeof r.status === "number" ? r.status : 1);

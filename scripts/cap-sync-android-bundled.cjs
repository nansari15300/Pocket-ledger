#!/usr/bin/env node
/**
 * Bundled WebView: `out/` → APK assets (fast robocopy) + Capacitor plugin update.
 *
 * Default `npx cap sync android` deletes + recopies ~1500 files via Node (Windows par 5+ min).
 * Yahan robocopy /MIR (~1–15s) + `cap update android` (plugins only).
 *
 * Usage: `npm run cap:sync:bundled` (pehle `npm run build:static` / `build:static:fast`)
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "out");
const webDest = path.join(root, "android", "app", "src", "main", "assets", "public");
const assetsDir = path.join(root, "android", "app", "src", "main", "assets");
const configDest = path.join(assetsDir, "capacitor.config.json");

const mergedEnv = { ...process.env };
delete mergedEnv.CAP_USE_REMOTE_WEB;
delete mergedEnv.CAP_REMOTE_WEB_URL;

function elapsedSec(startMs) {
  return ((Date.now() - startMs) / 1000).toFixed(2);
}

function fail(msg, code = 1) {
  console.error(`[cap-sync-android-bundled] ${msg}`);
  process.exit(code);
}

if (!fs.existsSync(outDir)) {
  fail("`out/` missing — pehle `npm run build:static` ya `npm run build:static:fast` chalao.");
}

const totalStart = Date.now();

// 1) Fast mirror (Windows-native; Capacitor Node copy se 10–50x tez)
fs.mkdirSync(webDest, { recursive: true });
const copyStart = Date.now();
const robocopy = spawnSync(
  "robocopy",
  [
    outDir,
    webDest,
    "/MIR",
    "/MT:16",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/nc",
    "/ns",
    "/np",
  ],
  { shell: false, stdio: "pipe", encoding: "utf8" }
);
if (typeof robocopy.status === "number" && robocopy.status > 7) {
  const err = [robocopy.stdout, robocopy.stderr].filter(Boolean).join("\n").trim();
  fail(`robocopy failed (code ${robocopy.status})${err ? `: ${err}` : ""}`);
}
console.log(
  `[cap-sync-android-bundled] Web assets mirrored out → assets/public in ${elapsedSec(copyStart)}s`
);

// 2) Bundled capacitor.config.json (remote server.url hata kar)
const cfgStart = Date.now();
try {
  const { loadConfig } = require("@capacitor/cli/dist/config");
  loadConfig()
    .then((config) => {
      fs.mkdirSync(assetsDir, { recursive: true });
      const ext = { ...(config.app.extConfig || {}) };
      if (ext.android && typeof ext.android === "object") {
        const android = { ...ext.android };
        delete android.buildOptions;
        ext.android = android;
      }
      fs.writeFileSync(configDest, `${JSON.stringify(ext, null, "\t")}\n`, "utf8");
      console.log(
        `[cap-sync-android-bundled] capacitor.config.json refreshed in ${elapsedSec(cfgStart)}s`
      );

      // 3) Plugins / Gradle stubs — copy step skip (web assets already mirrored)
      const updateStart = Date.now();
      const update = spawnSync("npx", ["cap", "update", "android"], {
        stdio: "inherit",
        shell: true,
        env: mergedEnv,
        cwd: root,
      });
      if (typeof update.status === "number" && update.status !== 0) {
        fail(`cap update android failed (code ${update.status})`, update.status);
      }
      console.log(
        `[cap-sync-android-bundled] Plugins updated in ${elapsedSec(updateStart)}s`
      );
      console.log(
        `[cap-sync-android-bundled] Done in ${elapsedSec(totalStart)}s — WebView ab bundled out/ se load karega. Android Studio se APK build karo.`
      );
      console.log(
        "[cap-sync-android-bundled] Tip: agar copy phir bhi slow ho to Windows Defender me project folder exclude karo."
      );
      process.exit(0);
    })
    .catch((e) => {
      fail(e instanceof Error ? e.message : String(e));
    });
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

/**
 * Upload staged releases/YYYY-MM-DD EXE+APK to Firebase Storage public-releases/
 * and publish latest.json (same shape as /admin-release/).
 *
 *   node scripts/upload-public-releases.cjs
 *   node scripts/upload-public-releases.cjs --date 2026-08-18
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");
const {
  fetchReleaseSettings,
  buildReleaseRotation,
} = require("./release-settings.cjs");

const projectRoot = path.join(__dirname, "..");
const bucket = process.env.FIREBASE_STORAGE_BUCKET || "studio-5452513410-a3f5b.firebasestorage.app";
const prefix = "public-releases";
const gsUri = `gs://${bucket}`;

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bytesLabel(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function publicUrl(objectPath) {
  return (
    "https://firebasestorage.googleapis.com/v0/b/" +
    bucket +
    "/o/" +
    encodeURIComponent(objectPath) +
    "?alt=media"
  );
}

function gsutilBin() {
  if (process.platform === "win32") {
    const win = "C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gsutil.cmd";
    if (fs.existsSync(win)) return win;
    return "gsutil.cmd";
  }
  return "gsutil";
}

function shellQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function gsutil(args) {
  const cmd = gsutilBin();
  const line = [shellQuote(cmd), ...args.map(shellQuote)].join(" ");
  execSync(line, { stdio: "inherit", windowsHide: true });
}

function fetchJson(url) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function deleteStorageEntry(entry) {
  if (!entry) return;
  for (const item of [entry.windows, entry.android]) {
    if (!item) continue;
    if (item.path) {
      try {
        gsutil(["rm", "-f", `${gsUri}/${item.path}`]);
      } catch (_) {
        /* already gone */
      }
    }
  }
}

function uploadAndroidFile(localDir, date, fileName, androidVersion) {
  const local = path.join(localDir, fileName);
  const objectPath = `${prefix}/android/${date}/${fileName}`;
  console.log("[upload-public-releases] Upload Android →", objectPath);
  gsutil([
    "-h",
    "Content-Type:application/vnd.android.package-archive",
    "cp",
    local,
    `${gsUri}/${objectPath}`,
  ]);
  const st = fs.statSync(local);
  return {
    file: fileName,
    url: publicUrl(objectPath),
    path: objectPath,
    version: androidVersion,
    format: "apk",
    bytes: st.size,
    sizeLabel: bytesLabel(st.size),
  };
}

async function main() {
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const date = dateArg || process.env.RELEASE_DATE || todayStamp();
  const localDir = path.join(projectRoot, "releases", date);
  if (!fs.existsSync(localDir)) {
    console.error("[upload-public-releases] Missing folder:", localDir);
    console.error("Run: npm run website:stage-releases");
    process.exit(1);
  }

  const windowsVersion =
    process.env.WINDOWS_RELEASE_VERSION ||
    require(path.join(projectRoot, "electron", "package.json")).version ||
    "1.0.0";
  const androidVersion =
    process.env.ANDROID_RELEASE_VERSION ||
    (() => {
      try {
        const ts = fs.readFileSync(path.join(projectRoot, "src/config/releaseVersion.ts"), "utf8");
        const m = ts.match(/ANDROID_APP_VERSION = "([^"]+)"/);
        if (m) return m[1];
      } catch {
        /* ignore */
      }
      return "1.0.0";
    })();

  const files = fs.readdirSync(localDir);
  const exeName =
    files.find((n) => n.toLowerCase().endsWith(".exe") && n.includes(` ${windowsVersion}.exe`)) ||
    files.find((n) => n.toLowerCase().endsWith(".exe"));
  const apkName = files.find((n) => n.toLowerCase().endsWith(".apk"));
  if (!exeName && !apkName) {
    console.error("[upload-public-releases] No EXE/APK in", localDir);
    process.exit(1);
  }

  const settings = await fetchReleaseSettings(bucket);
  const prev = await fetchJson(publicUrl(`${prefix}/latest.json`));
  const latest = { date, stagedAt: new Date().toISOString(), windows: null, android: null };
  if (prev) {
    latest.windows = prev.windows || null;
    latest.android = prev.android || null;
  }

  if (exeName) {
    const local = path.join(localDir, exeName);
    const objectPath = `${prefix}/windows/${date}/${exeName}`;
    console.log("[upload-public-releases] Upload EXE →", objectPath);
    gsutil(["-h", "Content-Type:application/x-msdownload", "cp", local, `${gsUri}/${objectPath}`]);
    const st = fs.statSync(local);
    latest.windows = {
      file: exeName,
      url: publicUrl(objectPath),
      path: objectPath,
      version: windowsVersion,
      bytes: st.size,
      sizeLabel: bytesLabel(st.size),
    };
  }

  if (apkName) {
    latest.android = uploadAndroidFile(localDir, date, apkName, androidVersion);
  }

  if (prev?.android?.playStoreUrl) {
    latest.android = latest.android || {};
    latest.android.playStoreUrl = prev.android.playStoreUrl;
  }
  if (prev?.playStoreUrl) {
    latest.playStoreUrl = prev.playStoreUrl;
  }

  const rotation = buildReleaseRotation(prev, latest, settings);
  latest.history = rotation.history;
  latest.outdated = rotation.outdated;

  for (const entry of rotation.deleteEntries || []) {
    console.log("[upload-public-releases] Auto-delete outdated →", entry.date || "unknown");
    deleteStorageEntry(entry);
  }

  const manifestLocal = path.join(projectRoot, "releases", "latest-firebase.json");
  fs.writeFileSync(manifestLocal, `${JSON.stringify(latest, null, 2)}\n`);
  console.log("[upload-public-releases] Upload latest.json");
  gsutil([
    "-h",
    "Content-Type:application/json",
    "-h",
    "Cache-Control:public,max-age=60",
    "cp",
    manifestLocal,
    `${gsUri}/${prefix}/latest.json`,
  ]);

  console.log("[upload-public-releases] Done.");
  console.log("[upload-public-releases] Downloads: https://pocket-ledger.com/downloads/");
}

main().catch((err) => {
  console.error("[upload-public-releases]", err.message || err);
  process.exit(1);
});

/**
 * Upload staged releases/YYYY-MM-DD EXE+APK to Firebase Storage public-releases/
 * and publish latest.json (same shape as /admin-release/).
 *
 *   node scripts/upload-public-releases.cjs
 *   node scripts/upload-public-releases.cjs --date 2026-08-18
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function gsutil(args) {
  const cmd = gsutilBin();
  // Windows .cmd shims need cmd.exe — spawnSync EINVAL on .cmd directly.
  const r =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", cmd, ...args], { stdio: "inherit", windowsHide: true })
      : spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`gsutil ${args.join(" ")} failed (${r.status})`);
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

function sameRelease(a, b) {
  if (!a || !b) return false;
  return (
    String(a.date || "") === String(b.date || "") &&
    String(a.windows?.url || "") === String(b.windows?.url || "") &&
    String(a.android?.url || "") === String(b.android?.url || "")
  );
}

function buildRotation(prev, next) {
  const MAX_OLD = 5;
  const candidates = [];
  if (prev && (prev.windows || prev.android) && !sameRelease(prev, next)) {
    candidates.push({ date: prev.date || "", windows: prev.windows || null, android: prev.android || null });
  }
  for (const entry of Array.isArray(prev?.history) ? prev.history : []) {
    if (!entry || sameRelease(entry, next)) continue;
    if (candidates.some((e) => sameRelease(e, entry))) continue;
    candidates.push({ date: entry.date || "", windows: entry.windows || null, android: entry.android || null });
  }
  const history = candidates.slice(0, MAX_OLD);
  const spilled = candidates.slice(MAX_OLD);
  const outdated = [];
  for (const entry of spilled.concat(Array.isArray(prev?.outdated) ? prev.outdated : [])) {
    if (!entry || sameRelease(entry, next)) continue;
    if (history.some((e) => sameRelease(e, entry))) continue;
    if (outdated.some((e) => sameRelease(e, entry))) continue;
    outdated.push({ date: entry.date || "", windows: entry.windows || null, android: entry.android || null });
  }
  return { history, outdated };
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
  const androidVersion = process.env.ANDROID_RELEASE_VERSION || "1.0.0";

  const files = fs.readdirSync(localDir);
  const exeName = files.find((n) => n.toLowerCase().endsWith(".exe"));
  const apkName = files.find((n) => n.toLowerCase().endsWith(".apk"));
  if (!exeName && !apkName) {
    console.error("[upload-public-releases] No EXE/APK in", localDir);
    process.exit(1);
  }

  const prev = await fetchJson(publicUrl(`${prefix}/latest.json`));
  const latest = { date, stagedAt: new Date().toISOString(), windows: null, android: null };
  if (prev) {
    latest.windows = prev.windows || null;
    latest.android = prev.android || null;
  }

  if (exeName) {
    const local = path.join(localDir, exeName);
    const objectPath = `${prefix}/${date}/${exeName}`;
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
    const local = path.join(localDir, apkName);
    const objectPath = `${prefix}/${date}/${apkName}`;
    console.log("[upload-public-releases] Upload APK →", objectPath);
    gsutil(["-h", "Content-Type:application/vnd.android.package-archive", "cp", local, `${gsUri}/${objectPath}`]);
    const st = fs.statSync(local);
    latest.android = {
      file: apkName,
      url: publicUrl(objectPath),
      path: objectPath,
      version: androidVersion,
      bytes: st.size,
      sizeLabel: bytesLabel(st.size),
    };
  }

  const rotation = buildRotation(prev, latest);
  latest.history = rotation.history;
  latest.outdated = rotation.outdated;

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

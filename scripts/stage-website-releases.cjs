/**
 * Copy the current EXE + APK into releases/YYYY-MM-DD/ (not every build dump).
 * Writes releases/latest.json so localhost:3000/downloads can serve local paths.
 *
 *   npm run website:stage-releases
 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const releasesRoot = path.join(projectRoot, "releases");
const windowsVersion =
  process.env.WINDOWS_RELEASE_VERSION ||
  String(require(path.join(projectRoot, "electron", "package.json")).version || "1.0.0");
const androidVersion = process.env.ANDROID_RELEASE_VERSION || "1.0.0";
const playStoreUrl = String(process.env.PLAY_STORE_URL || "").trim();

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push({ full, name, mtime: st.mtimeMs, size: st.size });
  }
  return acc;
}

function newestMatch(dirs, test) {
  const files = [];
  for (const dir of dirs) walkFiles(dir, files);
  const hits = files.filter((f) => test(f)).sort((a, b) => b.mtime - a.mtime);
  return hits[0] || null;
}

function copyInto(destDir, file) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, file.name);
  fs.copyFileSync(file.full, dest);
  return dest;
}

function bytesLabel(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_OLD = 5;
const latestPath = path.join(releasesRoot, "latest.json");

function sameRelease(a, b) {
  if (!a || !b) return false;
  const aw = a.windows && a.windows.url;
  const bw = b.windows && b.windows.url;
  const aa = a.android && a.android.url;
  const ba = b.android && b.android.url;
  return (
    String(a.date || "") === String(b.date || "") &&
    String(aw || "") === String(bw || "") &&
    String(aa || "") === String(ba || "")
  );
}

function readPrevManifest() {
  try {
    if (!fs.existsSync(latestPath)) return null;
    return JSON.parse(fs.readFileSync(latestPath, "utf8"));
  } catch {
    return null;
  }
}

function buildRotation(prev, next) {
  const candidates = [];
  if (prev && (prev.windows || prev.android) && !sameRelease(prev, next)) {
    candidates.push({
      date: prev.date || "",
      windows: prev.windows || null,
      android: prev.android || null,
    });
  }
  const prior = Array.isArray(prev && prev.history) ? prev.history : [];
  for (const entry of prior) {
    if (!entry || sameRelease(entry, next)) continue;
    if (candidates.some((e) => sameRelease(e, entry))) continue;
    candidates.push({
      date: entry.date || "",
      windows: entry.windows || null,
      android: entry.android || null,
    });
  }
  const history = candidates.slice(0, MAX_OLD);
  const spilled = candidates.slice(MAX_OLD);
  const outdated = [];
  for (const entry of spilled.concat(Array.isArray(prev && prev.outdated) ? prev.outdated : [])) {
    if (!entry || sameRelease(entry, next)) continue;
    if (history.some((e) => sameRelease(e, entry))) continue;
    if (outdated.some((e) => sameRelease(e, entry))) continue;
    outdated.push({
      date: entry.date || "",
      windows: entry.windows || null,
      android: entry.android || null,
    });
  }
  return { history, outdated };
}

const date = process.env.RELEASE_DATE || todayStamp();
const destDir = path.join(releasesRoot, date);
fs.mkdirSync(destDir, { recursive: true });

const exe = newestMatch(
  [path.join(projectRoot, "electron", "dist"), path.join(projectRoot, "electron", "dist-build")],
  (f) =>
    f.name.toLowerCase().endsWith(".exe") &&
    !/uninstaller|blockmap/i.test(f.name)
);

const apk = newestMatch(
  [
    path.join(projectRoot, "android", "app", "build", "outputs", "apk"),
    path.join(projectRoot, "android", "app", "release"),
  ],
  (f) => f.name.toLowerCase().endsWith(".apk") && !/unsigned/i.test(f.name)
);

const prev = readPrevManifest();
const manifest = {
  date,
  stagedAt: new Date().toISOString(),
  windows: null,
  android: null,
};

if (exe) {
  copyInto(destDir, exe);
  manifest.windows = {
    file: exe.name,
    url: `/releases/${date}/${exe.name}`,
    version: windowsVersion,
    bytes: exe.size,
    sizeLabel: bytesLabel(exe.size),
    source: path.relative(projectRoot, exe.full).replace(/\\/g, "/"),
  };
  console.log("[stage-releases] EXE  →", path.join(destDir, exe.name));
} else {
  console.warn("[stage-releases] No Windows EXE found (build electron first).");
}

if (apk) {
  copyInto(destDir, apk);
  manifest.android = {
    file: apk.name,
    url: `/releases/${date}/${apk.name}`,
    version: androidVersion,
    bytes: apk.size,
    sizeLabel: bytesLabel(apk.size),
    source: path.relative(projectRoot, apk.full).replace(/\\/g, "/"),
  };
  if (playStoreUrl) manifest.android.playStoreUrl = playStoreUrl;
  console.log("[stage-releases] APK  →", path.join(destDir, apk.name));
} else {
  console.warn("[stage-releases] No Android APK found (assemble release/debug first).");
}

const rotation = buildRotation(prev, manifest);
manifest.history = rotation.history;
manifest.outdated = rotation.outdated;

fs.writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("[stage-releases] latest.json →", latestPath);
console.log(
  "[stage-releases] kept:",
  1 + manifest.history.length,
  "· outdated:",
  manifest.outdated.length
);
console.log("[stage-releases] Dev download: http://localhost:3000/downloads/");
if (!exe && !apk) process.exitCode = 1;

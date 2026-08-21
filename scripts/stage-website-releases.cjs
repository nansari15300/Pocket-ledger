/**
 * Copy the current EXE + APK into releases/YYYY-MM-DD/ (AAB copied locally for Play Console only).
 * Writes releases/latest.json so localhost:3000/downloads can serve local paths.
 *
 *   npm run website:stage-releases
 */
const fs = require("fs");
const path = require("path");
const {
  readLocalReleaseSettings,
  buildReleaseRotation,
} = require("./release-settings.cjs");

const projectRoot = path.join(__dirname, "..");
const releasesRoot = path.join(projectRoot, "releases");
const windowsVersion =
  process.env.WINDOWS_RELEASE_VERSION ||
  String(require(path.join(projectRoot, "electron", "package.json")).version || "1.0.0");
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

const latestPath = path.join(releasesRoot, "latest.json");

function readPrevManifest() {
  try {
    if (!fs.existsSync(latestPath)) return null;
    return JSON.parse(fs.readFileSync(latestPath, "utf8"));
  } catch {
    return null;
  }
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

const aab = newestMatch(
  [path.join(projectRoot, "android", "app", "build", "outputs", "bundle", "release")],
  (f) => f.name.toLowerCase().endsWith(".aab")
);

const apkFile = newestMatch(
  [
    path.join(projectRoot, "android", "app", "build", "outputs", "apk"),
    path.join(projectRoot, "android", "app", "release"),
  ],
  (f) => f.name.toLowerCase().endsWith(".apk") && !/unsigned/i.test(f.name)
);

const prev = readPrevManifest();
const settings = readLocalReleaseSettings(projectRoot);
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

function stageAndroidArtifact(destDir, file) {
  copyInto(destDir, file);
  const entry = {
    file: file.name,
    url: `/releases/${date}/${file.name}`,
    version: androidVersion,
    format: "apk",
    bytes: file.size,
    sizeLabel: bytesLabel(file.size),
    source: path.relative(projectRoot, file.full).replace(/\\/g, "/"),
  };
  if (playStoreUrl) entry.playStoreUrl = playStoreUrl;
  return entry;
}

if (apkFile) {
  manifest.android = stageAndroidArtifact(destDir, apkFile);
  console.log("[stage-releases] APK  →", path.join(destDir, apkFile.name));
} else {
  console.warn("[stage-releases] No Android APK found (run gradlew assembleRelease).");
}

if (aab) {
  copyInto(destDir, aab);
  console.log("[stage-releases] AAB  →", path.join(destDir, aab.name), "(local only, not in manifest)");
} else {
  console.warn("[stage-releases] No Android AAB found (run gradlew bundleRelease).");
}

const rotation = buildReleaseRotation(prev, manifest, settings);
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
if (!exe && !apkFile && !aab) process.exitCode = 1;

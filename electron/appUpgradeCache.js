const fs = require("fs");
const path = require("path");

const VERSION_MARKER = "pl-packaged-app-version.json";

/** Chromium/Electron disk cache dirs — version bump par stale bundled JS/CSS avoid. */
const DISK_CACHE_DIR_NAMES = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "Service Worker",
  "blob_storage",
];

function clearPackagedDiskCacheDirs(userDataPath) {
  const root = String(userDataPath || "").trim();
  if (!root) return;
  for (const name of DISK_CACHE_DIR_NAMES) {
    try {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    } catch (_) {}
  }
}

function statFingerprintPart(p) {
  try {
    const st = fs.statSync(p);
    return `${path.basename(p)}:${st.size}:${Math.trunc(st.mtimeMs)}`;
  } catch (_) {
    return "";
  }
}

function packagedBuildFingerprint(app) {
  const parts = [];
  try {
    const appPath = typeof app?.getAppPath === "function" ? app.getAppPath() : "";
    if (appPath) {
      parts.push(statFingerprintPart(appPath));
      parts.push(statFingerprintPart(path.join(appPath, "package.json")));
      parts.push(statFingerprintPart(path.join(appPath, "main.js")));
      parts.push(statFingerprintPart(path.join(appPath, "out", "_next")));
      parts.push(statFingerprintPart(path.join(appPath, "out", "index.html")));
    }
  } catch (_) {}
  try {
    const exePath = typeof app?.getPath === "function" ? app.getPath("exe") : "";
    if (exePath) parts.push(statFingerprintPart(exePath));
  } catch (_) {}
  return parts.filter(Boolean).join("|") || "unknown-build";
}

/**
 * Packaged EXE build change: HTTP/code/SW caches reset (login cookies/IndexedDB/SQLite safe).
 * Version may stay same during local builds, so compare a packaged build fingerprint too.
 * @returns {{ upgraded: boolean, version: string, previousVersion: string, buildFingerprint: string }}
 */
async function runPackagedUpgradeCacheRefresh({ app, session, userDataPath }) {
  const version = typeof app?.getVersion === "function" ? app.getVersion() : "unknown";
  const buildFingerprint = packagedBuildFingerprint(app);
  if (!app?.isPackaged || !session) {
    return { upgraded: false, version, previousVersion: version, buildFingerprint };
  }

  const markerPath = path.join(userDataPath, VERSION_MARKER);
  let previous = "";
  let previousBuildFingerprint = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    previous = String(parsed?.version || "");
    previousBuildFingerprint = String(parsed?.buildFingerprint || "");
  } catch (_) {}

  if (previous === version && previousBuildFingerprint === buildFingerprint) {
    return { upgraded: false, version, previousVersion: previous || version, buildFingerprint };
  }

  try {
    await session.clearStorageData({
      storages: ["appcache", "cachestorage", "serviceworkers", "shadercache"],
    });
  } catch (_) {}

  try {
    if (typeof session.clearCache === "function") {
      await session.clearCache();
    }
  } catch (_) {}

  try {
    if (typeof session.clearCodeCache === "function") {
      await session.clearCodeCache();
    }
  } catch (_) {}

  clearPackagedDiskCacheDirs(userDataPath);

  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(
      markerPath,
      JSON.stringify(
        {
          version,
          buildFingerprint,
          previousVersion: previous || null,
          previousBuildFingerprint: previousBuildFingerprint || null,
          refreshedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (_) {}

  return { upgraded: true, version, previousVersion: previous || "", buildFingerprint };
}

module.exports = { runPackagedUpgradeCacheRefresh };

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

/**
 * Packaged EXE version change: HTTP/code/shader caches reset (login cookies/IndexedDB safe).
 * @returns {{ upgraded: boolean, version: string, previousVersion: string }}
 */
async function runPackagedUpgradeCacheRefresh({ app, session, userDataPath }) {
  const version = typeof app?.getVersion === "function" ? app.getVersion() : "unknown";
  if (!app?.isPackaged || !session) {
    return { upgraded: false, version, previousVersion: version };
  }

  const markerPath = path.join(userDataPath, VERSION_MARKER);
  let previous = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    previous = String(parsed?.version || "");
  } catch (_) {}

  if (previous === version) {
    return { upgraded: false, version, previousVersion: previous || version };
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
      JSON.stringify({ version, previousVersion: previous || null, refreshedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (_) {}

  return { upgraded: true, version, previousVersion: previous || "" };
}

module.exports = { runPackagedUpgradeCacheRefresh };

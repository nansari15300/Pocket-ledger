const fs = require("fs");
const path = require("path");

const VERSION_MARKER = "pl-packaged-app-version.json";

async function runPackagedUpgradeCacheRefresh({ app, session, userDataPath }) {
  if (!app?.isPackaged || !session?.clearStorageData) return;

  const version = typeof app.getVersion === "function" ? app.getVersion() : "unknown";
  const markerPath = path.join(userDataPath, VERSION_MARKER);
  let previous = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    previous = String(parsed?.version || "");
  } catch (_) {}

  if (previous === version) return;

  try {
    await session.clearStorageData({
      storages: ["appcache", "cachestorage", "serviceworkers"],
    });
  } catch (_) {}

  try {
    if (typeof session.clearCache === "function") {
      await session.clearCache();
    }
  } catch (_) {}

  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ version, refreshedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (_) {}
}

module.exports = { runPackagedUpgradeCacheRefresh };

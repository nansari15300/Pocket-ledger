const DEFAULTS = {
  downloadsMaxOldExe: 5,
  downloadsMaxOldApk: 5,
  outdatedPolicy: "keep",
  outdatedMaxKeep: 20,
};

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function isMissingSettingValue(value) {
  return value === undefined || value === null || value === "";
}

function normalizeReleaseSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const legacy = isMissingSettingValue(src.downloadsMaxOld) ? null : clamp(src.downloadsMaxOld, 0, 20);
  return {
    downloadsMaxOldExe: isMissingSettingValue(src.downloadsMaxOldExe)
      ? legacy !== null
        ? legacy
        : DEFAULTS.downloadsMaxOldExe
      : clamp(src.downloadsMaxOldExe, 0, 20),
    downloadsMaxOldApk: isMissingSettingValue(src.downloadsMaxOldApk)
      ? legacy !== null
        ? legacy
        : DEFAULTS.downloadsMaxOldApk
      : clamp(src.downloadsMaxOldApk, 0, 20),
    outdatedPolicy: src.outdatedPolicy === "auto_delete" ? "auto_delete" : "keep",
    outdatedMaxKeep: isMissingSettingValue(src.outdatedMaxKeep)
      ? DEFAULTS.outdatedMaxKeep
      : clamp(src.outdatedMaxKeep, 0, 100),
  };
}

function parseReleaseSettingsJson(text) {
  const trimmed = String(text == null ? "" : text).trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function settingsPublicUrl(bucket, prefix = "public-releases") {
  return (
    "https://firebasestorage.googleapis.com/v0/b/" +
    bucket +
    "/o/" +
    encodeURIComponent(prefix + "/release-settings.json") +
    "?alt=media"
  );
}

async function fetchReleaseSettingsRaw(bucket, prefix = "public-releases") {
  try {
    const https = require("https");
    const url = settingsPublicUrl(bucket, prefix);
    const body = await new Promise((resolve) => {
      https
        .get(url, (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () => resolve(res.statusCode === 200 ? text : ""));
        })
        .on("error", () => resolve(""));
    });
    return { body, raw: parseReleaseSettingsJson(body) };
  } catch {
    return { body: "", raw: null };
  }
}

async function fetchReleaseSettings(bucket, prefix = "public-releases") {
  const fetched = await fetchReleaseSettingsRaw(bucket, prefix);
  return normalizeReleaseSettings(fetched.raw);
}

function readLocalReleaseSettings(projectRoot) {
  const fs = require("fs");
  const path = require("path");
  const local = path.join(projectRoot, "releases", "release-settings.json");
  try {
    if (!fs.existsSync(local)) return normalizeReleaseSettings(null);
    return normalizeReleaseSettings(parseReleaseSettingsJson(fs.readFileSync(local, "utf8")));
  } catch {
    return normalizeReleaseSettings(null);
  }
}

function writeLocalReleaseSettings(projectRoot, settingsRaw) {
  const fs = require("fs");
  const path = require("path");
  const settings = normalizeReleaseSettings(settingsRaw);
  const local = path.join(projectRoot, "releases", "release-settings.json");
  fs.mkdirSync(path.dirname(local), { recursive: true });
  const payload = { ...settings, updatedAt: new Date().toISOString() };
  fs.writeFileSync(local, `${JSON.stringify(payload, null, 2)}\n`);
  return local;
}

function cloneReleaseEntry(entry) {
  if (!entry) return null;
  return {
    date: entry.date || "",
    windows: entry.windows || null,
    android: entry.android || null,
  };
}

function isApkAndroid(item) {
  if (!item || !item.url) return false;
  if (item.format === "aab") return false;
  return /\.apk(\?|$)/i.test(String(item.file || item.url || ""));
}

function sameRelease(a, b) {
  if (!a || !b) return false;
  return (
    String(a.date || "") === String(b.date || "") &&
    String(a.windows?.url || "") === String(b.windows?.url || "") &&
    String(a.android?.url || "") === String(b.android?.url || "")
  );
}

function entryHasPlatform(entry, platform) {
  if (platform === "apk") {
    return Boolean(entry && entry.android && isApkAndroid(entry.android));
  }
  return Boolean(entry && entry.windows && entry.windows.url);
}

function downloadsMaxOldForPlatform(settings, platform) {
  return platform === "apk" ? settings.downloadsMaxOldApk : settings.downloadsMaxOldExe;
}

function mergeOlderPool(manifest) {
  const ref = manifest || {};
  const latestSnapshot = cloneReleaseEntry({
    date: ref.date,
    windows: ref.windows,
    android: ref.android,
  });
  const pool = [];
  const sources = []
    .concat(Array.isArray(ref.history) ? ref.history : [])
    .concat(Array.isArray(ref.outdated) ? ref.outdated : []);
  for (const entry of sources) {
    if (!entry || sameRelease(entry, latestSnapshot)) continue;
    if (pool.some((e) => sameRelease(e, entry))) continue;
    pool.push(cloneReleaseEntry(entry));
  }
  pool.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return pool;
}

function selectHistoryForPlatform(pool, platform, maxOld) {
  const selected = [];
  for (const entry of pool) {
    if (!entryHasPlatform(entry, platform)) continue;
    selected.push(cloneReleaseEntry(entry));
    if (selected.length >= maxOld) break;
  }
  return selected;
}

function unionHistoryEntries(lists) {
  const out = [];
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry) continue;
      if (out.some((e) => sameRelease(e, entry))) continue;
      out.push(cloneReleaseEntry(entry));
    }
  }
  out.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return out;
}

function splitPoolForDownloads(pool, settings, prevHistoryLen) {
  const history = unionHistoryEntries([
    selectHistoryForPlatform(pool, "exe", settings.downloadsMaxOldExe),
    selectHistoryForPlatform(pool, "apk", settings.downloadsMaxOldApk),
  ]);
  const afterDownloads = pool.filter(
    (entry) => !history.some((kept) => sameRelease(kept, entry))
  );
  const deleteEntries = [];
  const promotedCount = Math.max(0, history.length - prevHistoryLen);
  const spilledCount = Math.max(0, prevHistoryLen - history.length);

  if (settings.outdatedPolicy === "auto_delete") {
    deleteEntries.push(...afterDownloads.map(cloneReleaseEntry));
  }

  return { history, afterDownloads, deleteEntries, spilledCount, promotedCount };
}

function mergeIntoOutdated(history, afterDownloads, existingOutdated, latestSnapshot) {
  const outdated = [];

  function pushOutdated(entry) {
    if (!entry || sameRelease(entry, latestSnapshot)) return;
    if (history.some((h) => sameRelease(h, entry))) return;
    if (outdated.some((o) => sameRelease(o, entry))) return;
    outdated.push(cloneReleaseEntry(entry));
  }

  for (const entry of afterDownloads) pushOutdated(entry);
  for (const entry of Array.isArray(existingOutdated) ? existingOutdated : []) pushOutdated(entry);
  outdated.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return outdated;
}

function reconcileDownloadsSettings(manifest, settingsRaw) {
  const settings = normalizeReleaseSettings(settingsRaw);
  const ref = manifest || {};
  const prevHistoryLen = Array.isArray(ref.history) ? ref.history.length : 0;
  const pool = mergeOlderPool(ref);
  const split = splitPoolForDownloads(pool, settings, prevHistoryLen);
  const latestSnapshot = cloneReleaseEntry({
    date: ref.date,
    windows: ref.windows,
    android: ref.android,
  });

  const outdated =
    settings.outdatedPolicy === "auto_delete"
      ? mergeIntoOutdated(split.history, [], ref.outdated, latestSnapshot)
      : mergeIntoOutdated(split.history, split.afterDownloads, ref.outdated, latestSnapshot);

  return {
    history: split.history,
    outdated,
    deleteEntries: split.deleteEntries,
    spilledCount: split.spilledCount,
    promotedCount: split.promotedCount,
  };
}

function reconcileHiddenSettings(manifest, settingsRaw) {
  const settings = normalizeReleaseSettings(settingsRaw);
  const ref = manifest || {};
  const latestSnapshot = cloneReleaseEntry({
    date: ref.date,
    windows: ref.windows,
    android: ref.android,
  });
  const history = Array.isArray(ref.history) ? ref.history.map(cloneReleaseEntry) : [];
  let outdated = [];
  const deleteEntries = [];

  for (const entry of Array.isArray(ref.outdated) ? ref.outdated : []) {
    if (!entry || sameRelease(entry, latestSnapshot)) continue;
    if (history.some((h) => sameRelease(h, entry))) continue;
    if (outdated.some((o) => sameRelease(o, entry))) continue;
    outdated.push(cloneReleaseEntry(entry));
  }
  outdated.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  if (
    settings.outdatedPolicy === "keep" &&
    settings.outdatedMaxKeep > 0 &&
    outdated.length > settings.outdatedMaxKeep
  ) {
    const excess = outdated.slice(settings.outdatedMaxKeep);
    outdated = outdated.slice(0, settings.outdatedMaxKeep);
    deleteEntries.push(...excess.map(cloneReleaseEntry));
  }

  return {
    history,
    outdated,
    deleteEntries,
    spilledCount: 0,
    promotedCount: 0,
  };
}

/** @returns {{ history, outdated, deleteEntries }} */
function buildReleaseRotation(prev, next, settingsRaw) {
  const settings = normalizeReleaseSettings(settingsRaw);
  const candidates = [];
  if (prev && (prev.windows || prev.android) && !sameRelease(prev, next)) {
    candidates.push(cloneReleaseEntry(prev));
  }
  for (const entry of Array.isArray(prev?.history) ? prev.history : []) {
    if (!entry || sameRelease(entry, next)) continue;
    if (candidates.some((e) => sameRelease(e, entry))) continue;
    candidates.push(cloneReleaseEntry(entry));
  }
  candidates.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const history = unionHistoryEntries([
    selectHistoryForPlatform(candidates, "exe", settings.downloadsMaxOldExe),
    selectHistoryForPlatform(candidates, "apk", settings.downloadsMaxOldApk),
  ]);
  const spilled = candidates.filter(
    (entry) => !history.some((kept) => sameRelease(kept, entry))
  );
  const deleteEntries = [];
  let outdated = [];

  if (settings.outdatedPolicy === "auto_delete") {
    deleteEntries.push(...spilled.map(cloneReleaseEntry));
  } else {
    outdated = spilled.map(cloneReleaseEntry);
  }

  for (const entry of Array.isArray(prev?.outdated) ? prev.outdated : []) {
    if (!entry || sameRelease(entry, next)) continue;
    if (history.some((e) => sameRelease(e, entry))) continue;
    if (outdated.some((e) => sameRelease(e, entry))) continue;
    outdated.push(cloneReleaseEntry(entry));
  }

  if (settings.outdatedPolicy === "keep" && settings.outdatedMaxKeep > 0) {
    while (outdated.length > settings.outdatedMaxKeep) {
      const removed = outdated.pop();
      if (removed) deleteEntries.push(cloneReleaseEntry(removed));
    }
  }

  return { history, outdated, deleteEntries };
}

function reconcileManifestWithSettings(manifest, settingsRaw) {
  return reconcileDownloadsSettings(manifest, settingsRaw);
}

function buildPublicDownloadEntries(manifest, settingsRaw, platformKind) {
  const settings = normalizeReleaseSettings(settingsRaw);
  const platform = platformKind === "android" ? "apk" : "exe";
  const maxOld = downloadsMaxOldForPlatform(settings, platform);
  const ref = manifest || {};
  const pool = mergeOlderPool(ref);
  const older = selectHistoryForPlatform(pool, platform, maxOld);
  const out = [];

  if (platform === "exe" && ref.windows?.url) {
    out.push({
      date: ref.date || "",
      windows: ref.windows,
      android: null,
      latest: true,
    });
  } else if (platform === "apk") {
    const latestApk = ref.android && isApkAndroid(ref.android) ? ref.android : null;
    if (latestApk) {
      out.push({
        date: ref.date || "",
        windows: null,
        android: latestApk,
        latest: true,
      });
    }
  }

  for (const entry of older) {
    if (platform === "exe" && entry.windows?.url) {
      out.push({
        date: entry.date || "",
        windows: entry.windows,
        android: null,
        latest: false,
      });
    } else if (platform === "apk") {
      const entryApk = entry.android && isApkAndroid(entry.android) ? entry.android : null;
      if (entryApk) {
        out.push({
          date: entry.date || "",
          windows: null,
          android: entryApk,
          latest: false,
        });
      }
    }
  }

  return out.slice(0, maxOld + 1);
}

module.exports = {
  DEFAULTS,
  normalizeReleaseSettings,
  parseReleaseSettingsJson,
  fetchReleaseSettings,
  fetchReleaseSettingsRaw,
  readLocalReleaseSettings,
  writeLocalReleaseSettings,
  buildReleaseRotation,
  buildPublicDownloadEntries,
  reconcileDownloadsSettings,
  reconcileHiddenSettings,
  reconcileManifestWithSettings,
  cloneReleaseEntry,
  sameRelease,
  entryHasPlatform,
  downloadsMaxOldForPlatform,
  settingsPublicUrl,
};

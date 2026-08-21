const DEFAULTS = {
  downloadsMaxOld: 5,
  outdatedPolicy: "keep",
  outdatedMaxKeep: 20,
};

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function normalizeReleaseSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    downloadsMaxOld: clamp(src.downloadsMaxOld, 0, 20),
    outdatedPolicy: src.outdatedPolicy === "auto_delete" ? "auto_delete" : "keep",
    outdatedMaxKeep: clamp(src.outdatedMaxKeep, 0, 100),
  };
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

async function fetchReleaseSettings(bucket) {
  try {
    const https = require("https");
    const url = settingsPublicUrl(bucket);
    const raw = await new Promise((resolve) => {
      https
        .get(url, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            if (res.statusCode !== 200) return resolve(null);
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        })
        .on("error", () => resolve(null));
    });
    return normalizeReleaseSettings(raw);
  } catch {
    return normalizeReleaseSettings(null);
  }
}

function readLocalReleaseSettings(projectRoot) {
  const fs = require("fs");
  const path = require("path");
  const local = path.join(projectRoot, "releases", "release-settings.json");
  try {
    if (!fs.existsSync(local)) return normalizeReleaseSettings(null);
    return normalizeReleaseSettings(JSON.parse(fs.readFileSync(local, "utf8")));
  } catch {
    return normalizeReleaseSettings(null);
  }
}

function cloneReleaseEntry(entry) {
  if (!entry) return null;
  return {
    date: entry.date || "",
    windows: entry.windows || null,
    android: entry.android || null,
  };
}

function sameRelease(a, b) {
  if (!a || !b) return false;
  return (
    String(a.date || "") === String(b.date || "") &&
    String(a.windows?.url || "") === String(b.windows?.url || "") &&
    String(a.android?.url || "") === String(b.android?.url || "")
  );
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

function splitPoolForDownloads(pool, settings, prevHistoryLen) {
  const history = pool.slice(0, settings.downloadsMaxOld);
  const afterDownloads = pool.slice(settings.downloadsMaxOld);
  const deleteEntries = [];
  const promotedCount = Math.max(0, history.length - prevHistoryLen);
  const spilledCount = Math.max(0, prevHistoryLen - settings.downloadsMaxOld);

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
  const history = candidates.slice(0, settings.downloadsMaxOld);
  const spilled = candidates.slice(settings.downloadsMaxOld);
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

module.exports = {
  DEFAULTS,
  normalizeReleaseSettings,
  fetchReleaseSettings,
  readLocalReleaseSettings,
  buildReleaseRotation,
  reconcileDownloadsSettings,
  reconcileHiddenSettings,
  reconcileManifestWithSettings,
  cloneReleaseEntry,
  sameRelease,
  settingsPublicUrl,
};

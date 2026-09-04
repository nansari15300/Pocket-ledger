(function (global) {
  var DEFAULTS = {
    downloadsMaxOldExe: 5,
    downloadsMaxOldApk: 5,
    outdatedPolicy: "keep",
    outdatedMaxKeep: 20,
  };

  function clamp(n, min, max) {
    var v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, Math.trunc(v)));
  }

  function isMissingSettingValue(value) {
    return value === undefined || value === null || value === "";
  }

  function normalizeReleaseSettings(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var legacy = isMissingSettingValue(src.downloadsMaxOld)
      ? null
      : clamp(src.downloadsMaxOld, 0, 20);
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
    var trimmed = String(text == null ? "" : text).trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
    try {
      var parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function isApkAndroid(item) {
    if (!item || !item.url) return false;
    if (item.format === "aab") return false;
    return /\.apk(\?|$)/i.test(String(item.file || item.url || ""));
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
      String(a.windows && a.windows.url || "") === String(b.windows && b.windows.url || "") &&
      String(a.android && a.android.url || "") === String(b.android && b.android.url || "")
    );
  }

  function mergeOlderPool(manifest) {
    var ref = manifest || {};
    var latestSnapshot = cloneReleaseEntry({
      date: ref.date,
      windows: ref.windows,
      android: ref.android,
    });
    var pool = [];
    var sources = []
      .concat(Array.isArray(ref.history) ? ref.history : [])
      .concat(Array.isArray(ref.outdated) ? ref.outdated : []);
    for (var i = 0; i < sources.length; i++) {
      var entry = sources[i];
      if (!entry || sameRelease(entry, latestSnapshot)) continue;
      var dup = false;
      for (var j = 0; j < pool.length; j++) {
        if (sameRelease(pool[j], entry)) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      pool.push(cloneReleaseEntry(entry));
    }
    pool.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    return pool;
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

  function selectHistoryForPlatform(pool, platform, maxOld) {
    var selected = [];
    for (var i = 0; i < pool.length; i++) {
      var entry = pool[i];
      if (!entryHasPlatform(entry, platform)) continue;
      selected.push(cloneReleaseEntry(entry));
      if (selected.length >= maxOld) break;
    }
    return selected;
  }

  function unionHistoryEntries(lists) {
    var out = [];
    for (var l = 0; l < lists.length; l++) {
      var list = lists[l] || [];
      for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        if (!entry) continue;
        var dup = false;
        for (var j = 0; j < out.length; j++) {
          if (sameRelease(out[j], entry)) {
            dup = true;
            break;
          }
        }
        if (dup) continue;
        out.push(cloneReleaseEntry(entry));
      }
    }
    out.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    return out;
  }

  function splitPoolForDownloads(pool, settings, prevHistoryLen) {
    var exeHist = selectHistoryForPlatform(pool, "exe", settings.downloadsMaxOldExe);
    var apkHist = selectHistoryForPlatform(pool, "apk", settings.downloadsMaxOldApk);
    var history = unionHistoryEntries([exeHist, apkHist]);
    var afterDownloads = [];
    for (var i = 0; i < pool.length; i++) {
      var entry = pool[i];
      var inHist = false;
      for (var h = 0; h < history.length; h++) {
        if (sameRelease(history[h], entry)) {
          inHist = true;
          break;
        }
      }
      if (!inHist) afterDownloads.push(entry);
    }
    var deleteEntries = [];
    var promotedCount = Math.max(0, history.length - prevHistoryLen);
    var spilledCount = Math.max(0, prevHistoryLen - history.length);

    if (settings.outdatedPolicy === "auto_delete") {
      for (var d = 0; d < afterDownloads.length; d++) {
        deleteEntries.push(cloneReleaseEntry(afterDownloads[d]));
      }
    }

    return {
      history: history,
      afterDownloads: afterDownloads,
      deleteEntries: deleteEntries,
      spilledCount: spilledCount,
      promotedCount: promotedCount,
    };
  }

  function mergeIntoOutdated(history, afterDownloads, existingOutdated, latestSnapshot) {
    var outdated = [];

    function pushOutdated(entry) {
      if (!entry || sameRelease(entry, latestSnapshot)) return;
      for (var h = 0; h < history.length; h++) {
        if (sameRelease(history[h], entry)) return;
      }
      for (var o = 0; o < outdated.length; o++) {
        if (sameRelease(outdated[o], entry)) return;
      }
      outdated.push(cloneReleaseEntry(entry));
    }

    for (var i = 0; i < afterDownloads.length; i++) {
      pushOutdated(afterDownloads[i]);
    }
    var prevOut = Array.isArray(existingOutdated) ? existingOutdated : [];
    for (var k = 0; k < prevOut.length; k++) {
      pushOutdated(prevOut[k]);
    }
    outdated.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    return outdated;
  }

  /** Downloads dropdown only — does not trim hidden list by outdatedMaxKeep. */
  function reconcileDownloadsSettings(manifest, settingsRaw) {
    var settings = normalizeReleaseSettings(settingsRaw);
    var ref = manifest || {};
    var prevHistoryLen = Array.isArray(ref.history) ? ref.history.length : 0;
    var pool = mergeOlderPool(ref);
    var split = splitPoolForDownloads(pool, settings, prevHistoryLen);
    var latestSnapshot = cloneReleaseEntry({
      date: ref.date,
      windows: ref.windows,
      android: ref.android,
    });
    var outdated = [];

    if (settings.outdatedPolicy === "auto_delete") {
      outdated = mergeIntoOutdated(split.history, [], ref.outdated, latestSnapshot);
    } else {
      outdated = mergeIntoOutdated(
        split.history,
        split.afterDownloads,
        ref.outdated,
        latestSnapshot
      );
    }

    return {
      history: split.history,
      outdated: outdated,
      deleteEntries: split.deleteEntries,
      spilledCount: split.spilledCount,
      promotedCount: split.promotedCount,
    };
  }

  /** Hidden / outdated only — never moves builds in or out of Downloads history. */
  function reconcileHiddenSettings(manifest, settingsRaw) {
    var settings = normalizeReleaseSettings(settingsRaw);
    var ref = manifest || {};
    var latestSnapshot = cloneReleaseEntry({
      date: ref.date,
      windows: ref.windows,
      android: ref.android,
    });
    var history = Array.isArray(ref.history)
      ? ref.history.map(function (e) {
          return cloneReleaseEntry(e);
        })
      : [];
    var outdated = [];
    var deleteEntries = [];
    var sources = Array.isArray(ref.outdated) ? ref.outdated : [];

    for (var i = 0; i < sources.length; i++) {
      var entry = sources[i];
      if (!entry || sameRelease(entry, latestSnapshot)) continue;
      var inHist = false;
      for (var h = 0; h < history.length; h++) {
        if (sameRelease(history[h], entry)) {
          inHist = true;
          break;
        }
      }
      if (inHist) continue;
      var dup = false;
      for (var j = 0; j < outdated.length; j++) {
        if (sameRelease(outdated[j], entry)) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      outdated.push(cloneReleaseEntry(entry));
    }
    outdated.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });

    if (
      settings.outdatedPolicy === "keep" &&
      settings.outdatedMaxKeep > 0 &&
      outdated.length > settings.outdatedMaxKeep
    ) {
      var excess = outdated.slice(settings.outdatedMaxKeep);
      outdated = outdated.slice(0, settings.outdatedMaxKeep);
      for (var e = 0; e < excess.length; e++) {
        deleteEntries.push(cloneReleaseEntry(excess[e]));
      }
    }

    return {
      history: history,
      outdated: outdated,
      deleteEntries: deleteEntries,
      spilledCount: 0,
      promotedCount: 0,
    };
  }

  function reconcileManifestWithSettings(manifest, settingsRaw) {
    return reconcileDownloadsSettings(manifest, settingsRaw);
  }

  function buildReleaseRotation(prev, next, settingsRaw) {
    var settings = normalizeReleaseSettings(settingsRaw);
    var candidates = [];
    if (prev && (prev.windows || prev.android) && !sameRelease(prev, next)) {
      candidates.push(cloneReleaseEntry(prev));
    }
    var prior = Array.isArray(prev && prev.history) ? prev.history : [];
    for (var i = 0; i < prior.length; i++) {
      var entry = prior[i];
      if (!entry || sameRelease(entry, next)) continue;
      var dup = false;
      for (var j = 0; j < candidates.length; j++) {
        if (sameRelease(candidates[j], entry)) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      candidates.push(cloneReleaseEntry(entry));
    }
    candidates.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    var history = unionHistoryEntries([
      selectHistoryForPlatform(candidates, "exe", settings.downloadsMaxOldExe),
      selectHistoryForPlatform(candidates, "apk", settings.downloadsMaxOldApk),
    ]);
    var spilled = [];
    for (var s = 0; s < candidates.length; s++) {
      var candidate = candidates[s];
      var kept = false;
      for (var h = 0; h < history.length; h++) {
        if (sameRelease(history[h], candidate)) {
          kept = true;
          break;
        }
      }
      if (!kept) spilled.push(candidate);
    }
    var deleteEntries = [];
    var outdated = [];
    if (settings.outdatedPolicy === "auto_delete") {
      for (var s = 0; s < spilled.length; s++) deleteEntries.push(cloneReleaseEntry(spilled[s]));
    } else {
      for (var o = 0; o < spilled.length; o++) outdated.push(cloneReleaseEntry(spilled[o]));
    }
    var prevOut = Array.isArray(prev && prev.outdated) ? prev.outdated : [];
    for (var k = 0; k < prevOut.length; k++) {
      var old = prevOut[k];
      if (!old || sameRelease(old, next)) continue;
      var inHist = false;
      for (var h = 0; h < history.length; h++) {
        if (sameRelease(history[h], old)) {
          inHist = true;
          break;
        }
      }
      if (inHist) continue;
      var seen = false;
      for (var x = 0; x < outdated.length; x++) {
        if (sameRelease(outdated[x], old)) {
          seen = true;
          break;
        }
      }
      if (seen) continue;
      outdated.push(cloneReleaseEntry(old));
    }
    if (settings.outdatedPolicy === "keep" && settings.outdatedMaxKeep > 0) {
      while (outdated.length > settings.outdatedMaxKeep) {
        var removed = outdated.pop();
        if (removed) deleteEntries.push(cloneReleaseEntry(removed));
      }
    }
    return { history: history, outdated: outdated, deleteEntries: deleteEntries };
  }

  function reconcileManifestWithSettings(manifest, settingsRaw) {
    return reconcileDownloadsSettings(manifest, settingsRaw);
  }

  /** Latest + older builds for one platform in the public Downloads dropdown. */
  function buildPublicDownloadEntries(manifest, settingsRaw, platformKind) {
    var settings = normalizeReleaseSettings(settingsRaw);
    var platform = platformKind === "android" ? "apk" : "exe";
    var maxOld = downloadsMaxOldForPlatform(settings, platform);
    var ref = manifest || {};
    var pool = mergeOlderPool(ref);
    var older = selectHistoryForPlatform(pool, platform, maxOld);
    var out = [];
    if (platform === "exe" && ref.windows && ref.windows.url) {
      out.push({
        date: ref.date || "",
        windows: ref.windows,
        android: null,
        latest: true,
      });
    } else if (platform === "apk") {
      var latestApk = ref.android && isApkAndroid(ref.android) ? ref.android : null;
      if (latestApk) {
        out.push({
          date: ref.date || "",
          windows: null,
          android: latestApk,
          latest: true,
        });
      }
    }
    for (var i = 0; i < older.length; i++) {
      var entry = older[i];
      if (platform === "exe" && entry.windows && entry.windows.url) {
        out.push({
          date: entry.date || "",
          windows: entry.windows,
          android: null,
          latest: false,
        });
      } else if (platform === "apk") {
        var entryApk = entry.android && isApkAndroid(entry.android) ? entry.android : null;
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

  global.reconcileDownloadsSettings = reconcileDownloadsSettings;
  global.reconcileHiddenSettings = reconcileHiddenSettings;
  global.buildPublicDownloadEntries = buildPublicDownloadEntries;

  global.POCKET_LEDGER_RELEASE_SETTINGS_DEFAULTS = DEFAULTS;
  global.parseReleaseSettingsJson = parseReleaseSettingsJson;
  global.normalizeReleaseSettings = normalizeReleaseSettings;
  global.isApkAndroidRelease = isApkAndroid;
  global.buildReleaseRotation = buildReleaseRotation;
  global.reconcileManifestWithSettings = reconcileManifestWithSettings;
  global.cloneReleaseEntry = cloneReleaseEntry;
  global.sameReleaseEntry = sameRelease;
  global.entryHasPlatformRelease = entryHasPlatform;
  global.downloadsMaxOldForPlatform = downloadsMaxOldForPlatform;
  global.POCKET_LEDGER_RELEASE_MAX_OLD = DEFAULTS.downloadsMaxOldExe;
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  var DEFAULTS = {
    downloadsMaxOld: 5,
    outdatedPolicy: "keep",
    outdatedMaxKeep: 20,
  };

  function clamp(n, min, max) {
    var v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, Math.trunc(v)));
  }

  function normalizeReleaseSettings(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    return {
      downloadsMaxOld: clamp(src.downloadsMaxOld, 0, 20),
      outdatedPolicy: src.outdatedPolicy === "auto_delete" ? "auto_delete" : "keep",
      outdatedMaxKeep: clamp(src.outdatedMaxKeep, 0, 100),
    };
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

  function splitPoolForDownloads(pool, settings, prevHistoryLen) {
    var history = pool.slice(0, settings.downloadsMaxOld);
    var afterDownloads = pool.slice(settings.downloadsMaxOld);
    var deleteEntries = [];
    var outdated = [];
    var promotedCount = Math.max(0, history.length - prevHistoryLen);
    var spilledCount = Math.max(0, prevHistoryLen - settings.downloadsMaxOld);

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
    var maxOld = settings.downloadsMaxOld;
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
    var history = candidates.slice(0, maxOld);
    var spilled = candidates.slice(maxOld);
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

  global.reconcileDownloadsSettings = reconcileDownloadsSettings;
  global.reconcileHiddenSettings = reconcileHiddenSettings;

  global.POCKET_LEDGER_RELEASE_SETTINGS_DEFAULTS = DEFAULTS;
  global.normalizeReleaseSettings = normalizeReleaseSettings;
  global.isApkAndroidRelease = isApkAndroid;
  global.buildReleaseRotation = buildReleaseRotation;
  global.reconcileManifestWithSettings = reconcileManifestWithSettings;
  global.cloneReleaseEntry = cloneReleaseEntry;
  global.sameReleaseEntry = sameRelease;
  global.POCKET_LEDGER_RELEASE_MAX_OLD = DEFAULTS.downloadsMaxOld;
})(typeof window !== "undefined" ? window : globalThis);

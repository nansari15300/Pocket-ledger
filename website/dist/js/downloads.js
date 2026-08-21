(function () {
  var LOCAL_MANIFEST = "/releases/latest.json";
  var cachedSettings = { downloadsMaxOld: 5 };

  function isLocalHost() {
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  }

  function firebaseLatestUrl() {
    var cfg = window.POCKET_LEDGER_FIREBASE || {};
    var bucket = cfg.storageBucket || "";
    var prefix = window.POCKET_LEDGER_RELEASE_PREFIX || "public-releases";
    if (!bucket) return "";
    return (
      "https://firebasestorage.googleapis.com/v0/b/" +
      bucket +
      "/o/" +
      encodeURIComponent(prefix + "/latest.json") +
      "?alt=media"
    );
  }

  function firebaseSettingsUrl() {
    var cfg = window.POCKET_LEDGER_FIREBASE || {};
    var bucket = cfg.storageBucket || "";
    var prefix = window.POCKET_LEDGER_RELEASE_PREFIX || "public-releases";
    if (!bucket) return "";
    return (
      "https://firebasestorage.googleapis.com/v0/b/" +
      bucket +
      "/o/" +
      encodeURIComponent(prefix + "/release-settings.json") +
      "?alt=media"
    );
  }

  function normalizeSettings(raw) {
    return typeof window.normalizeReleaseSettings === "function"
      ? window.normalizeReleaseSettings(raw)
      : { downloadsMaxOld: 5, outdatedPolicy: "keep", outdatedMaxKeep: 20 };
  }

  function maxKeep() {
    return cachedSettings.downloadsMaxOld + 1;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function sameRelease(a, b) {
    if (typeof window.sameReleaseEntry === "function") return window.sameReleaseEntry(a, b);
    if (!a || !b) return false;
    return (
      String(a.date || "") === String(b.date || "") &&
      String(a.windows && a.windows.url || "") === String(b.windows && b.windows.url || "") &&
      String(a.android && a.android.url || "") === String(b.android && b.android.url || "")
    );
  }

  function isApkAndroid(item) {
    return typeof window.isApkAndroidRelease === "function"
      ? window.isApkAndroidRelease(item)
      : Boolean(item && item.url && item.format !== "aab");
  }

  function pickApkEntry(data) {
    if (!data || !data.android) return null;
    return isApkAndroid(data.android) ? data.android : null;
  }

  function keptEntries(data) {
    var out = [];
    if (data && (data.windows || pickApkEntry(data))) {
      out.push({
        date: data.date || "",
        windows: data.windows || null,
        android: pickApkEntry(data),
        latest: true,
      });
    }
    var history = Array.isArray(data && data.history) ? data.history : [];
    history.forEach(function (entry) {
      if (!entry || sameRelease(entry, data)) return;
      if (out.some(function (e) {
        return sameRelease(e, entry);
      }))
        return;
      out.push({
        date: entry.date || "",
        windows: entry.windows || null,
        android: pickApkEntry(entry),
        latest: false,
      });
    });
    return out.slice(0, maxKeep());
  }

  function optionLabel(entry, kind) {
    var item = entry && entry[kind];
    var ver = item && item.version ? "v" + item.version : "—";
    var date = entry.date || "unknown";
    return ver + " · " + date + (entry.latest ? " (latest)" : "");
  }

  function applyItem(kind, item, source) {
    var btn = $(kind + "Btn");
    var meta = $(kind + "Meta");
    if (!btn || !meta) return;
    if (!item || !item.url) {
      btn.removeAttribute("href");
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("is-disabled");
      btn.removeAttribute("data-track-platform");
      meta.textContent = isLocalHost()
        ? "Not staged yet — run npm run website:stage-releases"
        : "Not published yet — upload from /admin-release/";
      return;
    }
    btn.classList.remove("is-disabled");
    btn.removeAttribute("aria-disabled");
    btn.setAttribute("href", item.url);
    btn.setAttribute("data-track-platform", kind === "windows" ? "windows" : "android");
    if (kind === "android") {
      btn.textContent = "Download APK";
    }
    if (item.version) btn.setAttribute("data-track-version", String(item.version));
    else btn.removeAttribute("data-track-version");
    if (item.file) btn.setAttribute("data-track-file", String(item.file));
    else btn.removeAttribute("data-track-file");
    btn.setAttribute("data-track-source", String(source || ""));
    var bits = [];
    if (item.file) bits.push(item.file);
    if (item.version) bits.push("v" + item.version);
    if (item.sizeLabel) bits.push(item.sizeLabel);
    if (source === "local") bits.push("local path");
    if (source === "firebase") bits.push("Firebase");
    meta.textContent = bits.join(" · ");
  }

  function trackDownload(platform, extras) {
    try {
      var payload = {
        platform: platform,
        version: (extras && extras.version) || "",
        fileName: (extras && extras.fileName) || "",
        source: (extras && extras.source) || "",
      };
      void fetch("/app/api/public/download-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        cache: "no-store",
      });
    } catch (_) {
      /* analytics must never block download */
    }
  }

  function bindDownloadTracking() {
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var link = target.closest("a[data-track-platform]");
      if (!link || link.getAttribute("aria-disabled") === "true") return;
      trackDownload(link.getAttribute("data-track-platform"), {
        version: link.getAttribute("data-track-version") || "",
        fileName: link.getAttribute("data-track-file") || "",
        source: link.getAttribute("data-track-source") || "",
      });
    });
  }

  function setupVersionSelect(kind, entries, source) {
    var select = $(kind + "VersionSelect");
    if (!select) return;

    var options = entries.filter(function (e) {
      return e[kind] && e[kind].url;
    });
    var seen = {};
    options = options.filter(function (e) {
      var item = e[kind];
      var key =
        String(item.version || "") +
        "|" +
        String(e.date || "") +
        "|" +
        String(item.file || item.url || "");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    select.innerHTML = "";
    if (!options.length) {
      select.disabled = true;
      select.hidden = true;
      applyItem(kind, null, source);
      return;
    }

    select.disabled = false;
    select.hidden = false;
    options.forEach(function (entry, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = optionLabel(entry, kind);
      select.appendChild(opt);
    });
    select.selectedIndex = 0;
    applyItem(kind, options[0][kind], source);

    select.onchange = function () {
      var picked = options[Number(select.value)] || options[0];
      applyItem(kind, picked && picked[kind], source);
    };
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function loadSettings() {
    if (isLocalHost()) return cachedSettings;
    var url = firebaseSettingsUrl();
    if (!url) return cachedSettings;
    try {
      cachedSettings = normalizeSettings(await fetchJson(url));
    } catch (_) {
      cachedSettings = normalizeSettings(null);
    }
    return cachedSettings;
  }

  async function loadManifest() {
    if (isLocalHost()) {
      try {
        var local = await fetchJson(LOCAL_MANIFEST);
        return { source: "local", data: local };
      } catch (_) {
        /* fall through to Firebase */
      }
    }
    var remote = firebaseLatestUrl();
    if (!remote) return { source: "none", data: null };
    try {
      var data = await fetchJson(remote);
      return { source: "firebase", data: data };
    } catch (_) {
      return { source: "none", data: null };
    }
  }

  Promise.all([loadSettings(), loadManifest()]).then(function (results) {
    var pack = results[1];
    var data = pack.data || {};
    var source = pack.source;
    var note = $("releaseNote");
    if (note) {
      if (source === "local" && data.date) {
        note.textContent = "Local staged build · " + data.date;
      } else if (source === "firebase" && data.date) {
        note.textContent = "Published build · " + data.date;
      } else {
        note.textContent = isLocalHost()
          ? "No local EXE/APK staged yet."
          : "No published installer yet.";
      }
    }
    var entries = keptEntries(data);
    setupVersionSelect("windows", entries, source);
    setupVersionSelect("android", entries, source);
    var playBtn = $("playStoreBtn");
    if (playBtn) {
      var playUrl = (data.android && data.android.playStoreUrl) || data.playStoreUrl;
      if (playUrl) {
        playBtn.href = playUrl;
        playBtn.hidden = false;
        playBtn.setAttribute("data-track-platform", "play");
        playBtn.setAttribute("data-track-source", source);
      }
    }
  });

  bindDownloadTracking();
})();

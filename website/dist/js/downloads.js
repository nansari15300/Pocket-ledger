(function () {
  var LOCAL_MANIFEST = "/releases/latest.json";
  var MAX_OLD = 5;
  var MAX_KEEP = MAX_OLD + 1;

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

  function $(id) {
    return document.getElementById(id);
  }

  function sameRelease(a, b) {
    if (!a || !b) return false;
    var aw = a.windows && a.windows.url;
    var bw = b.windows && b.windows.url;
    var aa = a.android && a.android.url;
    var ba = b.android && b.android.url;
    return (
      String(a.date || "") === String(b.date || "") &&
      String(aw || "") === String(bw || "") &&
      String(aa || "") === String(ba || "")
    );
  }

  function keptEntries(data) {
    var out = [];
    if (data && (data.windows || data.android)) {
      out.push({
        date: data.date || "",
        windows: data.windows || null,
        android: data.android || null,
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
        android: entry.android || null,
        latest: false,
      });
    });
    return out.slice(0, MAX_KEEP);
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
      meta.textContent = isLocalHost()
        ? "Not staged yet — run npm run website:stage-releases"
        : "Not published yet — upload from /admin-release/";
      return;
    }
    btn.classList.remove("is-disabled");
    btn.removeAttribute("aria-disabled");
    btn.setAttribute("href", item.url);
    var bits = [];
    if (item.file) bits.push(item.file);
    if (item.version) bits.push("v" + item.version);
    if (item.sizeLabel) bits.push(item.sizeLabel);
    if (source === "local") bits.push("local path");
    if (source === "firebase") bits.push("Firebase");
    meta.textContent = bits.join(" · ");
  }

  function setupVersionSelect(kind, entries, source) {
    var select = $(kind + "VersionSelect");
    if (!select) return;

    var options = entries.filter(function (e) {
      return e[kind] && e[kind].url;
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

  loadManifest().then(function (pack) {
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
      }
    }
  });
})();

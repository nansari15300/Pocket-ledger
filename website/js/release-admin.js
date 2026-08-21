(function () {
  var prefix = window.POCKET_LEDGER_RELEASE_PREFIX || "public-releases";
  var OWNER = String(window.RELEASE_ADMIN_OWNER || "nansari15300@gmail.com")
    .trim()
    .toLowerCase();
  var ADMINS_PATH = prefix + "/admins.json";
  var runtimeAdmins = [];
  var currentUser = null;

  var statusEl = document.getElementById("status");
  var authBox = document.getElementById("authBox");
  var uploadBox = document.getElementById("uploadBox");
  var whoEl = document.getElementById("who");
  var progressEl = document.getElementById("progress");
  var outBtn = document.getElementById("outBtn");
  var adminListEl = document.getElementById("adminList");
  var outdatedListEl = document.getElementById("outdatedList");
  var outdatedEmptyEl = document.getElementById("outdatedEmpty");
  var deleteAllOutdatedBtn = document.getElementById("deleteAllOutdatedBtn");
  var visibleReleaseListEl = document.getElementById("visibleReleaseList");
  var visibleReleaseEmptyEl = document.getElementById("visibleReleaseEmpty");
  var downloadsMaxOldInput = document.getElementById("downloadsMaxOld");
  var outdatedPolicySelect = document.getElementById("outdatedPolicy");
  var outdatedMaxKeepInput = document.getElementById("outdatedMaxKeep");
  var outdatedMaxKeepRow = document.getElementById("outdatedMaxKeepRow");
  var saveSettingsBtn = document.getElementById("saveSettingsBtn");
  var saveDownloadsSettingsBtn = document.getElementById("saveDownloadsSettingsBtn");
  var tabExeBtn = document.getElementById("tabExe");
  var tabApkBtn = document.getElementById("tabApk");
  var visibleListHint = document.getElementById("visibleListHint");
  var outdatedListHint = document.getElementById("outdatedListHint");
  var storagePathHint = document.getElementById("storagePathHint");
  var cachedManifest = null;
  var cachedSettings = normalizeReleaseSettings(null);
  var visibleListTab = "exe";
  var SETTINGS_PATH = prefix + "/release-settings.json";

  function normalizeReleaseSettings(raw) {
    return typeof window.normalizeReleaseSettings === "function"
      ? window.normalizeReleaseSettings(raw)
      : { downloadsMaxOld: 5, outdatedPolicy: "keep", outdatedMaxKeep: 20 };
  }

  function cloneReleaseEntry(entry) {
    return typeof window.cloneReleaseEntry === "function"
      ? window.cloneReleaseEntry(entry)
      : entry;
  }

  function buildRotation(prev, next) {
    return typeof window.buildReleaseRotation === "function"
      ? window.buildReleaseRotation(prev, next, cachedSettings)
      : { history: [], outdated: [], deleteEntries: [] };
  }

  function reconcileManifest(manifest, settings, mode) {
    if (mode === "hidden") {
      return typeof window.reconcileHiddenSettings === "function"
        ? window.reconcileHiddenSettings(manifest, settings)
        : { history: [], outdated: [], deleteEntries: [], spilledCount: 0, promotedCount: 0 };
    }
    return typeof window.reconcileDownloadsSettings === "function"
      ? window.reconcileDownloadsSettings(manifest, settings)
      : typeof window.reconcileManifestWithSettings === "function"
        ? window.reconcileManifestWithSettings(manifest, settings)
        : { history: [], outdated: [], deleteEntries: [], spilledCount: 0, promotedCount: 0 };
  }

  function readSettingsFromForm() {
    return normalizeReleaseSettings({
      downloadsMaxOld: downloadsMaxOldInput && downloadsMaxOldInput.value,
      outdatedPolicy: outdatedPolicySelect && outdatedPolicySelect.value,
      outdatedMaxKeep: outdatedMaxKeepInput && outdatedMaxKeepInput.value,
    });
  }

  async function applySettingsSave(mode) {
    if (!currentUser || !allowedEmail(currentUser.email)) {
      setStatus("Not allowed.", false);
      return;
    }
    var nextSettings = readSettingsFromForm();
    try {
      setStatus("Saving release settings…", true);
      if (!cachedManifest) {
        await loadManifest();
      }
      var recon = reconcileManifest(cachedManifest, nextSettings, mode);
      var manifestChanged =
        JSON.stringify(cachedManifest && cachedManifest.history) !== JSON.stringify(recon.history) ||
        JSON.stringify(cachedManifest && cachedManifest.outdated) !== JSON.stringify(recon.outdated);
      var deleteList = Array.isArray(recon.deleteEntries) ? recon.deleteEntries : [];

      if (deleteList.length > 0) {
        var okDelete = await confirmDialog({
          title: "Delete builds?",
          message:
            "Delete " +
            deleteList.length +
            " build(s) from Firebase Storage permanently?",
          items: deleteList.map(entrySummaryLabel),
          confirmLabel: "Delete permanently",
          danger: true,
        });
        if (!okDelete) {
          applySettingsToForm();
          setStatus("Settings not saved — delete cancelled.", false);
          return;
        }
        for (var d = 0; d < deleteList.length; d++) {
          await deleteReleaseFiles(deleteList[d]);
        }
      }

      if (manifestChanged && cachedManifest) {
        var nextManifest = Object.assign({}, cachedManifest);
        nextManifest.history = recon.history;
        nextManifest.outdated = recon.outdated;
        await saveManifest(nextManifest);
        renderVisibleReleaseList();
        renderOutdatedList();
      }

      cachedSettings = nextSettings;
      var payload = Object.assign({ updatedAt: new Date().toISOString() }, cachedSettings);
      await storage.ref().child(SETTINGS_PATH).put(JSON.stringify(payload, null, 2), {
        contentType: "application/json",
        cacheControl: "public,max-age=60",
      });
      applySettingsToForm();
      if (mode === "downloads" && recon.spilledCount > 0 && nextSettings.outdatedPolicy === "keep") {
        setStatus(
          "Settings saved. Moved " + recon.spilledCount + " build(s) to Hidden / outdated.",
          true
        );
      } else if (mode === "downloads" && recon.promotedCount > 0) {
        setStatus(
          "Settings saved. Moved " + recon.promotedCount + " build(s) to Downloads dropdown.",
          true
        );
      } else if (deleteList.length > 0) {
        setStatus("Settings saved. Deleted " + deleteList.length + " build(s) from Storage.", true);
      } else {
        setStatus("Release settings saved.", true);
      }
    } catch (err) {
      applySettingsToForm();
      setStatus(err.message || String(err), false);
    }
  }

  async function saveDownloadsSettings() {
    await applySettingsSave("downloads");
  }

  async function saveHiddenSettings() {
    await applySettingsSave("hidden");
  }

  function entrySummaryLabel(entry) {
    var bits = [entry.date || "unknown"];
    if (entry.windows && entry.windows.version) bits.push("EXE v" + entry.windows.version);
    if (entry.windows && entry.windows.file) bits.push(entry.windows.file);
    var apk = entry.android && isApkAndroid(entry.android) ? entry.android : null;
    if (apk && apk.version) bits.push("APK v" + apk.version);
    if (apk && apk.file) bits.push(apk.file);
    return bits.join(" · ");
  }

  function confirmDialog(options) {
    options = options || {};
    var modal = document.getElementById("releaseConfirmModal");
    var titleEl = document.getElementById("releaseConfirmTitle");
    var messageEl = document.getElementById("releaseConfirmMessage");
    var listEl = document.getElementById("releaseConfirmList");
    var okBtn = document.getElementById("releaseConfirmOk");
    var cancelBtn = document.getElementById("releaseConfirmCancel");
    var backdrop = modal && modal.querySelector("[data-confirm-cancel]");

    return new Promise(function (resolve) {
      if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
        resolve(
          window.confirm(
            String(options.title || "Confirm") + "\n\n" + String(options.message || "")
          )
        );
        return;
      }

      titleEl.textContent = options.title || "Confirm";
      messageEl.textContent = options.message || "";
      var items = Array.isArray(options.items) ? options.items : [];
      listEl.innerHTML = "";
      if (items.length) {
        listEl.hidden = false;
        items.forEach(function (text) {
          var li = document.createElement("li");
          li.textContent = text;
          listEl.appendChild(li);
        });
      } else {
        listEl.hidden = true;
      }

      okBtn.textContent = options.confirmLabel || "Confirm";
      cancelBtn.textContent = options.cancelLabel || "Cancel";
      okBtn.className = options.danger
        ? "btn btn-outline btn-sm btn-danger"
        : "btn btn-primary btn-sm";

      function finish(value) {
        modal.hidden = true;
        document.body.classList.remove("release-confirm-open");
        document.removeEventListener("keydown", onKey);
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        if (backdrop) backdrop.onclick = null;
        resolve(value);
      }

      function onKey(event) {
        if (event.key === "Escape") finish(false);
      }

      okBtn.onclick = function () {
        finish(true);
      };
      cancelBtn.onclick = function () {
        finish(false);
      };
      if (backdrop) {
        backdrop.onclick = function () {
          finish(false);
        };
      }

      document.addEventListener("keydown", onKey);
      modal.hidden = false;
      document.body.classList.add("release-confirm-open");
      cancelBtn.focus();
    });
  }

  function isApkAndroid(item) {
    return typeof window.isApkAndroidRelease === "function"
      ? window.isApkAndroidRelease(item)
      : Boolean(item && item.url);
  }

  function settingsPublicUrl() {
    return (
      "https://firebasestorage.googleapis.com/v0/b/" +
      window.POCKET_LEDGER_FIREBASE.storageBucket +
      "/o/" +
      encodeURIComponent(SETTINGS_PATH) +
      "?alt=media"
    );
  }

  function entryLabelExe(entry) {
    var bits = [entry.date || "unknown"];
    if (entry.windows && entry.windows.version) bits.push("EXE v" + entry.windows.version);
    else bits.push("No EXE");
    return bits.join(" · ");
  }

  function entryLabelApk(entry) {
    var bits = [entry.date || "unknown"];
    var apk = entry.android && isApkAndroid(entry.android) ? entry.android : null;
    if (apk && apk.version) bits.push("APK v" + apk.version);
    else bits.push("No APK");
    return bits.join(" · ");
  }

  function entryFilesLineExe(entry) {
    return (entry.windows && entry.windows.file) || "No EXE file";
  }

  function entryFilesLineApk(entry) {
    var apk = entry.android && isApkAndroid(entry.android) ? entry.android : null;
    return (apk && apk.file) || "No APK file";
  }

  function entryLabel(entry) {
    return visibleListTab === "apk" ? entryLabelApk(entry) : entryLabelExe(entry);
  }

  function entryFilesLine(entry) {
    return visibleListTab === "apk" ? entryFilesLineApk(entry) : entryFilesLineExe(entry);
  }

  function entryHasPlatform(entry, platform) {
    if (platform === "apk") {
      return Boolean(entry.android && isApkAndroid(entry.android));
    }
    return Boolean(entry.windows && entry.windows.url);
  }

  function updateSettingsHint() {
    var maxOld = cachedSettings.downloadsMaxOld;
    var total = maxOld + 1;
    if (visibleListHint) {
      visibleListHint.textContent =
        "Users see latest + " +
        maxOld +
        " older build(s) (" +
        total +
        " max per platform in the Downloads dropdown).";
    }
    if (outdatedListHint) {
      outdatedListHint.textContent =
        cachedSettings.outdatedPolicy === "auto_delete"
          ? "Hidden builds are auto-deleted from Firebase Storage when they leave the downloads list."
          : cachedSettings.outdatedMaxKeep <= 0
            ? "Hidden builds are kept here (no limit). Delete removes files permanently."
            : "Hidden builds are kept here (max " +
              cachedSettings.outdatedMaxKeep +
              "). Delete removes files permanently.";
    }
    if (outdatedMaxKeepRow) {
      outdatedMaxKeepRow.hidden = cachedSettings.outdatedPolicy !== "keep";
    }
  }

  function applySettingsToForm() {
    if (downloadsMaxOldInput) downloadsMaxOldInput.value = String(cachedSettings.downloadsMaxOld);
    if (outdatedPolicySelect) outdatedPolicySelect.value = cachedSettings.outdatedPolicy;
    if (outdatedMaxKeepInput) outdatedMaxKeepInput.value = String(cachedSettings.outdatedMaxKeep);
    updateSettingsHint();
  }

  async function loadSettings() {
    try {
      var res = await fetch(settingsPublicUrl(), { cache: "no-store" });
      if (res.ok) {
        cachedSettings = normalizeReleaseSettings(await res.json());
      } else {
        cachedSettings = normalizeReleaseSettings(null);
      }
    } catch (_) {
      cachedSettings = normalizeReleaseSettings(null);
    }
    applySettingsToForm();
  }

  async function saveSettings() {
    await saveHiddenSettings();
  }

  function setVisibleListTab(tab) {
    visibleListTab = tab === "apk" ? "apk" : "exe";
    if (tabExeBtn) tabExeBtn.classList.toggle("is-active", visibleListTab === "exe");
    if (tabApkBtn) tabApkBtn.classList.toggle("is-active", visibleListTab === "apk");
    renderVisibleReleaseList();
    renderOutdatedList();
  }

  function setStatus(msg, ok) {
    statusEl.textContent = msg || "";
    statusEl.className = "status " + (ok ? "ok" : "err");
  }

  function uniqueEmails(list) {
    var seen = {};
    var out = [];
    list.forEach(function (raw) {
      var e = String(raw || "")
        .trim()
        .toLowerCase();
      if (!e || seen[e]) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
      seen[e] = true;
      out.push(e);
    });
    return out;
  }

  function bootstrapEmails() {
    return uniqueEmails([OWNER].concat(window.RELEASE_ADMIN_EMAILS || []));
  }

  function adminEmails() {
    return uniqueEmails(bootstrapEmails().concat(runtimeAdmins));
  }

  function allowedEmail(email) {
    return adminEmails().indexOf(String(email || "").trim().toLowerCase()) !== -1;
  }

  function todayStamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function bytesLabel(n) {
    if (!n) return "";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function safeName(name) {
    return String(name || "file")
      .replace(/[\\/]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function optionalText(id) {
    return String(document.getElementById(id).value || "").trim();
  }

  function adminsPublicUrl() {
    return (
      "https://firebasestorage.googleapis.com/v0/b/" +
      window.POCKET_LEDGER_FIREBASE.storageBucket +
      "/o/" +
      encodeURIComponent(ADMINS_PATH) +
      "?alt=media"
    );
  }

  firebase.initializeApp(window.POCKET_LEDGER_FIREBASE);
  var auth = firebase.auth();
  var storage = firebase.storage();

  function renderAdminList() {
    if (!adminListEl) return;
    var emails = adminEmails();
    adminListEl.innerHTML = "";
    emails.forEach(function (email) {
      var li = document.createElement("li");
      var left = document.createElement("span");
      left.textContent = email + (email === OWNER ? " (owner)" : "");
      li.appendChild(left);
      if (email !== OWNER) {
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn btn-outline btn-sm";
        rm.textContent = "Remove";
        rm.onclick = function () {
          void removeAdmin(email);
        };
        li.appendChild(rm);
      }
      adminListEl.appendChild(li);
    });
  }

  function latestPublicUrl() {
    return (
      "https://firebasestorage.googleapis.com/v0/b/" +
      window.POCKET_LEDGER_FIREBASE.storageBucket +
      "/o/" +
      encodeURIComponent(prefix + "/latest.json") +
      "?alt=media"
    );
  }

  async function deleteReleaseFiles(entry) {
    await deleteStorageFile(entry && entry.windows);
    var apk = entry && entry.android && isApkAndroid(entry.android) ? entry.android : null;
    await deleteStorageFile(apk);
  }

  async function saveManifest(manifest) {
    var blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    await storage.ref().child(prefix + "/latest.json").put(blob, {
      contentType: "application/json",
      cacheControl: "public,max-age=60",
    });
    cachedManifest = manifest;
  }

  async function deleteStorageFile(item) {
    if (!item) return;
    if (item.path) {
      try {
        await storage.ref().child(item.path).delete();
        return;
      } catch (_) {
        /* try URL */
      }
    }
    if (item.url && /^https?:\/\//i.test(item.url)) {
      try {
        await storage.refFromURL(item.url).delete();
      } catch (_) {
        /* already gone */
      }
    }
  }

  function renderVisibleReleaseList() {
    if (!visibleReleaseListEl) return;
    visibleReleaseListEl.innerHTML = "";
    if (!cachedManifest || (!cachedManifest.windows && !cachedManifest.android)) {
      if (visibleReleaseEmptyEl) visibleReleaseEmptyEl.hidden = false;
      return;
    }

    var rows = [];
    var latestEntry = cloneReleaseEntry({
      date: cachedManifest.date,
      windows: cachedManifest.windows,
      android: cachedManifest.android,
    });
    if (entryHasPlatform(latestEntry, visibleListTab)) {
      rows.push({ entry: latestEntry, roleLabel: "Latest (downloads default)", historyIndex: null });
    }

    var history = Array.isArray(cachedManifest.history) ? cachedManifest.history : [];
    var olderNum = 0;
    history.forEach(function (entry, idx) {
      if (!entryHasPlatform(entry, visibleListTab)) return;
      olderNum += 1;
      rows.push({ entry: entry, roleLabel: "Older #" + olderNum, historyIndex: idx });
    });

    if (!rows.length) {
      if (visibleReleaseEmptyEl) visibleReleaseEmptyEl.hidden = false;
      return;
    }
    if (visibleReleaseEmptyEl) visibleReleaseEmptyEl.hidden = true;
    rows.forEach(function (row) {
      appendVisibleReleaseRow(row.entry, row.roleLabel, row.historyIndex);
    });
  }

  function appendVisibleReleaseRow(entry, roleLabel, historyIndex) {
    var li = document.createElement("li");
    var left = document.createElement("div");
    var title = document.createElement("div");
    title.textContent = roleLabel + " · " + entryLabel(entry);
    var meta = document.createElement("div");
    meta.className = "outdated-meta";
    meta.textContent = entryFilesLine(entry);
    left.appendChild(title);
    left.appendChild(meta);
    var del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-outline btn-sm btn-danger";
    del.textContent = historyIndex === null ? "Cannot delete latest" : "Delete";
    del.disabled = historyIndex === null;
    if (historyIndex !== null) {
      del.onclick = function () {
        void deleteHistoryRelease(historyIndex);
      };
    }
    li.appendChild(left);
    li.appendChild(del);
    visibleReleaseListEl.appendChild(li);
  }

  function renderOutdatedList() {
    if (!outdatedListEl) return;
    var list = (cachedManifest && Array.isArray(cachedManifest.outdated)
      ? cachedManifest.outdated
      : []
    )
      .filter(function (entry) {
        return entryHasPlatform(entry, visibleListTab);
      })
      .map(function (entry, filteredIdx) {
        var realIdx = cachedManifest.outdated.indexOf(entry);
        return { entry: entry, index: realIdx >= 0 ? realIdx : filteredIdx };
      });
    outdatedListEl.innerHTML = "";
    if (outdatedEmptyEl) outdatedEmptyEl.hidden = list.length > 0;
    list.forEach(function (row) {
      var entry = row.entry;
      var idx = row.index;
      var li = document.createElement("li");
      var left = document.createElement("div");
      var title = document.createElement("div");
      title.textContent = entryLabel(entry);
      var meta = document.createElement("div");
      meta.className = "outdated-meta";
      meta.textContent = entryFilesLine(entry);
      left.appendChild(title);
      left.appendChild(meta);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-outline btn-sm btn-danger";
      del.textContent = "Delete";
      del.onclick = function () {
        void hardDeleteOutdated(idx);
      };
      li.appendChild(left);
      li.appendChild(del);
      outdatedListEl.appendChild(li);
    });
  }

  async function loadManifest() {
    try {
      var res = await fetch(latestPublicUrl(), { cache: "no-store" });
      if (res.ok) {
        cachedManifest = await res.json();
      } else {
        cachedManifest = { history: [], outdated: [] };
      }
    } catch (_) {
      cachedManifest = { history: [], outdated: [] };
    }
    updateSettingsHint();
    renderVisibleReleaseList();
    renderOutdatedList();
  }

  async function deleteHistoryRelease(index) {
    if (!currentUser || !allowedEmail(currentUser.email)) {
      setStatus("Not allowed.", false);
      return;
    }
    if (!cachedManifest || !Array.isArray(cachedManifest.history)) return;
    var entry = cachedManifest.history[index];
    if (!entry) return;
    if (
      !(await confirmDialog({
        title: "Remove from Downloads?",
        message:
          "Remove this build from the public Downloads list and delete its files from Firebase Storage?",
        items: [entryLabel(entry)],
        confirmLabel: "Delete",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      setStatus("Deleting release files…", true);
      await deleteReleaseFiles(entry);
      var next = Object.assign({}, cachedManifest);
      next.history = cachedManifest.history.filter(function (_, i) {
        return i !== index;
      });
      await saveManifest(next);
      renderVisibleReleaseList();
      renderOutdatedList();
      setStatus("Deleted older release " + entryLabel(entry), true);
    } catch (err) {
      setStatus(err.message || String(err), false);
    }
  }

  async function deleteAllOutdated() {
    if (!currentUser || !allowedEmail(currentUser.email)) {
      setStatus("Not allowed.", false);
      return;
    }
    var list = (cachedManifest && Array.isArray(cachedManifest.outdated) ? cachedManifest.outdated : []).slice();
    if (!list.length) {
      setStatus("No outdated builds to delete.", true);
      return;
    }
    if (
      !(await confirmDialog({
        title: "Delete all outdated?",
        message:
          "Delete ALL " + list.length + " outdated build(s) from Firebase Storage permanently?",
        confirmLabel: "Delete all",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      setStatus("Deleting all outdated files…", true);
      for (var i = 0; i < list.length; i++) {
        await deleteReleaseFiles(list[i]);
      }
      var next = Object.assign({}, cachedManifest);
      next.outdated = [];
      await saveManifest(next);
      renderOutdatedList();
      setStatus("Deleted all outdated builds (" + list.length + ").", true);
    } catch (err) {
      setStatus(err.message || String(err), false);
    }
  }

  async function hardDeleteOutdated(index) {
    if (!currentUser || !allowedEmail(currentUser.email)) {
      setStatus("Not allowed.", false);
      return;
    }
    if (!cachedManifest || !Array.isArray(cachedManifest.outdated)) return;
    var entry = cachedManifest.outdated[index];
    if (!entry) return;
    if (
      !(await confirmDialog({
        title: "Hard delete?",
        message: "Hard delete this outdated release from Firebase Storage?",
        items: [entryLabel(entry)],
        confirmLabel: "Delete",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      setStatus("Deleting outdated files…", true);
      await deleteReleaseFiles(entry);
      var next = Object.assign({}, cachedManifest);
      next.outdated = cachedManifest.outdated.filter(function (_, i) {
        return i !== index;
      });
      await saveManifest(next);
      renderOutdatedList();
      setStatus("Hard-deleted outdated release " + entryLabel(entry), true);
    } catch (err) {
      setStatus(err.message || String(err), false);
    }
  }

  async function loadAdmins() {
    try {
      var res = await fetch(adminsPublicUrl(), { cache: "no-store" });
      if (res.ok) {
        var data = await res.json();
        runtimeAdmins = uniqueEmails([].concat(data.emails || data.admins || []));
      }
    } catch (_) {
      runtimeAdmins = [];
    }
    runtimeAdmins = uniqueEmails(bootstrapEmails().concat(runtimeAdmins));
    renderAdminList();
  }

  async function saveAdmins(nextEmails) {
    var emails = uniqueEmails([OWNER].concat(nextEmails));
    var blob = new Blob(
      [JSON.stringify({ owner: OWNER, emails: emails, updatedAt: new Date().toISOString() }, null, 2)],
      { type: "application/json" }
    );
    await storage.ref().child(ADMINS_PATH).put(blob, {
      contentType: "application/json",
      cacheControl: "public,max-age=60",
    });
    runtimeAdmins = emails;
    renderAdminList();
  }

  async function ensureAdminsSeeded() {
    await loadAdmins();
    if (adminEmails().length === 0 || adminEmails().indexOf(OWNER) < 0) {
      await saveAdmins(bootstrapEmails());
    }
  }

  async function addAdmin(email) {
    var e = String(email || "")
      .trim()
      .toLowerCase();
    if (!e) {
      setStatus("Enter a Gmail / email.", false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setStatus("Invalid email.", false);
      return;
    }
    try {
      await saveAdmins(adminEmails().concat([e]));
      document.getElementById("newAdminEmail").value = "";
      setStatus("Added " + e, true);
    } catch (err) {
      setStatus(err.message || String(err), false);
    }
  }

  async function removeAdmin(email) {
    var e = String(email || "")
      .trim()
      .toLowerCase();
    if (e === OWNER) {
      setStatus("Owner cannot be removed.", false);
      return;
    }
    try {
      await saveAdmins(adminEmails().filter(function (x) { return x !== e; }));
      setStatus("Removed " + e, true);
    } catch (err) {
      setStatus(err.message || String(err), false);
    }
  }

  function showAuthedUi(user) {
    whoEl.textContent = user.email || user.uid;
    if (outBtn) outBtn.hidden = false;
    if (!allowedEmail(user.email)) {
      authBox.hidden = false;
      uploadBox.hidden = true;
      setStatus("Not a release admin. Ask owner to add your Gmail on this page.", false);
      return;
    }
    authBox.hidden = true;
    uploadBox.hidden = false;
    if (storagePathHint) {
      storagePathHint.textContent =
        "Firebase Storage (bucket " +
        window.POCKET_LEDGER_FIREBASE.storageBucket +
        ") → " +
        prefix +
        "/windows|android/YYYY-MM-DD/  ·  latest.json + release-settings.json";
    }
    setStatus("Ready. Files upload to Firebase Storage (not Firestore).", true);
    renderAdminList();
    void loadSettings().then(function () {
    void loadManifest();
    });
  }

  document.getElementById("googleBtn").onclick = function () {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function (err) {
      setStatus(err.message || String(err), false);
    });
  };
  document.getElementById("outBtn").onclick = function () {
    auth.signOut();
  };
  document.getElementById("addAdminBtn").onclick = function () {
    void addAdmin(document.getElementById("newAdminEmail").value);
  };
  if (deleteAllOutdatedBtn) {
    deleteAllOutdatedBtn.onclick = function () {
      void deleteAllOutdated();
    };
  }
  if (saveSettingsBtn) {
    saveSettingsBtn.onclick = function () {
      void saveSettings();
    };
  }
  if (saveDownloadsSettingsBtn) {
    saveDownloadsSettingsBtn.onclick = function () {
      void saveDownloadsSettings();
    };
  }
  if (outdatedPolicySelect) {
    outdatedPolicySelect.onchange = function () {
      if (outdatedMaxKeepRow) {
        outdatedMaxKeepRow.hidden = outdatedPolicySelect.value !== "keep";
      }
    };
  }
  if (tabExeBtn) {
    tabExeBtn.onclick = function () {
      setVisibleListTab("exe");
    };
  }
  if (tabApkBtn) {
    tabApkBtn.onclick = function () {
      setVisibleListTab("apk");
    };
  }

  auth.onAuthStateChanged(function (user) {
    currentUser = user;
    if (!user) {
      authBox.hidden = false;
      uploadBox.hidden = true;
      if (outBtn) outBtn.hidden = true;
      whoEl.textContent = "";
      setStatus("Sign in with Google to upload EXE / APK.", true);
      return;
    }
    void ensureAdminsSeeded()
      .then(function () {
        showAuthedUi(user);
      })
      .catch(function (err) {
        showAuthedUi(user);
        setStatus(
          "Signed in, but admins.json load/save failed: " + (err.message || err),
          false
        );
      });
  });

  function uploadOne(file, objectPath, onPct) {
    return new Promise(function (resolve, reject) {
      var ref = storage.ref().child(objectPath);
      var task = ref.put(file, {
        contentType: file.type || "application/octet-stream",
        contentDisposition: 'attachment; filename="' + safeName(file.name) + '"',
      });
      task.on(
        "state_changed",
        function (snap) {
          if (!snap.totalBytes) return;
          onPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        },
        reject,
        function () {
          task.snapshot.ref.getDownloadURL().then(resolve).catch(reject);
        }
      );
    });
  }

  document.getElementById("publishBtn").onclick = async function () {
    if (!currentUser || !allowedEmail(currentUser.email)) {
      setStatus("Not allowed to upload.", false);
      return;
    }
    var exe = document.getElementById("exeFile").files[0];
    var apk = document.getElementById("apkFile").files[0];
    var windowsVersion = optionalText("windowsVersion");
    var androidVersion = optionalText("androidVersion");
    var playStoreUrl = optionalText("playStoreUrl");
    if (!exe && !apk) {
      setStatus("Pick at least one file (EXE or APK).", false);
      return;
    }
    if (exe && !windowsVersion) {
      setStatus("Enter the Windows version for the EXE.", false);
      return;
    }
    if (apk && !androidVersion) {
      setStatus("Enter the Android version for the APK.", false);
      return;
    }
    if (playStoreUrl) {
      try {
        new URL(playStoreUrl);
      } catch (_) {
        setStatus("Play Store link must be a full https URL.", false);
        return;
      }
    }
    var date = document.getElementById("dateField").value || todayStamp();
    var btn = document.getElementById("publishBtn");
    btn.disabled = true;
    progressEl.hidden = false;
    progressEl.value = 0;
    try {
      await loadSettings();
      var prev = null;
      var latest = { date: date, stagedAt: new Date().toISOString(), windows: null, android: null };
      try {
        var existing = await fetch(latestPublicUrl(), { cache: "no-store" });
        if (existing.ok) {
          prev = await existing.json();
          latest.windows = prev.windows || null;
          latest.android = prev.android || null;
          latest.playStoreUrl = prev.playStoreUrl || "";
        }
      } catch (_) {
        /* first publish */
      }

      if (exe) {
        setStatus("Uploading EXE to Firebase Storage…", true);
        var exePath = prefix + "/windows/" + date + "/" + safeName(exe.name);
        var exeUrl = await uploadOne(exe, exePath, function (p) {
          progressEl.value = Math.round(p * 0.5);
        });
        latest.windows = {
          file: exe.name,
          url: exeUrl,
          path: exePath,
          version: windowsVersion,
          bytes: exe.size,
          sizeLabel: bytesLabel(exe.size),
        };
      }
      if (apk) {
        setStatus("Uploading APK to Firebase Storage…", true);
        var apkPath = prefix + "/android/" + date + "/" + safeName(apk.name);
        var apkUrl = await uploadOne(apk, apkPath, function (p) {
          progressEl.value = 50 + Math.round(p * 0.5);
        });
        latest.android = {
          file: apk.name,
          url: apkUrl,
          path: apkPath,
          version: androidVersion,
          format: "apk",
          bytes: apk.size,
          sizeLabel: bytesLabel(apk.size),
        };
      }
      if (playStoreUrl) {
        latest.playStoreUrl = playStoreUrl;
        latest.android = latest.android || {};
        latest.android.playStoreUrl = playStoreUrl;
      }

      var rotation = buildRotation(prev, latest);
      latest.history = rotation.history;
      latest.outdated = rotation.outdated;

      if (Array.isArray(rotation.deleteEntries) && rotation.deleteEntries.length) {
        setStatus("Removing auto-deleted outdated files…", true);
        for (var d = 0; d < rotation.deleteEntries.length; d++) {
          await deleteReleaseFiles(rotation.deleteEntries[d]);
        }
      }

      await saveManifest(latest);
      renderVisibleReleaseList();
      renderOutdatedList();
      progressEl.value = 100;
      setStatus(
        "Published " +
          prefix +
          "/" +
          date +
          "/ · kept " +
          (1 + latest.history.length) +
          " · outdated " +
          latest.outdated.length,
        true
      );
    } catch (err) {
      setStatus(err.message || String(err), false);
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById("dateField").value = todayStamp();
  document.getElementById("windowsVersion").value = "1.0.0";
  document.getElementById("androidVersion").value = "1.0.0";
})();

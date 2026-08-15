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
  var storagePathHint = document.getElementById("storagePathHint");
  var cachedManifest = null;
  var MAX_OLD = 5;

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

  function buildRotation(prev, next) {
    var candidates = [];
    if (prev && (prev.windows || prev.android) && !sameRelease(prev, next)) {
      candidates.push({
        date: prev.date || "",
        windows: prev.windows || null,
        android: prev.android || null,
      });
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
      candidates.push({
        date: entry.date || "",
        windows: entry.windows || null,
        android: entry.android || null,
      });
    }
    var history = candidates.slice(0, MAX_OLD);
    var spilled = candidates.slice(MAX_OLD);
    var outdated = [];
    var pool = spilled.concat(Array.isArray(prev && prev.outdated) ? prev.outdated : []);
    for (var k = 0; k < pool.length; k++) {
      var old = pool[k];
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
      for (var o = 0; o < outdated.length; o++) {
        if (sameRelease(outdated[o], old)) {
          seen = true;
          break;
        }
      }
      if (seen) continue;
      outdated.push({
        date: old.date || "",
        windows: old.windows || null,
        android: old.android || null,
      });
    }
    return { history: history, outdated: outdated };
  }

  function entryLabel(entry) {
    var bits = [entry.date || "unknown"];
    if (entry.windows && entry.windows.version) bits.push("EXE v" + entry.windows.version);
    if (entry.android && entry.android.version) bits.push("APK v" + entry.android.version);
    return bits.join(" · ");
  }

  function entryFilesLine(entry) {
    var bits = [];
    if (entry.windows && entry.windows.file) bits.push(entry.windows.file);
    if (entry.android && entry.android.file) bits.push(entry.android.file);
    return bits.join(" · ") || "No file names";
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

  function renderOutdatedList() {
    if (!outdatedListEl) return;
    var list = (cachedManifest && Array.isArray(cachedManifest.outdated)
      ? cachedManifest.outdated
      : []
    ).slice();
    outdatedListEl.innerHTML = "";
    if (outdatedEmptyEl) outdatedEmptyEl.hidden = list.length > 0;
    list.forEach(function (entry, idx) {
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
    renderOutdatedList();
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
      !window.confirm(
        "Hard delete this outdated release from Firebase Storage?\n" + entryLabel(entry)
      )
    ) {
      return;
    }
    try {
      setStatus("Deleting outdated files…", true);
      await deleteStorageFile(entry.windows);
      await deleteStorageFile(entry.android);
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
        "/" +
        todayStamp() +
        "/  ·  latest.json + admins.json";
    }
    setStatus("Ready. Files upload to Firebase Storage (not Firestore).", true);
    renderAdminList();
    void loadManifest();
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
        var exePath = prefix + "/" + date + "/" + safeName(exe.name);
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
        var apkPath = prefix + "/" + date + "/" + safeName(apk.name);
        var apkUrl = await uploadOne(apk, apkPath, function (p) {
          progressEl.value = 50 + Math.round(p * 0.5);
        });
        latest.android = {
          file: apk.name,
          url: apkUrl,
          path: apkPath,
          version: androidVersion,
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

      await saveManifest(latest);
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

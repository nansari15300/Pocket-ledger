(function () {
  "use strict";

  var DOC = "app_settings/website_notice";
  var statusEl = document.getElementById("status");
  var authBox = document.getElementById("authBox");
  var adminBox = document.getElementById("adminBox");
  var whoEl = document.getElementById("who");
  var outBtn = document.getElementById("outBtn");
  var messageEl = document.getElementById("noticeMessage");
  var enabledEl = document.getElementById("noticeEnabled");
  var saveBtn = document.getElementById("saveNoticeBtn");
  var auth;
  var db;

  function setStatus(msg, ok) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "status " + (ok ? "ok" : "err");
  }

  function normalize(raw) {
    var data = raw && typeof raw === "object" ? raw : {};
    return {
      message: String(data.message || "").trim(),
      enabled: Boolean(data.enabled),
    };
  }

  async function load() {
    setStatus("Loading…", true);
    try {
      var snap = await db.doc(DOC).get();
      var notice = normalize(snap.exists ? snap.data() : {});
      if (messageEl) messageEl.value = notice.message;
      if (enabledEl) enabledEl.checked = notice.enabled;
      setStatus("Ready.", true);
    } catch (_) {
      setStatus("Load failed.", false);
    }
  }

  async function save() {
    if (!messageEl || !enabledEl) return;
    var message = String(messageEl.value || "").trim();
    var enabled = Boolean(enabledEl.checked);
    if (enabled && !message) {
      setStatus("Type a message or turn off “Show on website”.", false);
      return;
    }
    setStatus("Saving…", true);
    try {
      await db.doc(DOC).set(
        {
          message: message,
          enabled: enabled,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setStatus("Saved. Visitors will see this on the marketing homepage.", true);
    } catch (_) {
      setStatus("Save failed.", false);
    }
  }

  function showSignedOut() {
    if (authBox) authBox.hidden = false;
    if (adminBox) adminBox.hidden = true;
    if (outBtn) outBtn.hidden = true;
    if (whoEl) whoEl.textContent = "";
  }

  function showAdmin(user) {
    if (authBox) authBox.hidden = true;
    if (adminBox) adminBox.hidden = false;
    if (outBtn) outBtn.hidden = false;
    if (whoEl) whoEl.textContent = user.email || "";
  }

  function init() {
    if (!window.firebase || !window.POCKET_LEDGER_FIREBASE || !window.WebsiteSettingsAuth) return;
    if (!firebase.apps.length) firebase.initializeApp(window.POCKET_LEDGER_FIREBASE);
    auth = firebase.auth();
    db = firebase.firestore();

    document.getElementById("googleBtn").onclick = function () {
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function () {});
    };
    if (outBtn) {
      outBtn.onclick = function () {
        auth.signOut();
      };
    }
    if (saveBtn) {
      saveBtn.onclick = function () {
        void save();
      };
    }

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        showSignedOut();
        setStatus("", true);
        return;
      }
      window.WebsiteSettingsAuth.resolveSuperAdmin(user, db).then(function (ok) {
        if (!ok) {
          showSignedOut();
          setStatus("Super Admin only.", false);
          auth.signOut();
          return;
        }
        showAdmin(user);
        void load();
      });
    });
  }

  init();
}());

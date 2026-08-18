(function () {
  "use strict";

  var loginBtn = document.getElementById("marketingLoginBtn");
  var logoutBtn = document.getElementById("marketingLogoutBtn");
  var settingsBtn = document.getElementById("marketingSettingsBtn");
  var appBtn = document.getElementById("goToAppBtn");
  var auth;
  var db;
  var isSuperAdminUser = false;
  var ADMIN_PANEL_URL = "/admin-release/";

  function normalizedEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function setVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.hidden = false;
      el.classList.remove("is-auth-hidden");
      el.removeAttribute("aria-hidden");
    } else {
      el.hidden = true;
      el.classList.add("is-auth-hidden");
      el.setAttribute("aria-hidden", "true");
    }
  }

  function removeLegacySettingsPanel() {
    var panel = document.getElementById("marketingSettingsPanel");
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }

  function setUi(user, isSuperAdmin) {
    isSuperAdminUser = Boolean(user && isSuperAdmin);
    setVisible(loginBtn, !user);
    setVisible(logoutBtn, Boolean(user));
    setVisible(settingsBtn, isSuperAdminUser);
    if (appBtn) appBtn.textContent = user ? "Open App" : "Go to App";
    if (!isSuperAdminUser) {
      setVisible(settingsBtn, false);
      removeLegacySettingsPanel();
    }
  }

  async function resolveSuperAdmin(user) {
    if (!user || !db) return false;
    var email = normalizedEmail(user.email);
    if (!email) return false;
    if (email === "nansari15300@gmail.com") return true;

    try {
      var uidSnap = await db.doc("users/" + user.uid).get();
      if (uidSnap.exists) {
        var role = normalizedEmail((uidSnap.data() || {}).role);
        if (role === "superadmin") return true;
      }

      var configSnap = await db.doc("app_settings/admin_config").get();
      if (configSnap.exists) {
        var emails = Array.isArray((configSnap.data() || {}).superAdminEmails)
          ? configSnap.data().superAdminEmails
          : [];
        if (emails.some(function (item) { return normalizedEmail(item) === email; })) {
          return true;
        }
      }

      var byEmail = await db.collection("users").where("email", "==", user.email).limit(5).get();
      for (var i = 0; i < byEmail.docs.length; i++) {
        var rowRole = normalizedEmail((byEmail.docs[i].data() || {}).role);
        if (rowRole === "superadmin") return true;
      }
      return false;
    } catch (_) {
      return email === "nansari15300@gmail.com";
    }
  }

  function init() {
    setUi(null, false);
    removeLegacySettingsPanel();

    if (!window.firebase || !window.POCKET_LEDGER_FIREBASE) return;
    if (!firebase.apps.length) firebase.initializeApp(window.POCKET_LEDGER_FIREBASE);
    auth = firebase.auth();
    db = firebase.firestore();

    auth.onAuthStateChanged(function (user) {
      setUi(user, false);
      if (!user) return;
      resolveSuperAdmin(user).then(function (ok) {
        if (auth.currentUser && auth.currentUser.uid === user.uid) {
          setUi(user, ok === true);
        }
      });
    });

    if (loginBtn) {
      loginBtn.addEventListener("click", function () {
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function () {
          /* Popup blockers/account cancellation leave the public site usable. */
        });
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        setVisible(settingsBtn, false);
        removeLegacySettingsPanel();
        auth.signOut();
      });
    }
    if (settingsBtn) {
      settingsBtn.addEventListener("click", function () {
        if (!isSuperAdminUser) {
          setVisible(settingsBtn, false);
          return;
        }
        window.location.href = ADMIN_PANEL_URL;
      });
    }
  }

  init();
}());

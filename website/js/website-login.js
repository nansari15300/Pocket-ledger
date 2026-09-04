(function () {
  "use strict";

  var statusEl = document.getElementById("loginStatus");
  var googleBtn = document.getElementById("googleBtn");
  var auth;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "login-status" + (kind ? " " + kind : "");
  }

  function safeReturnUrl(raw) {
    var value = String(raw || "").trim();
    if (!value || !value.startsWith("/") || value.startsWith("//")) {
      return "/downloads/";
    }
    return value;
  }

  function returnUrl() {
    var params = new URLSearchParams(location.search);
    return safeReturnUrl(params.get("return"));
  }

  function redirectAfterLogin() {
    location.replace(returnUrl());
  }

  function init() {
    if (!window.firebase || !window.POCKET_LEDGER_FIREBASE) {
      setStatus("Sign-in is not configured on this server.", "err");
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(window.POCKET_LEDGER_FIREBASE);
    auth = firebase.auth();

    auth.onAuthStateChanged(function (user) {
      if (user) {
        setStatus("Signed in. Redirecting…", "ok");
        redirectAfterLogin();
      }
    });

    if (googleBtn) {
      googleBtn.onclick = function () {
        setStatus("Opening Google sign-in…", "ok");
        auth
          .signInWithPopup(new firebase.auth.GoogleAuthProvider())
          .catch(function (err) {
            var msg =
              err && err.message ? err.message : "Could not sign in. Try again.";
            setStatus(msg, "err");
          });
      };
    }
  }

  init();
}());

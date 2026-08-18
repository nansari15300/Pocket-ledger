(function () {
  "use strict";

  var statusEl = document.getElementById("status");
  var authBox = document.getElementById("authBox");
  var adminBox = document.getElementById("adminBox");
  var whoEl = document.getElementById("who");
  var outBtn = document.getElementById("outBtn");
  var auth;
  var db;

  function setStatus(msg, ok) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "status " + (ok ? "ok" : "err");
  }

  function countryLabel(code) {
    var c = String(code || "ZZ").toUpperCase();
    if (c === "ZZ") return "Unknown";
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(c) || c;
    } catch (_) {
      return c;
    }
  }

  function formatWhen(ms) {
    if (!ms) return "—";
    try {
      return new Date(ms).toLocaleString();
    } catch (_) {
      return "—";
    }
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function load() {
    setStatus("Loading…", true);
    try {
      var token = await auth.currentUser.getIdToken();
      var res = await fetch("/app/api/admin/download-stats", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      var json = await res.json();
      if (!res.ok) throw new Error(json.error || "HTTP " + res.status);
      var stats = json.stats || { total: 0, byPlatform: {} };
      var byPlatform = stats.byPlatform || {};
      setText("statTotal", String(stats.total || 0));
      setText("statWindows", String(byPlatform.windows || 0));
      setText("statAndroid", String(byPlatform.android || 0));
      setText("statPlay", String(byPlatform.play || 0));

      var countryBody = document.getElementById("countryBody");
      var byCountry = Array.isArray(json.byCountry) ? json.byCountry : [];
      countryBody.innerHTML = "";
      if (!byCountry.length) {
        countryBody.innerHTML = '<tr><td colspan="2">No downloads recorded yet.</td></tr>';
      } else {
        byCountry.forEach(function (row) {
          var tr = document.createElement("tr");
          tr.innerHTML = "<td></td><td></td>";
          tr.children[0].textContent = countryLabel(row.country) + " (" + row.country + ")";
          tr.children[1].textContent = String(row.count || 0);
          countryBody.appendChild(tr);
        });
      }

      var recentBody = document.getElementById("recentBody");
      var recent = Array.isArray(json.recent) ? json.recent : [];
      recentBody.innerHTML = "";
      if (!recent.length) {
        recentBody.innerHTML = '<tr><td colspan="4">No recent events.</td></tr>';
      } else {
        recent.forEach(function (row) {
          var tr = document.createElement("tr");
          tr.innerHTML = "<td></td><td></td><td></td><td></td>";
          tr.children[0].textContent = formatWhen(row.createdAtMs);
          tr.children[1].textContent = String(row.platform || "");
          tr.children[2].textContent = countryLabel(row.country);
          tr.children[3].textContent = row.version || "—";
          recentBody.appendChild(tr);
        });
      }
      setStatus("Ready.", true);
    } catch (e) {
      setStatus(e && e.message ? e.message : "Could not load download stats.", false);
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
    if (outBtn) outBtn.onclick = function () { auth.signOut(); };
    document.getElementById("refreshBtn").onclick = function () { void load(); };

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

(function () {
  "use strict";

  var OWNER = "nansari15300@gmail.com";

  function normalizedEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  async function resolveSuperAdmin(user, db) {
    if (!user || !db) return false;
    var email = normalizedEmail(user.email);
    if (!email) return false;
    if (email === OWNER) return true;
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
      return false;
    } catch (_) {
      return email === OWNER;
    }
  }

  window.WebsiteSettingsAuth = {
    OWNER: OWNER,
    normalizedEmail: normalizedEmail,
    resolveSuperAdmin: resolveSuperAdmin,
  };
}());

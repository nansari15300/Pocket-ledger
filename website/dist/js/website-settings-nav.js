(function () {
  "use strict";

  /**
   * Light website-only nav (no app Admin Panel menus).
   * Page sets: <body data-ws-active="release|videos|downloads">
   */
  function navHtml(active) {
    function item(key, href, label) {
      var cls = key === active ? ' class="is-active"' : "";
      var cur = key === active ? ' aria-current="page"' : "";
      return '<a' + cls + ' href="' + href + '"' + cur + ">" + label + "</a>";
    }
    return (
      '<aside class="ws-side" aria-label="Website settings">' +
        '<div class="ws-side-title">Website Settings</div>' +
        item("release", "/admin-release/", "Release upload") +
        item("videos", "/website-settings/videos/", "Website Videos") +
        item("downloads", "/website-settings/downloads/", "Download analytics") +
        '<a href="/">← Back to website</a>' +
      "</aside>"
    );
  }

  function mount() {
    var mountEl = document.getElementById("websiteSettingsNav");
    if (!mountEl) return;
    var active = String(document.body.getAttribute("data-ws-active") || "").trim();
    mountEl.outerHTML = navHtml(active);
  }

  mount();
}());

(function () {
  "use strict";

  var VIDEOS_URL = "/app/api/public/website-videos";
  var ENGAGE_URL = "/app/api/public/website-video-engagement";
  var CACHE_KEY = "pocket-ledger:website-videos:v3";
  var LOCAL_KEY = "pocket-ledger:video-engagement:v1";
  var LABEL_COPY = {
    howto: "How to use",
    tutorial: "Tutorial",
    learning: "Learning",
    event: "Event",
    update: "Update",
  };
  var CATEGORY_COPY = {
    "getting-started": "Getting started",
    dashboard: "Dashboard",
    party: "Parties",
    "bank-cash": "Bank/Cash",
    staff: "Staff",
    tax: "Tax",
    incomes: "Income & Expense",
    items: "Items & Service",
    reports: "Reports",
    gallery: "Gallery",
    gate: "Gate",
    production: "Production",
    "sale-note": "Sale Note",
    "purchase-note": "Purchase Note",
    quotations: "Quotations",
    messages: "Messages",
    "drive-sync": "Google Drive sync",
    billing: "Billing & Plans",
    "distributor-signup": "Be a Distributor",
    backup: "Backup & Restore",
    "import-export": "Import/Export",
    "recycle-bin": "Recycle Bin",
    settings: "Settings",
  };
  var LEGACY_CATEGORY = {
    "sales-purchase": "sale-note",
    "accounts-reports": "reports",
    "settings-sync": "settings",
    "updates-events": "getting-started",
  };
  var CATEGORY_ORDER = [
    "getting-started",
    "dashboard",
    "party",
    "bank-cash",
    "staff",
    "tax",
    "incomes",
    "items",
    "reports",
    "gallery",
    "gate",
    "production",
    "sale-note",
    "purchase-note",
    "quotations",
    "messages",
    "drive-sync",
    "billing",
    "distributor-signup",
    "backup",
    "import-export",
    "recycle-bin",
    "settings",
  ];
  var state = {
    videos: [],
    categories: CATEGORY_ORDER.slice(),
    category: "all",
    query: "",
    activeId: "",
  };

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function youtubeId(url) {
    var match = String(url || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : "";
  }
  function tiktokId(url) {
    var match = String(url || "").match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i);
    return match ? match[1] : "";
  }
  function embedSrc(video) {
    if (video.platform === "youtube") {
      var id = youtubeId(video.url);
      return id ? "https://www.youtube.com/embed/" + id + "?autoplay=1&rel=0" : "";
    }
    if (video.platform === "facebook") {
      return "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(video.url) + "&show_text=false&autoplay=true";
    }
    if (video.platform === "tiktok") {
      var tid = tiktokId(video.url);
      return tid ? "https://www.tiktok.com/player/v1/" + tid + "?autoplay=1" : "";
    }
    return "";
  }
  function thumb(video) {
    if (video.platform !== "youtube") return "";
    var id = youtubeId(video.url);
    return id ? "https://img.youtube.com/vi/" + id + "/hqdefault.jpg" : "";
  }
  function engagementOf(video) {
    var e = video && video.engagement ? video.engagement : {};
    return {
      views: Math.max(0, Math.floor(Number(e.views) || 0)),
      likes: Math.max(0, Math.floor(Number(e.likes) || 0)),
      ratingAvg: Number(e.ratingAvg) || 0,
      ratingCount: Math.max(0, Math.floor(Number(e.ratingCount) || 0)),
    };
  }
  function readLocalMap() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (_) {
      return {};
    }
  }
  function writeLocalMap(map) {
    try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(map)); } catch (_) { /* optional */ }
  }
  function localFor(videoId) {
    var map = readLocalMap();
    var row = map[videoId] && typeof map[videoId] === "object" ? map[videoId] : {};
    return {
      liked: Boolean(row.liked),
      rating: Math.max(0, Math.min(5, Math.floor(Number(row.rating) || 0))),
      viewed: Boolean(row.viewed),
    };
  }
  function setLocal(videoId, patch) {
    var map = readLocalMap();
    map[videoId] = Object.assign({}, localFor(videoId), patch);
    writeLocalMap(map);
  }
  function formatViews(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }
  function starsHtml(avg, interactive, videoId, myRating) {
    var active = myRating > 0 ? myRating : Math.round(avg || 0);
    var buttons = "";
    for (var i = 1; i <= 5; i++) {
      var on = i <= active ? " is-on" : "";
      if (interactive) {
        buttons +=
          '<button type="button" class="video-star' + on + (myRating === i ? " is-mine" : "") +
          '" data-rate="' + i +
          '" data-video-id="' + escapeHtml(videoId) + '" aria-label="Rate ' + i + ' stars">★</button>';
      } else {
        buttons += '<span class="video-star' + on + '" aria-hidden="true">★</span>';
      }
    }
    return '<span class="video-stars" role="img" aria-label="' + escapeHtml(String(avg || 0)) + ' out of 5">' + buttons + "</span>";
  }
  function engagementBarHtml(video, interactive) {
    var e = engagementOf(video);
    var local = localFor(video.id);
    var likeClass = local.liked ? " is-liked" : "";
    return (
      '<div class="video-engagement" data-video-id="' + escapeHtml(video.id) + '">' +
        '<span class="video-stat" title="Views"><span aria-hidden="true">👁</span> ' + formatViews(e.views) + "</span>" +
        '<button type="button" class="video-like' + likeClass + '" data-like="1" data-video-id="' +
          escapeHtml(video.id) + '" aria-pressed="' +
          (local.liked ? "true" : "false") + '" title="' + (local.liked ? "Unlike" : "Like") + '">' +
          '<span aria-hidden="true">' + (local.liked ? "♥" : "♡") + "</span> " +
          '<span class="video-like-count">' + formatViews(e.likes) + "</span>" +
        "</button>" +
        '<span class="video-rate-wrap">' +
          // Always keep stars clickable so another visitor (or change-of-mind) gets a response.
          starsHtml(e.ratingAvg, interactive, video.id, local.rating) +
          '<span class="video-rate-count">' +
            (e.ratingCount ? e.ratingAvg.toFixed(1) + " (" + e.ratingCount + ")" : "Rate") +
          "</span>" +
        "</span>" +
      "</div>"
    );
  }
  function patchVideoEngagement(videoId, engagement) {
    state.videos = state.videos.map(function (video) {
      if (video.id !== videoId) return video;
      return Object.assign({}, video, { engagement: engagement });
    });
    writeCache();
  }
  function postEngagement(videoId, action, rating, previousRating) {
    var body = { videoId: videoId, action: action };
    if (action === "rate") {
      body.rating = rating;
      if (previousRating) body.previousRating = previousRating;
    }
    return fetch(ENGAGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
      .then(function (res) { return res.json().then(function (json) { return { ok: res.ok, json: json }; }); })
      .then(function (result) {
        if (!result.ok || !result.json || !result.json.engagement) {
          throw new Error((result.json && result.json.error) || "engage failed");
        }
        patchVideoEngagement(videoId, result.json.engagement);
        return result.json.engagement;
      });
  }
  function recordView(video) {
    var local = localFor(video.id);
    if (local.viewed) return;
    setLocal(video.id, { viewed: true });
    var e = engagementOf(video);
    patchVideoEngagement(video.id, Object.assign({}, e, { views: e.views + 1 }));
    void postEngagement(video.id, "view").catch(function () { /* soft fail */ });
  }
  function likeVideo(videoId) {
    var local = localFor(videoId);
    var video = state.videos.filter(function (item) { return item.id === videoId; })[0];
    var e = video ? engagementOf(video) : null;
    if (local.liked) {
      setLocal(videoId, { liked: false });
      if (e) patchVideoEngagement(videoId, Object.assign({}, e, { likes: Math.max(0, e.likes - 1) }));
      render();
      void postEngagement(videoId, "unlike")
        .then(function () { render(); })
        .catch(function () { /* keep optimistic */ });
      return;
    }
    setLocal(videoId, { liked: true });
    if (e) patchVideoEngagement(videoId, Object.assign({}, e, { likes: e.likes + 1 }));
    render();
    void postEngagement(videoId, "like")
      .then(function () { render(); })
      .catch(function () { /* keep optimistic */ });
  }
  function rateVideo(videoId, rating) {
    var local = localFor(videoId);
    var previous = local.rating || 0;
    if (previous === rating) return;
    var video = state.videos.filter(function (item) { return item.id === videoId; })[0];
    if (video) {
      var e = engagementOf(video);
      var nextCount = previous ? e.ratingCount : e.ratingCount + 1;
      var nextSum = previous
        ? Math.max(0, e.ratingAvg * e.ratingCount - previous) + rating
        : e.ratingAvg * e.ratingCount + rating;
      var nextAvg = nextCount > 0 ? Math.round((nextSum / nextCount) * 10) / 10 : 0;
      patchVideoEngagement(videoId, Object.assign({}, e, { ratingAvg: nextAvg, ratingCount: nextCount }));
    }
    setLocal(videoId, { rating: rating });
    render();
    void postEngagement(videoId, "rate", rating, previous || undefined)
      .then(function () { render(); })
      .catch(function () { /* keep optimistic */ });
  }
  function bindEngagement(root) {
    if (!root) return;
    root.querySelectorAll("[data-like]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        likeVideo(button.getAttribute("data-video-id") || "");
      });
    });
    root.querySelectorAll("[data-rate]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var stars = Number(button.getAttribute("data-rate") || 0);
        var id = button.getAttribute("data-video-id") || "";
        if (stars >= 1 && stars <= 5 && id) rateVideo(id, stars);
      });
    });
  }
  function platformLabel(platform) {
    if (platform === "youtube") return "YouTube";
    if (platform === "facebook") return "Facebook";
    if (platform === "tiktok") return "TikTok";
    return "original site";
  }
  function watchFallbackHtml(video) {
    var image = thumb(video);
    var name = platformLabel(video.platform);
    return (
      '<div class="video-watch-fallback">' +
        '<div class="video-watch-preview video-thumb-' + escapeHtml(video.platform) + '">' +
          (image ? '<img src="' + escapeHtml(image) + '" alt="">' : "") +
        "</div>" +
        "<h3>Watch on " + escapeHtml(name) + "</h3>" +
        "<p>" + escapeHtml(name) + " often blocks in-site playback (login / permission). Open the video on " +
          escapeHtml(name) + " to watch — you can sign in there if needed.</p>" +
        '<a class="btn btn-primary video-watch-btn" href="' + escapeHtml(video.url) +
          '" target="_blank" rel="noopener">Open on ' + escapeHtml(name) + "</a>" +
      "</div>"
    );
  }
  function prefersExternalWatch(video) {
    // Facebook / TikTok embeds commonly fail without platform login or embedding rights.
    return video.platform === "facebook" || video.platform === "tiktok";
  }
  function ensureModal() {
    var existing = $("videoModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "videoModal";
    modal.className = "video-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="video-modal-backdrop" data-video-close="1"></div>' +
      '<div class="video-modal-card" role="dialog" aria-modal="true" aria-labelledby="videoModalTitle">' +
        '<div class="video-modal-head">' +
          '<strong id="videoModalTitle">Video</strong>' +
          '<button type="button" class="video-modal-close" data-video-close="1" aria-label="Close">×</button>' +
        "</div>" +
        '<div class="video-modal-frame" id="videoModalFrame"></div>' +
        '<div class="video-modal-engage" id="videoModalEngage"></div>' +
        '<a class="video-modal-open" id="videoModalOpen" target="_blank" rel="noopener">Open original</a>' +
      "</div>";
    document.body.appendChild(modal);
    modal.addEventListener("click", function (event) {
      if (event.target && event.target.getAttribute("data-video-close") === "1") closeModal();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeModal();
    });
    return modal;
  }
  function closeModal() {
    var modal = $("videoModal");
    var frame = $("videoModalFrame");
    if (frame) frame.innerHTML = "";
    if (modal) modal.hidden = true;
    state.activeId = "";
  }
  function openVideo(video) {
    var modal = ensureModal();
    var frame = $("videoModalFrame");
    var title = $("videoModalTitle");
    var open = $("videoModalOpen");
    var engage = $("videoModalEngage");
    var src = embedSrc(video);
    var name = platformLabel(video.platform);
    state.activeId = video.id;
    if (title) title.textContent = video.title || "Video";
    if (open) {
      open.href = video.url;
      open.textContent = "Open on " + name;
    }
    if (engage) {
      engage.innerHTML = engagementBarHtml(video, true);
      bindEngagement(engage);
    }
    recordView(video);

    // Pocket Ledger cannot sign users into YouTube / Facebook / TikTok.
    // When the platform blocks embed, send them to the original page to watch / login there.
    if (!src || prefersExternalWatch(video)) {
      frame.innerHTML = watchFallbackHtml(video);
      modal.hidden = false;
      return;
    }

    frame.innerHTML =
      '<iframe src="' + escapeHtml(src) + '" title="' + escapeHtml(video.title || "Video") +
      '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
      '<div class="video-embed-hint">' +
        "If the player shows unavailable, open it on " + escapeHtml(name) +
        ' — we cannot log you into ' + escapeHtml(name) + " from this site." +
      "</div>";
    modal.hidden = false;
  }
  function cardHtml(video) {
    var image = thumb(video);
    var label = LABEL_COPY[video.label] || "Video";
    return (
      '<article class="video-card" data-video-id="' + escapeHtml(video.id) + '">' +
        '<button type="button" class="video-card-hit">' +
          '<span class="video-thumb video-thumb-' + escapeHtml(video.platform) + '">' +
            (image ? '<img src="' + escapeHtml(image) + '" alt="">' : "") +
            '<span class="video-play">▶</span>' +
          "</span>" +
          '<span class="video-card-body">' +
            '<span class="video-category">' + escapeHtml(CATEGORY_COPY[displayCategory(video)] || "Getting started") + "</span>" +
            '<span class="video-label">' + escapeHtml(label) + "</span>" +
            "<strong>" + escapeHtml(video.title) + "</strong>" +
          "</span>" +
        "</button>" +
        engagementBarHtml(video, true) +
      "</article>"
    );
  }
  function normalizedCategory(value) {
    var key = String(value || "").trim();
    if (CATEGORY_COPY[key]) return key;
    if (LEGACY_CATEGORY[key]) return LEGACY_CATEGORY[key];
    return "getting-started";
  }
  function visibleCategoryOrder() {
    var allowed = Array.isArray(state.categories) && state.categories.length
      ? state.categories
      : CATEGORY_ORDER;
    return CATEGORY_ORDER.filter(function (key) {
      return allowed.indexOf(key) !== -1;
    });
  }
  function displayCategory(video) {
    var key = normalizedCategory(video.category);
    return visibleCategoryOrder().indexOf(key) !== -1 ? key : "getting-started";
  }
  function filteredVideos() {
    var query = state.query.trim().toLowerCase();
    return state.videos.filter(function (video) {
      var category = displayCategory(video);
      if (state.category !== "all" && category !== state.category) return false;
      if (!query) return true;
      return [
        video.title,
        video.url,
        CATEGORY_COPY[category],
        LABEL_COPY[video.label] || "",
        video.platform,
      ].join(" ").toLowerCase().indexOf(query) !== -1;
    });
  }
  function renderCategories() {
    var holder = $("videosCategories");
    if (!holder) return;
    var order = visibleCategoryOrder();
    var counts = {};
    state.videos.forEach(function (video) {
      var key = displayCategory(video);
      counts[key] = (counts[key] || 0) + 1;
    });
    if (state.category !== "all" && order.indexOf(state.category) === -1) {
      state.category = "all";
    }
    var categoryKeys = ["all"].concat(order);
    holder.innerHTML = categoryKeys.map(function (key) {
      var active = state.category === key ? " is-active" : "";
      var title = key === "all" ? "All videos" : CATEGORY_COPY[key];
      var count = key === "all" ? state.videos.length : (counts[key] || 0);
      return '<button type="button" class="video-category-filter' + active +
        '" data-category="' + key + '" aria-pressed="' + (state.category === key ? "true" : "false") + '">' +
        escapeHtml(title) + " <span>" + count + "</span></button>";
    }).join("");
    holder.querySelectorAll(".video-category-filter").forEach(function (button) {
      button.addEventListener("click", function () {
        state.category = button.getAttribute("data-category") || "all";
        render();
      });
    });
  }
  function render() {
    var grid = $("videosGrid");
    var status = $("videosStatus");
    if (!grid) return;
    renderCategories();
    var matched = filteredVideos();
    var order = visibleCategoryOrder();
    var categories = state.category === "all" ? order : [state.category];
    var html = categories.map(function (category) {
      var list = matched.filter(function (video) { return displayCategory(video) === category; });
      return (
        '<section class="videos-category-card">' +
          '<div class="videos-category-head"><h3>' + escapeHtml(CATEGORY_COPY[category]) + "</h3>" +
          "<span>" + list.length + (list.length === 1 ? " video" : " videos") + "</span></div>" +
          (list.length
            ? '<div class="videos-cards">' + list.map(cardHtml).join("") + "</div>"
            : '<p class="videos-empty">No videos in this folder yet.</p>') +
        "</section>"
      );
    }).join("");
    grid.innerHTML = html || '<p class="videos-empty">' +
      (state.videos.length ? "No videos match this category or search." : "Videos will appear here after Super Admin publishes them.") +
      "</p>";
    if (status) {
      status.textContent = matched.length
        ? matched.length + (matched.length === 1 ? " video found." : " videos found.")
        : (state.query || state.category !== "all"
          ? "No videos match this filter."
          : "No published videos yet.");
    }
    grid.querySelectorAll(".video-card-hit").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.parentElement && button.parentElement.getAttribute("data-video-id");
        var video = state.videos.filter(function (item) { return item.id === id; })[0];
        if (video) openVideo(video);
      });
    });
    bindEngagement(grid);
    if (state.activeId) {
      var active = state.videos.filter(function (item) { return item.id === state.activeId; })[0];
      var engage = $("videoModalEngage");
      if (active && engage) {
        engage.innerHTML = engagementBarHtml(active, true);
        bindEngagement(engage);
      }
    }
  }
  function bindTools() {
    var search = $("videosSearch");
    if (search) {
      search.addEventListener("input", function () {
        state.query = search.value || "";
        render();
      });
    }
  }
  function readCache() {
    try {
      var cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Array.isArray(cached.videos)) {
        return {
          videos: cached.videos,
          categories: Array.isArray(cached.categories) ? cached.categories : CATEGORY_ORDER.slice(),
        };
      }
    } catch (_) { /* optional */ }
    return null;
  }
  function writeCache() {
    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ videos: state.videos, categories: state.categories })
      );
    } catch (_) { /* optional */ }
  }
  function loadVideos() {
    var cached = readCache();
    if (cached) {
      state.videos = cached.videos;
      state.categories = cached.categories;
      render();
    }
    return fetch(VIDEOS_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("videos " + res.status);
        return res.json();
      })
      .then(function (data) {
        var videos = Array.isArray(data && data.videos) ? data.videos : [];
        var categories = Array.isArray(data && data.categories) ? data.categories : CATEGORY_ORDER.slice();
        state.videos = videos;
        state.categories = categories.filter(function (key) {
          return CATEGORY_COPY[key];
        });
        if (!state.categories.length) state.categories = CATEGORY_ORDER.slice();
        writeCache();
        render();
      })
      .catch(function () {
        if (!state.videos.length && $("videosStatus")) {
          $("videosStatus").textContent = "Could not load videos right now.";
        }
      });
  }
  bindTools();
  void loadVideos();
}());

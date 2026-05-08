/**
 * Tab strip + merged title bar (Win/Linux frameless). CSP: external file only.
 */
(function () {
  const tabsEl = document.getElementById("tabs");
  const newBtn = document.getElementById("newBtn");
  const syncBtn = document.getElementById("syncBtn");
  /** Khali draggable strip — pehle static "Pocket Ledger" yahi jagah label thi; tooltip ab tab-count string se */
  const dragFill = document.getElementById("dragFill");
  const menuBtn = document.getElementById("menuBtn");
  const minBtn = document.getElementById("minBtn");
  const maxBtn = document.getElementById("maxBtn");
  const closeBtn = document.getElementById("closeBtn");

  const SYNC_ICON = "\u21bb";
  const CHECK_ICON = "\u2713";
  /** Renderer se ack na aaye (login page) — loading hatao */
  const SYNC_ACK_FALLBACK_MS = 12000;

  if (!tabsEl || !newBtn || !window.electronTabStrip) return;

  function resetSyncButtonIcon() {
    if (!syncBtn) return;
    syncBtn.textContent = SYNC_ICON;
    syncBtn.classList.remove("sync-loading", "sync-success");
  }

  function showSyncSuccessBriefly() {
    if (!syncBtn) return;
    clearTimeout(syncBtn._plSyncSuccessTid);
    syncBtn.classList.remove("sync-loading");
    syncBtn.textContent = CHECK_ICON;
    syncBtn.classList.add("sync-success");
    syncBtn._plSyncSuccessTid = setTimeout(function () {
      resetSyncButtonIcon();
    }, 2000);
  }

  const merged =
    typeof window !== "undefined" &&
    window.plElectronChrome &&
    window.plElectronChrome.mergedTitleBar === true;
  document.body.classList.toggle("merged-titlebar", !!merged);

  function setMaximizedUi(maximized) {
    if (!maxBtn) return;
    maxBtn.title = maximized ? "Restore down" : "Maximize";
    maxBtn.textContent = "\u25A1";
  }

  if (merged && window.plElectronChrome) {
    menuBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        window.plElectronChrome.showAppMenu();
      } catch (_) {}
    });
    minBtn?.addEventListener("click", () => {
      try {
        window.plElectronChrome.minimize();
      } catch (_) {}
    });
    maxBtn?.addEventListener("click", () => {
      try {
        window.plElectronChrome.maximizeToggle();
      } catch (_) {}
    });
    closeBtn?.addEventListener("click", () => {
      try {
        window.plElectronChrome.close();
      } catch (_) {}
    });
    dragFill?.addEventListener("dblclick", () => {
      try {
        window.plElectronChrome.maximizeToggle();
      } catch (_) {}
    });
    try {
      const unsubMax = window.plElectronChrome.onMaximizedChange((p) => setMaximizedUi(!!p?.maximized));
      window.addEventListener("beforeunload", () => {
        try {
          unsubMax();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function render(payload) {
    const list = payload.tabs || [];
    if (dragFill && payload.titleBarLabel) {
      dragFill.title = payload.titleBarLabel;
    }
    tabsEl.innerHTML = "";
    list.forEach((t) => {
      const row = document.createElement("div");
      row.className = "tab" + (t.active ? " active" : "");
      row.title = t.title || "";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = t.title || "Tab " + (t.index + 1);
      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "\u00D7";
      close.title = "Close tab";
      row.appendChild(title);
      row.appendChild(close);
      row.addEventListener("click", async (e) => {
        if (e.target === close) {
          e.stopPropagation();
          try {
            await window.electronTabStrip.closeTab(t.index);
          } catch (err) {
            console.error(err);
          }
        } else {
          try {
            await window.electronTabStrip.switchTab(t.index);
          } catch (err) {
            console.error(err);
          }
        }
      });
      tabsEl.appendChild(row);
    });
  }

  newBtn.addEventListener("click", async () => {
    try {
      const r = await window.electronTabStrip.newTab();
      if (r && r.ok === false) console.error("New tab:", r.error);
    } catch (err) {
      console.error(err);
    }
  });

  let unsubDone = null;

  if (syncBtn && window.electronTabStrip.requestBackgroundSync) {
    resetSyncButtonIcon();
    let loadTimer = null;
    syncBtn.addEventListener("click", async () => {
      if (syncBtn.classList.contains("sync-loading")) return;
      clearTimeout(syncBtn._plSyncSuccessTid);
      syncBtn.classList.remove("sync-success");
      syncBtn.textContent = SYNC_ICON;
      syncBtn.classList.add("sync-loading");
      clearTimeout(loadTimer);
      loadTimer = setTimeout(function () {
        syncBtn.classList.remove("sync-loading");
      }, SYNC_ACK_FALLBACK_MS);
      try {
        const r = await window.electronTabStrip.requestBackgroundSync();
        if (!r || r.ok === false) {
          clearTimeout(loadTimer);
          syncBtn.classList.remove("sync-loading");
        }
      } catch (err) {
        clearTimeout(loadTimer);
        syncBtn.classList.remove("sync-loading");
        console.error("Background sync:", err);
      }
    });
    if (window.electronTabStrip.onBackgroundSyncDone) {
      unsubDone = window.electronTabStrip.onBackgroundSyncDone(function () {
        clearTimeout(loadTimer);
        showSyncSuccessBriefly();
      });
    }
  }

  const unsub = window.electronTabStrip.onTabsUpdate(render);
  window.addEventListener("beforeunload", () => {
    try {
      unsub();
    } catch (_) {}
    try {
      if (typeof unsubDone === "function") unsubDone();
    } catch (_) {}
  });
})();

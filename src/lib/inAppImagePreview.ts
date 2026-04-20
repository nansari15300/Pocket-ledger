"use client";

/**
 * Full-screen image overlay — gallery jaisa: layer/back stack, Close = pointerup (touch reliable),
 * Browser = native APK par `Browser.open`, warna programmatic `<a target=_blank>`; zoom ± / Fit + pinch.
 */
import { Capacitor } from "@capacitor/core";
import {
  attachPreviewCloseInteraction,
  pushInAppAttachmentPreviewLayer,
  scheduleInAppAttachmentPreviewRootRemoval,
  setAttachmentPreviewHardwareBackHandler,
} from "@/lib/inAppAttachmentPreviewOpen";
import { mountGalleryImageZoom, type GalleryImageZoomApi } from "@/lib/inAppGalleryImageZoom";

export function showInAppImagePreview(
  imageSrc: string,
  onDispose: () => void,
  options?: { title?: string }
): void {
  if (typeof document === "undefined") return;

  const title = options?.title ?? "Image preview";

  const root = document.createElement("div");
  root.setAttribute("data-in-app-image-preview", "1");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", title);
  root.tabIndex = -1;
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui,-apple-system,sans-serif",
    pointerEvents: "auto",
    touchAction: "manipulation",
  } as CSSStyleDeclaration);

  let closed = false;
  let imageZoomApi: GalleryImageZoomApi | null = null;

  const safeClose = () => {
    if (closed) return;
    closed = true;
    imageZoomApi?.dispose();
    imageZoomApi = null;
    scheduleInAppAttachmentPreviewRootRemoval(root, () => {
      setAttachmentPreviewHardwareBackHandler(null);
      try {
        onDispose();
      } catch {
        /* ignore */
      }
    });
  };

  const mkBtn = (label: string, primary?: boolean) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = [
      "padding:10px 16px",
      "border-radius:8px",
      "border:none",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      "min-height:44px",
      primary ? "background:#ea580c;color:#fff" : "background:#333;color:#eee",
    ].join(";");
    return b;
  };

  const scrollHost = document.createElement("div");
  scrollHost.style.cssText =
    "flex:1;min-height:0;overflow:hidden;background:#2a2a2a;display:flex;flex-direction:column;touch-action:pan-y";

  const img = document.createElement("img");
  img.alt = "";
  img.src = imageSrc;

  const err = document.createElement("p");
  err.style.cssText = "color:#e5e5e5;text-align:center;padding:24px;display:none;margin:0";
  err.textContent = "Image load failed — try opening in browser from attachment link.";

  const zoomOutBtn = mkBtn("−");
  zoomOutBtn.setAttribute("aria-label", "Zoom out");
  zoomOutBtn.style.minWidth = "44px";
  const zoomInBtn = mkBtn("+");
  zoomInBtn.setAttribute("aria-label", "Zoom in");
  zoomInBtn.style.minWidth = "44px";
  const fitBtn = mkBtn("Fit", true);
  fitBtn.setAttribute("aria-label", "Fit to screen");

  zoomOutBtn.onclick = () => imageZoomApi?.zoomOut();
  zoomInBtn.onclick = () => imageZoomApi?.zoomIn();
  fitBtn.onclick = () => imageZoomApi?.fit();

  const showZoomBar = (ok: boolean) => {
    const d = ok ? "" : "none";
    zoomOutBtn.style.display = d;
    zoomInBtn.style.display = d;
    fitBtn.style.display = d;
  };
  showZoomBar(true);

  img.onerror = () => {
    imageZoomApi?.dispose();
    imageZoomApi = null;
    scrollHost.replaceChildren(err);
    err.style.display = "block";
    showZoomBar(false);
  };

  imageZoomApi = mountGalleryImageZoom(scrollHost, img, () => {});

  const bar = document.createElement("div");
  bar.setAttribute("role", "toolbar");
  bar.style.cssText =
    "display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-start;padding:12px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom,0px));background:#1a1a1a;color:#fff;flex-shrink:0;box-shadow:0 -2px 10px rgba(0,0,0,0.35);border-top:1px solid #333";

  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  titleEl.style.cssText =
    "flex:1;min-width:120px;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto";

  const closeBtn = mkBtn("Close");
  attachPreviewCloseInteraction(closeBtn, safeClose);

  const openBtn = mkBtn("Browser");
  /** APK: Custom Tab (`http` URL); blob/data: anchor click — do methods mix karke double-tab na khule */
  const openInSystemBrowser = () => {
    const href = String(imageSrc || "").trim();
    if (!href) return;
    void (async () => {
      let native = false;
      try {
        native = Capacitor.isNativePlatform();
      } catch {
        native = false;
      }
      try {
        if (native && /^https?:\/\//i.test(href)) {
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url: href });
          return;
        }
      } catch (e) {
        console.warn("[inAppImagePreview] Browser.open failed, fallback anchor", e);
      }
      try {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        requestAnimationFrame(() => {
          try {
            a.remove();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
    })();
  };
  openBtn.addEventListener(
    "pointerup",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      openInSystemBrowser();
    },
    { passive: false }
  );
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  bar.append(titleEl, openBtn, zoomOutBtn, zoomInBtn, fitBtn, closeBtn);
  root.append(scrollHost, bar);

  root.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        safeClose();
      }
    },
    true
  );

  document.body.appendChild(root);
  pushInAppAttachmentPreviewLayer(root);
  setAttachmentPreviewHardwareBackHandler(safeClose);

  requestAnimationFrame(() => {
    try {
      root.focus({ preventScroll: true });
    } catch {
      try {
        root.focus();
      } catch {
        /* ignore */
      }
    }
  });
}

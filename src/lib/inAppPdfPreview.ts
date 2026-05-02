"use client";

import { Capacitor } from "@capacitor/core";
import { importPdfJsDist } from "@/lib/importPdfJsDist";
import { shouldUsePdfJsCanvasPreview } from "@/lib/shouldUseInAppPdfPreview";

/**
 * APK / static WebView: bahar browser + blob: URL khaali dikhcha — PDF yahi overlay ma preview / print / share.
 * Android WebView: iframe / convertFileSrc PDF dikhaundaina — **PDF.js → canvas** scroll preview (`public/pdf.worker.min.mjs` offline).
 * Vanilla DOM: kahi pani bata call garna milcha (printDirect, invoice, ...).
 */

/** OOM bachna + render time */
const MAX_PDF_PREVIEW_PAGES = 72;

const ZOOM_MIN = 50;
const ZOOM_MAX = 250;
const ZOOM_STEP = 10;

function clampZoom(n: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n)));
}

/** PDF.js document ek baar load; zoom par pages dubara paint — bitmap stretch blur avoid. */
async function loadPdfJsDocument(
  blob: Blob,
  pdfjs: any,
  opts: { isCancelled: () => boolean }
): Promise<{ numPages: number; getPage: (i: number) => Promise<any> } | null> {
  const data = await blob.arrayBuffer();
  if (opts.isCancelled()) return null;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  if (opts.isCancelled()) return null;
  return pdf;
}

/**
 * Har zoom level par crisp preview: layout width = vw * (zoom%), PDF scale us hisaab,
 * canvas backing store = logical * devicePixelRatio (cap) taaki APK zoom par blur na ho.
 */
async function renderPdfPagesToZoomInner(
  pdf: { numPages: number; getPage: (i: number) => Promise<any> },
  zoomInner: HTMLElement,
  opts: { zoomPercent: number; onFirstPageRendered?: () => void; isCancelled: () => boolean }
): Promise<void> {
  zoomInner.replaceChildren();
  const total = pdf.numPages;
  const numPages = Math.min(total, MAX_PDF_PREVIEW_PAGES);
  const vw =
    typeof window !== "undefined" ? Math.max(280, window.innerWidth - 32) : 400;
  const zoom = clampZoom(opts.zoomPercent) / 100;
  const dprCap = typeof window !== "undefined" ? Math.min(2.5, window.devicePixelRatio || 1) : 1;

  for (let i = 1; i <= numPages; i++) {
    if (opts.isCancelled()) return;
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const layoutCssWidth = vw * zoom;
    const pdfScale = Math.min(8, Math.max(0.4, layoutCssWidth / base.width));
    const viewport = page.getViewport({ scale: pdfScale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const bw = Math.floor(viewport.width * dprCap);
    const bh = Math.floor(viewport.height * dprCap);
    canvas.width = bw;
    canvas.height = bh;
    canvas.style.cssText = `display:block;width:${Math.floor(viewport.width)}px;height:${Math.floor(viewport.height)}px;max-width:none;margin:0 auto 12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2)`;
    ctx.setTransform(dprCap, 0, 0, dprCap, 0, 0);
    await page.render({ canvasContext: ctx, viewport } as any).promise;
    zoomInner.appendChild(canvas);
    if (i === 1) opts.onFirstPageRendered?.();
  }

  if (zoomInner.childElementCount === 0 && !opts.isCancelled()) {
    const empty = document.createElement("p");
    empty.textContent = "Preview empty — use Share to open PDF";
    empty.style.cssText =
      "color:#e5e5e5;text-align:center;padding:24px;font-size:14px;margin:0";
    zoomInner.appendChild(empty);
  }

  if (total > MAX_PDF_PREVIEW_PAGES) {
    const note = document.createElement("p");
    note.textContent = `+ ${total - MAX_PDF_PREVIEW_PAGES} more pages — full PDF: Share`;
    note.style.cssText =
      "color:#d4d4d4;text-align:center;padding:12px;font-size:13px;margin:0";
    zoomInner.appendChild(note);
  }
}

/** Blob lai base64 (Filesystem write ko lagi) */
function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Web Share → natra Capacitor Cache + Share → natra download link */
async function sharePdfBlob(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "AbortError") return;
      console.warn("[inAppPdfPreview] navigator.share failed, trying Capacitor", e);
    }
  }

  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const dataUrl = await blobToBase64DataUrl(blob);
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
    const path = `share-${Date.now()}.pdf`;
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    await Share.share({
      title: fileName,
      url: uri,
      dialogTitle: "Share PDF",
    });
  } catch (e) {
    console.warn("[inAppPdfPreview] Capacitor share failed, download fallback", e);
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }
}

export type ShowInAppPdfPreviewOptions = {
  /** PDF title (footer toolbar ma dikhincha) */
  title?: string;
  /** Share / download filename */
  fileName?: string;
};

const PREVIEW_PRINT_HIDE_STYLE_ID = "in-app-pdf-preview-print-hide-toolbar";

/** Parent window bata “Print page” aayo bhane footer toolbar print ma na aaos; iframe.print() ma PDF matra (toolbar bahira) */
function ensurePreviewToolbarHiddenOnDocumentPrint(): void {
  if (typeof document === "undefined" || document.getElementById(PREVIEW_PRINT_HIDE_STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = PREVIEW_PRINT_HIDE_STYLE_ID;
  st.textContent = `@media print { [data-in-app-pdf-preview-toolbar="1"] { display: none !important; } }`;
  document.head.appendChild(st);
}

/**
 * Full-screen overlay: PDF mathi, Print / Share / Close footer ma (preview matra).
 * onDispose: blob URL revoke garne (caller ko pani chaincha).
 */
export function showInAppPdfPreview(
  blobUrl: string,
  onDispose: () => void,
  options?: ShowInAppPdfPreviewOptions
): void {
  if (typeof document === "undefined") return;

  const title = options?.title ?? "Print preview";
  const fileName = options?.fileName ?? `pocket-ledger-${Date.now()}.pdf`;

  const root = document.createElement("div");
  root.setAttribute("data-in-app-pdf-preview", "1");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", title);

  /** PDF.js async render band garne (close jaldi dabda) */
  const previewCancelled = { v: false };
  /** Zoom slider / pinch ke baad re-paint debounce — har frame par poora PDF na paint ho. */
  let zoomRerenderTimer: ReturnType<typeof setTimeout> | null = null;

  const safeClose = () => {
    previewCancelled.v = true;
    if (zoomRerenderTimer != null) {
      clearTimeout(zoomRerenderTimer);
      zoomRerenderTimer = null;
    }
    try {
      onDispose();
    } catch {
      /* ignore */
    }
    root.remove();
  };

  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    background: "rgba(0,0,0,0.55)",
    // Grid: preview row `minmax(0,1fr)` stops PDF.js scroll layer from growing past viewport;
    // flex column + overflow scroll pe kuch WebViews me canvas layer neeche wale toolbar par touch khaa jate hain.
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gridTemplateRows: "minmax(0,1fr) auto",
    isolation: "isolate",
    pointerEvents: "auto",
    fontFamily: "system-ui,-apple-system,sans-serif",
  } as CSSStyleDeclaration);

  ensurePreviewToolbarHiddenOnDocumentPrint();

  // Footer strip: title + actions — mathi PDF pura dikhaune (mobile ma thumb reach)
  const bar = document.createElement("div");
  bar.setAttribute("data-in-app-pdf-preview-toolbar", "1");
  bar.setAttribute("role", "toolbar");
  bar.style.cssText =
    "grid-row:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-start;padding:12px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom,0px));background:#1a1a1a;color:#fff;flex-shrink:0;box-shadow:0 -2px 10px rgba(0,0,0,0.35);border-top:1px solid #333;position:relative;z-index:20;pointer-events:auto;touch-action:manipulation;transform:translateZ(0)";

  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  // Footer row: title truncate, buttons bagal / wrap
  titleEl.style.cssText =
    "flex:1;min-width:120px;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto";

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
      "touch-action:manipulation",
      "-webkit-tap-highlight-color:transparent",
      primary ? "background:#ea580c;color:#fff" : "background:#333;color:#eee",
    ].join(";");
    return b;
  };

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "PDF preview");
  iframe.setAttribute("aria-label", "PDF preview");
  iframe.style.cssText =
    "flex:1;width:100%;border:0;background:#525252;min-height:0;min-width:0;z-index:0;position:relative";

  // Native: PDF.js scroll; desktop: iframe
  const scrollHost = document.createElement("div");
  scrollHost.setAttribute("data-pdf-js-scroll-preview", "1");
  scrollHost.style.cssText =
    "flex:1;min-height:0;min-width:0;overflow:auto;background:#525252;padding:10px 8px;-webkit-overflow-scrolling:touch;display:none;touch-action:pan-x pan-y;position:relative;z-index:0;overscroll-behavior:contain";

  /** PDF pages append here; CSS `zoom` scales preview + scroll area (mobile WebView). */
  const zoomInner = document.createElement("div");
  zoomInner.setAttribute("data-pdf-preview-zoom-inner", "1");
  zoomInner.style.cssText = "min-height:100%;box-sizing:border-box";
  scrollHost.appendChild(zoomInner);

  const loadingOverlay = document.createElement("div");
  loadingOverlay.textContent = "Loading preview…";
  loadingOverlay.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#3f3f3f;color:#e5e5e5;font-size:15px;z-index:1";

  const previewWrap = document.createElement("div");
  previewWrap.style.cssText =
    "grid-row:1;min-height:0;min-width:0;max-height:100%;overflow:hidden;position:relative;display:flex;flex-direction:column;contain:layout paint;z-index:0";
  previewWrap.append(loadingOverlay, iframe, scrollHost);

  const hideLoading = () => {
    loadingOverlay.style.display = "none";
    loadingOverlay.style.pointerEvents = "none";
    loadingOverlay.style.visibility = "hidden";
  };

  // Mobile WebView / static build: iframe+blob PDF weak — PDF.js canvas (worker public/pdf.worker.min.mjs)
  const usePdfJs = shouldUsePdfJsCanvasPreview();
  if (usePdfJs) {
    iframe.style.display = "none";
    scrollHost.style.display = "block";
  }

  /** Zoom % — async paint se pehle init (TDZ / closure safe). */
  let zoomPercent = 100;
  let pdfPaintAtZoom: ((pct: number) => Promise<void>) | null = null;

  void (async () => {
    if (!usePdfJs) {
      iframe.src = blobUrl;
      iframe.onload = () => hideLoading();
      iframe.onerror = () => hideLoading();
      setTimeout(hideLoading, 8000);
      return;
    }
    try {
      const { pdfjsLib, pdfjs } = await importPdfJsDist();
      const { setPdfJsWorkerSrc, PDFJS_WORKER_VERSION_FALLBACK } = await import("@/lib/pdfjsWorkerSrc");
      const version =
        (pdfjsLib as { version?: string }).version ??
        pdfjs.version ??
        PDFJS_WORKER_VERSION_FALLBACK;
      setPdfJsWorkerSrc(pdfjs, version);

      const blob = await fetch(blobUrl).then((r) => r.blob());
      if (previewCancelled.v) return;
      const pdf = await loadPdfJsDocument(blob, pdfjs, {
        isCancelled: () => previewCancelled.v,
      });
      if (!pdf || previewCancelled.v) return;

      const paintAtZoom = async (pct: number) => {
        if (previewCancelled.v) return;
        await renderPdfPagesToZoomInner(pdf, zoomInner, {
          zoomPercent: pct,
          onFirstPageRendered: hideLoading,
          isCancelled: () => previewCancelled.v,
        });
        if (!previewCancelled.v) hideLoading();
      };

      await paintAtZoom(zoomPercent);
      pdfPaintAtZoom = paintAtZoom;
    } catch (e) {
      console.warn("[inAppPdfPreview] PDF.js preview failed", e);
      loadingOverlay.textContent = "Preview failed — use Share for PDF";
      loadingOverlay.style.fontSize = "14px";
      loadingOverlay.style.padding = "16px";
      // Overlay rahne dinchha ta user le message dekhlos
    }
  })();

  const zoomLabel = document.createElement("span");
  zoomLabel.style.cssText = "min-width:3.25rem;text-align:center;font-size:13px;font-weight:600;color:#e5e5e5;padding:0 4px";

  const updateZoomLabel = () => {
    zoomLabel.textContent = `${clampZoom(zoomPercent)}%`;
  };
  updateZoomLabel();

  const mkZoomBtn = (symbol: string, aria: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", aria);
    b.textContent = symbol;
    b.style.cssText =
      "width:40px;height:40px;padding:0;border-radius:8px;border:none;font-size:20px;font-weight:700;line-height:1;cursor:pointer;background:#404040;color:#fff;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
    return b;
  };

  const zoomOutBtn = mkZoomBtn("−", "Zoom out");
  const zoomInBtn = mkZoomBtn("+", "Zoom in");
  const zoomResetBtn = mkBtn("100%");
  zoomResetBtn.style.padding = "8px 12px";
  zoomResetBtn.style.fontSize = "13px";
  zoomResetBtn.setAttribute("aria-label", "Reset zoom to 100 percent");

  const scheduleZoomRepaint = (pct: number) => {
    if (!pdfPaintAtZoom) return;
    if (zoomRerenderTimer != null) clearTimeout(zoomRerenderTimer);
    zoomRerenderTimer = setTimeout(() => {
      zoomRerenderTimer = null;
      void pdfPaintAtZoom?.(pct);
    }, 200);
  };

  const setZoom = (next: number) => {
    if (!usePdfJs) return;
    zoomPercent = clampZoom(next);
    updateZoomLabel();
    scheduleZoomRepaint(zoomPercent);
  };

  zoomOutBtn.onclick = () => setZoom(zoomPercent - ZOOM_STEP);
  zoomInBtn.onclick = () => setZoom(zoomPercent + ZOOM_STEP);
  zoomResetBtn.onclick = () => setZoom(100);

  // Pinch-to-zoom (two fingers) on preview area
  let pinchStartDist = 0;
  let pinchStartZoom = 100;
  const touchDist = (t: TouchList) => {
    if (t.length < 2) return 0;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };
  scrollHost.addEventListener(
    "touchstart",
    (ev) => {
      if (!usePdfJs || ev.touches.length !== 2) return;
      pinchStartDist = touchDist(ev.touches);
      pinchStartZoom = zoomPercent;
    },
    { passive: true }
  );
  scrollHost.addEventListener(
    "touchmove",
    (ev) => {
      if (!usePdfJs || ev.touches.length !== 2 || pinchStartDist <= 0) return;
      const d = touchDist(ev.touches);
      if (d <= 0) return;
      const ratio = d / pinchStartDist;
      setZoom(pinchStartZoom * ratio);
    },
    { passive: true }
  );
  scrollHost.addEventListener("touchend", () => {
    pinchStartDist = 0;
  });
  scrollHost.addEventListener("touchcancel", () => {
    pinchStartDist = 0;
  });

  // Ctrl + wheel zoom (desktop / trackpad)
  scrollHost.addEventListener(
    "wheel",
    (ev) => {
      if (!usePdfJs || !ev.ctrlKey) return;
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(zoomPercent + delta);
    },
    { passive: false }
  );

  const printBtn = mkBtn("Print", true);
  printBtn.onclick = () => {
    try {
      if (usePdfJs) {
        const canvases = zoomInner.querySelectorAll("canvas");
        if (canvases.length > 0) {
          const w = window.open("", "_blank");
          if (w) {
            const body = Array.from(canvases)
              .map(
                (c) =>
                  `<div style="page-break-after:always;text-align:center"><img src="${(c as HTMLCanvasElement).toDataURL("image/jpeg", 0.92)}" style="max-width:100%;height:auto"/></div>`
              )
              .join("");
            w.document.write(
              `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title></head><body style="margin:0;background:#fff">${body}</body></html>`
            );
            w.document.close();
            w.focus();
            setTimeout(() => {
              try {
                w.print();
              } catch {
                /* ignore */
              }
              setTimeout(() => w.close(), 500);
            }, 200);
            return;
          }
        }
        iframe.style.display = "block";
        scrollHost.style.display = "none";
        iframe.src = blobUrl;
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            /* ignore */
          }
        };
        return;
      }
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn("[inAppPdfPreview] print failed", e);
    }
  };

  const shareBtn = mkBtn("Share");
  shareBtn.onclick = async () => {
    shareBtn.disabled = true;
    try {
      const blob = await fetch(blobUrl).then((r) => r.blob());
      await sharePdfBlob(blob, fileName);
    } catch (e) {
      console.warn("[inAppPdfPreview] share click failed", e);
    } finally {
      shareBtn.disabled = false;
    }
  };

  const closeBtn = mkBtn("Close");
  closeBtn.onclick = () => safeClose();

  if (usePdfJs) {
    const zoomCluster = document.createElement("div");
    zoomCluster.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-shrink:0";
    zoomCluster.append(zoomOutBtn, zoomLabel, zoomInBtn, zoomResetBtn);
    bar.append(titleEl, zoomCluster, printBtn, shareBtn, closeBtn);
  } else {
    bar.append(titleEl, printBtn, shareBtn, closeBtn);
  }
  // Pehle preview area, pachi footer — screen preview; print = iframe.contentWindow.print() → toolbar PDF ma jodainna
  root.append(previewWrap, bar);

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      safeClose();
    }
  });

  document.body.appendChild(root);
}

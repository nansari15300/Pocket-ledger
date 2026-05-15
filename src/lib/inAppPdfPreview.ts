"use client";

import { importPdfJsDist } from "@/lib/importPdfJsDist";
import { shouldUsePdfJsCanvasPreview } from "@/lib/shouldUseInAppPdfPreview";
import {
  pushInAppAttachmentPreviewLayer,
  scheduleInAppAttachmentPreviewRootRemoval,
  setAttachmentPreviewHardwareBackHandler,
} from "@/lib/inAppAttachmentPreviewOpen";

/**
 * APK / static WebView: bahar browser + blob: URL khaali dikhcha — PDF yahi overlay ma preview / print / share.
 * Android WebView: iframe / convertFileSrc PDF dikhaundaina — **PDF.js → canvas** scroll preview (`public/pdf.worker.min.mjs` offline).
 * Vanilla DOM: kahi pani bata call garna milcha (printDirect, invoice, ...).
 */

/** OOM bachna + render time */
const MAX_PDF_PREVIEW_PAGES = 72;

/** User ± / pinch: kam se kam yahan talak zoom out ho sake (multi-page fit ke liye 50 bahut zyada tha). */
const ZOOM_MIN = 25;
/** Max zoom % — pehle 250; ab 500 tak zoom in (HD paint bhi isi ceiling par). */
const ZOOM_MAX = 500;
const ZOOM_STEP = 10;

/** Bitmap vs label — itne % se zyada farq par debounced PDF.js repaint (smooth CSS beech me). */
const REPAINT_THRESHOLD = 35;

/** Chrome-like: pinch settle ke baad repaint — chhota debounce = zyada flash. */
const PDF_REPAINT_DEBOUNCE_MS = 320;

/** Off-screen page skip (scrollHost vs wrap rect) — pixels. */
const PDF_VIEWPORT_CULL_MARGIN_PX = 1200;

const PDF_PAGE_WRAP_MAP_KEY = "__pdfPreviewPageWrapMap";
const PDF_PAGE_CANVAS_MAP_KEY = "__pdfPreviewPageCanvasMap";
const PDF_PREVIEW_AUX = "data-pdf-preview-aux";

/** Per-`zoomInner` wrap cache — `replaceChildren` nahi; har overlay apna map. */
function getPageWrapMap(zoomInner: HTMLElement): Map<number, HTMLDivElement> {
  const bag = zoomInner as unknown as Record<string, Map<number, HTMLDivElement>>;
  if (!bag[PDF_PAGE_WRAP_MAP_KEY]) bag[PDF_PAGE_WRAP_MAP_KEY] = new Map();
  return bag[PDF_PAGE_WRAP_MAP_KEY]!;
}

function getPageCanvasMap(zoomInner: HTMLElement): Map<number, HTMLCanvasElement> {
  const bag = zoomInner as unknown as Record<string, Map<number, HTMLCanvasElement>>;
  if (!bag[PDF_PAGE_CANVAS_MAP_KEY]) bag[PDF_PAGE_CANVAS_MAP_KEY] = new Map();
  return bag[PDF_PAGE_CANVAS_MAP_KEY]!;
}

/** Scroll viewport ke aas-paas wrap hai ya nahi — scaled layout + scroll ke saath sahi. */
function isWrapNearScrollViewport(wrap: HTMLElement, scrollHost: HTMLElement, marginPx: number): boolean {
  const wr = wrap.getBoundingClientRect();
  const hr = scrollHost.getBoundingClientRect();
  return !(wr.bottom < hr.top - marginPx || wr.top > hr.bottom + marginPx);
}

function clampZoom(n: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n)));
}

/** PDF.js document ek baar load; preview overlay me zoom = CSS scale (HD ek baar paint, bitmap stretch blur kam). */
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
 * Fit: pehli page **poora** viewport (W+H) ke andar — hamesha `min(sw,sh)` taaki PC wide par bhi
 * mobile jaisa "ek page screen me" khule; purana width-only fit yahan se hata (height crop + ~100% label).
 */
async function computeFitZoomPercentForFirstPage(
  pdf: { getPage: (i: number) => Promise<any> },
  availW: number,
  availH: number,
  vwBasis: number
): Promise<number> {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const w = Math.max(1, base.width);
  const h = Math.max(1, base.height);
  const sw = availW / w;
  const sh = availH / h;
  const pdfScale = Math.min(Math.min(sw, sh), 8);
  const layoutCssWidth = w * pdfScale;
  const basis = Math.max(200, vwBasis);
  return Math.round((100 * layoutCssWidth) / basis);
}

/**
 * Har zoom level par crisp preview — **canvas/wrap reuse**, `replaceChildren` nahi;
 * hybrid repaint par off-screen pages skip (purana bitmap) + opacity crossfade.
 */
async function renderPdfPagesToZoomInner(
  pdf: { numPages: number; getPage: (i: number) => Promise<any> },
  zoomInner: HTMLElement,
  opts: {
    zoomPercent: number;
    scrollInnerWidthPx?: number;
    onFirstPageRendered?: () => void;
    isCancelled: () => boolean;
    skipOffscreen?: boolean;
    scrollHostForCull?: HTMLElement;
  }
): Promise<void> {
  const pageWrapMap = getPageWrapMap(zoomInner);
  const pageCanvasMap = getPageCanvasMap(zoomInner);
  const total = pdf.numPages;
  const numPages = Math.min(total, MAX_PDF_PREVIEW_PAGES);
  const vw =
    typeof opts.scrollInnerWidthPx === "number" && opts.scrollInnerWidthPx > 0
      ? Math.max(200, opts.scrollInnerWidthPx - 16)
      : typeof window !== "undefined"
        ? Math.max(280, window.innerWidth - 32)
        : 400;
  const zoom = clampZoom(opts.zoomPercent) / 100;
  const dprDevice = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const dprCap = typeof window !== "undefined" ? Math.min(3, Math.max(1, dprDevice)) : 1;
  const skip =
    opts.skipOffscreen === true && opts.scrollHostForCull != null && opts.scrollHostForCull.isConnected;
  const cullHost = opts.scrollHostForCull;

  for (const p of zoomInner.querySelectorAll(`[${PDF_PREVIEW_AUX}]`)) p.remove();

  for (const [k, w] of [...pageWrapMap.entries()]) {
    if (k > numPages) {
      pageCanvasMap.get(k)?.remove();
      pageCanvasMap.delete(k);
      w.remove();
      pageWrapMap.delete(k);
    }
  }

  let firstPaintCallbackDone = false;
  const skippedForIdle: number[] = [];

  const paintOnePage = async (i: number): Promise<void> => {
    if (opts.isCancelled()) return;

    let wrap = pageWrapMap.get(i);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.setAttribute("data-pdf-page-wrap", String(i));
      wrap.style.cssText = "position:relative;margin:0 auto 12px;display:block";
      pageWrapMap.set(i, wrap);
      zoomInner.appendChild(wrap);
    }

    let canvas = pageCanvasMap.get(i);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.style.cssText =
        "display:block;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);transform:translateZ(0);-webkit-transform:translateZ(0);backface-visibility:hidden";
      pageCanvasMap.set(i, canvas);
      wrap.appendChild(canvas);
    }

    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const layoutCssWidth = vw * zoom;
    const pdfScale = Math.min(8, Math.max(0.4, layoutCssWidth / base.width));
    const viewport = page.getViewport({ scale: pdfScale });
    const fw = Math.floor(viewport.width);
    const fh = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.style.transition = "none";
    canvas.style.opacity = "0.85";

    const bw = Math.floor(viewport.width * dprCap);
    const bh = Math.floor(viewport.height * dprCap);
    canvas.width = bw;
    canvas.height = bh;
    canvas.style.width = `${fw}px`;
    canvas.style.height = `${fh}px`;
    canvas.style.maxWidth = "none";
    canvas.style.display = "block";
    canvas.style.background = "#fff";
    canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";
    canvas.style.transform = "translateZ(0)";
    (canvas.style as unknown as { webkitTransform?: string }).webkitTransform = "translateZ(0)";
    canvas.style.backfaceVisibility = "hidden";

    ctx.setTransform(dprCap, 0, 0, dprCap, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    await page.render({ canvasContext: ctx, viewport } as any).promise;

    requestAnimationFrame(() => {
      canvas.style.transition = "opacity 120ms ease";
      canvas.style.opacity = "1";
    });

    if (!firstPaintCallbackDone) {
      firstPaintCallbackDone = true;
      opts.onFirstPageRendered?.();
    }
  };

  for (let i = 1; i <= numPages; i++) {
    if (opts.isCancelled()) return;
    const wrap = pageWrapMap.get(i);
    const canvas = pageCanvasMap.get(i);
    if (
      skip &&
      cullHost &&
      wrap &&
      canvas &&
      canvas.width > 0 &&
      !isWrapNearScrollViewport(wrap, cullHost, PDF_VIEWPORT_CULL_MARGIN_PX)
    ) {
      skippedForIdle.push(i);
      continue;
    }
    await paintOnePage(i);
  }

  if (skippedForIdle.length > 0 && !opts.isCancelled()) {
    await new Promise<void>((resolve) => {
      const runRest = async () => {
        try {
          for (const i of skippedForIdle) {
            if (opts.isCancelled()) return;
            await paintOnePage(i);
          }
        } finally {
          resolve();
        }
      };
      const ric = (globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (typeof ric === "function") ric(() => void runRest(), { timeout: 4000 });
      else setTimeout(() => void runRest(), 16);
    });
  }

  for (let i = 1; i <= numPages; i++) {
    const w = pageWrapMap.get(i);
    if (w) zoomInner.appendChild(w);
  }

  if (zoomInner.querySelectorAll("canvas").length === 0 && !opts.isCancelled()) {
    const empty = document.createElement("p");
    empty.setAttribute(PDF_PREVIEW_AUX, "1");
    empty.textContent = "Preview empty — use Share to open PDF";
    empty.style.cssText =
      "color:#e5e5e5;text-align:center;padding:24px;font-size:14px;margin:0";
    zoomInner.appendChild(empty);
  }

  if (total > MAX_PDF_PREVIEW_PAGES) {
    const note = document.createElement("p");
    note.setAttribute(PDF_PREVIEW_AUX, "1");
    note.textContent = `+ ${total - MAX_PDF_PREVIEW_PAGES} more pages — full PDF: Share`;
    note.style.cssText =
      "color:#d4d4d4;text-align:center;padding:12px;font-size:13px;margin:0";
    zoomInner.appendChild(note);
  }
}

/**
 * Chromium / Electron print: `canvas.toDataURL('image/jpeg')` bade/high-DPR preview bitmap par kaala blok / kata hua page.
 * Fallback chapne par white base + capped size + PNG kam risk (mobile WebView iframe PDF kabhi kamjor).
 */
const PRINT_FALLBACK_CANVAS_MAX_EDGE_PX = 4096;

function canvasToSafePrintDataUrl(src: HTMLCanvasElement): string {
  const sw = Math.max(1, src.width);
  const sh = Math.max(1, src.height);
  const longest = Math.max(sw, sh);
  const scale =
    longest > PRINT_FALLBACK_CANVAS_MAX_EDGE_PX ? PRINT_FALLBACK_CANVAS_MAX_EDGE_PX / longest : 1;
  const dw = Math.max(1, Math.floor(sw * scale));
  const dh = Math.max(1, Math.floor(sh * scale));
  const out = document.createElement("canvas");
  out.width = dw;
  out.height = dh;
  const octx = out.getContext("2d");
  if (!octx) return src.toDataURL("image/png");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, dw, dh);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, 0, 0, sw, sh, 0, 0, dw, dh);
  return out.toDataURL("image/png");
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

const PDF_SHARE_SHEET_ATTR = "data-pdf-share-sheet";

/**
 * HTTP / non-secure: `a.download` Chrome block — preview ke **andar** sheet; system share = user gesture se dubara try.
 */
function mountInsecureHttpPdfShareSheet(root: HTMLElement, blob: Blob, fileName: string): void {
  if (root.querySelector(`[${PDF_SHARE_SHEET_ATTR}="1"]`)) return;

  const backdrop = document.createElement("div");
  backdrop.setAttribute(PDF_SHARE_SHEET_ATTR, "1");
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "Share PDF");
  backdrop.tabIndex = -1;
  backdrop.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:80",
    "display:flex",
    "flex-direction:column",
    "justify-content:flex-end",
    "padding:12px",
    "padding-bottom:max(16px,env(safe-area-inset-bottom,0px))",
    "box-sizing:border-box",
    "background:rgba(0,0,0,0.52)",
    "font-family:system-ui,-apple-system,sans-serif",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "width:100%",
    "max-width:400px",
    "margin:0 auto",
    "background:#262626",
    "border-radius:14px 14px 0 0",
    "padding:16px 18px 18px",
    "box-shadow:0 -4px 24px rgba(0,0,0,0.45)",
    "color:#eee",
  ].join(";");

  const headline = document.createElement("div");
  headline.textContent = "Share this PDF";
  headline.style.cssText = "font-weight:700;font-size:17px;margin-bottom:8px;color:#fff";

  const hint = document.createElement("p");
  hint.textContent =
    "This page is HTTP (e.g. dev over IP). Saving inside the browser is blocked — use System share, or open a new tab.";
  hint.style.cssText = "margin:0 0 14px;font-size:13px;line-height:1.45;color:#ccc";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-direction:column;gap:10px";

  const mkSheetBtn = (label: string, primary?: boolean) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = [
      "padding:12px 16px",
      "border-radius:10px",
      "border:none",
      "font-size:15px",
      "font-weight:600",
      "cursor:pointer",
      "touch-action:manipulation",
      "-webkit-tap-highlight-color:transparent",
      "width:100%",
      primary ? "background:#ea580c;color:#fff" : "background:#3a3a3a;color:#eee",
    ].join(";");
    return b;
  };

  const close = () => {
    try {
      backdrop.remove();
    } catch {
      /* ignore */
    }
  };

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });

  const btnSystem = mkSheetBtn("System share…", true);
  btnSystem.onclick = async () => {
    const file = new File([blob], fileName, { type: "application/pdf" });
    try {
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        close();
        return;
      }
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "AbortError") return;
      console.warn("[inAppPdfPreview] system share from sheet failed", e);
    }
    hint.textContent =
      "Sharing is not available here. Try Open in new tab, then use the browser ⋮ menu to Save or Share.";
  };

  const btnTab = mkSheetBtn("Open in new tab", false);
  btnTab.onclick = () => {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    close();
  };

  const btnCancel = mkSheetBtn("Cancel", false);
  btnCancel.onclick = close;

  row.append(btnSystem, btnTab, btnCancel);
  panel.append(headline, hint, row);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);
  requestAnimationFrame(() => {
    try {
      backdrop.focus({ preventScroll: true });
    } catch {
      try {
        backdrop.focus();
      } catch {
        /* ignore */
      }
    }
  });
}

/** Web Share → Capacitor → secure: `download`; HTTP + `previewRoot`: andar sheet (naya tab auto nahi). */
async function sharePdfBlob(
  blob: Blob,
  fileName: string,
  opts?: { previewRoot?: HTMLElement }
): Promise<void> {
  const file = new File([blob], fileName, { type: "application/pdf" });
  const secure = typeof window !== "undefined" && window.isSecureContext;

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
    console.warn("[inAppPdfPreview] Capacitor share failed, browser fallback", e);
    if (secure) {
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
    } else if (opts?.previewRoot) {
      // Preview ke andar sheet — redirect / auto naya tab nahi; user "System share" ya "Open in new tab" chunte hai.
      mountInsecureHttpPdfShareSheet(opts.previewRoot, blob, fileName);
    } else {
      const url = URL.createObjectURL(blob);
      try {
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w) {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 120_000);
      }
    }
  }
}

export type ShowInAppPdfPreviewOptions = {
  /** PDF title (footer toolbar ma dikhincha) */
  title?: string;
  /** Share / download filename */
  fileName?: string;
  /** Gallery jaisa parent: PDF overlay DOM hataane ke baad hardware-back parent ko wapas */
  onAfterPreviewLayerRemoved?: () => void;
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
  root.tabIndex = -1;

  /** PDF.js async render band garne (close jaldi dabda) */
  const previewCancelled = { v: false };

  const safeClose = () => {
    previewCancelled.v = true;
    if (repaintTimer != null) {
      clearTimeout(repaintTimer);
      repaintTimer = null;
    }
    paintSupersessionToken++;
    repainting = false;
    runPaintAtZoomRef = null;
    try {
      for (const w of [...getPageWrapMap(zoomInner).values()]) w.remove();
      getPageWrapMap(zoomInner).clear();
      getPageCanvasMap(zoomInner).clear();
    } catch {
      /* ignore */
    }
    resetPdfPreviewTransforms();
    try {
      onDispose();
    } catch {
      /* ignore */
    }
    // Native back/close consistency: preview root ko same deferred remover se hatao taaki back-stack + click shield stable rahe.
    scheduleInAppAttachmentPreviewRootRemoval(root, () => {
      setAttachmentPreviewHardwareBackHandler(null);
      try {
        options?.onAfterPreviewLayerRemoved?.();
      } catch {
        /* ignore */
      }
    });
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
  // `translateZ(0)` layer + scroll repaint = niche “slashing” — solid bar + `isolation` kaafi.
  bar.style.cssText =
    "grid-row:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-start;padding:12px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom,0px));background:#1a1a1a;color:#fff;flex-shrink:0;box-shadow:0 -2px 10px rgba(0,0,0,0.35);border-top:1px solid #333;position:relative;z-index:20;pointer-events:auto;touch-action:manipulation;isolation:isolate";

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
  // `align-items:flex-start` — zoom ke baad horizontal scroll poora (center se left crop nahi); wrap `margin:0 auto` se fit mode me center.
  scrollHost.style.cssText =
    "flex:1;min-height:0;min-width:0;display:none;flex-direction:column;align-items:flex-start;overflow:auto;background:#525252;padding:10px 8px;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;position:relative;z-index:0;overscroll-behavior:contain";

  /** `transform: scale` se layout scroll galat — wrap ko W×H×scale de kar scrollHost sahi scroll kare. */
  const zoomScalerWrap = document.createElement("div");
  zoomScalerWrap.setAttribute("data-pdf-preview-scaler-wrap", "1");
  zoomScalerWrap.style.cssText =
    "position:relative;box-sizing:border-box;flex-shrink:0;margin:0 auto;overflow:visible";

  /** PDF pages yahan; paint hamesha HD layout-% par, dikhana alag CSS scale se. */
  const zoomInner = document.createElement("div");
  zoomInner.setAttribute("data-pdf-preview-zoom-inner", "1");
  // GPU-friendly base; `applyViewZoomCss` me `contain` / `will-change` zoom daur update.
  zoomInner.style.cssText =
    "box-sizing:border-box;display:inline-block;vertical-align:top;backface-visibility:hidden;perspective:1000px;transform-style:preserve-3d";
  scrollHost.appendChild(zoomScalerWrap);
  zoomScalerWrap.appendChild(zoomInner);

  /** Fit / repaint se pehle CSS scale + wrap size hatao — galat scrollWidth se bachne ke liye. */
  const resetPdfPreviewTransforms = () => {
    zoomInner.style.transition = "";
    zoomInner.style.transformOrigin = "";
    zoomInner.style.willChange = "";
    zoomInner.style.transform = "";
    zoomInner.style.backfaceVisibility = "";
    zoomInner.style.transformStyle = "";
    zoomInner.style.perspective = "";
    zoomInner.style.contain = "";
    zoomScalerWrap.style.width = "";
    zoomScalerWrap.style.height = "";
    zoomScalerWrap.style.minWidth = "";
    zoomScalerWrap.style.minHeight = "";
  };

  const loadingOverlay = document.createElement("div");
  loadingOverlay.textContent = "Loading preview…";
  loadingOverlay.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#3f3f3f;color:#e5e5e5;font-size:15px;z-index:1";

  const previewWrap = document.createElement("div");
  // `contain:paint` scroll + transform ke saath edge par glitch/slash dikha sakta — sirf layout contain.
  previewWrap.style.cssText =
    "grid-row:1;min-height:0;min-width:0;max-height:100%;overflow:hidden;position:relative;display:flex;flex-direction:column;contain:layout;z-index:0";
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
    scrollHost.style.display = "flex";
  }

  /** Zoom % — label / pinch; hybrid me bitmap `renderedZoomPercent` par, CSS se `zoomPercent` tak. */
  let zoomPercent = 100;
  /** PDF.js ne jis % par canvas paint kiye — `applyViewZoomCss` scale = zoomPercent / ye; fit ke baad label ke barabar. */
  let renderedZoomPercent = 100;
  let repainting = false;
  let repaintTimer: ReturnType<typeof setTimeout> | null = null;
  /** Fit chalne par++ — purana debounced repaint poora skip (canvas overwrite race). */
  let paintSupersessionToken = 0;
  /** Async IIFE ke baad assign — hybrid `skipOffscreen` bhej sakta hai. */
  let runPaintAtZoomRef: ((pct: number, skipOffscreen?: boolean) => Promise<void>) | null = null;
  /** Toolbar "Fit": PDF.js load hone ke baad applyFitZoom yahan lagta hai */
  let toolbarFitPdf: (() => Promise<void>) | null = null;

  const zoomLabel = document.createElement("span");
  zoomLabel.style.cssText = "min-width:3.25rem;text-align:center;font-size:13px;font-weight:600;color:#e5e5e5;padding:0 4px";

  const updateZoomLabel = () => {
    zoomLabel.textContent = `${clampZoom(zoomPercent)}%`;
  };
  updateZoomLabel();

  let pinchActive = false;
  let pinchStartDist = 0;
  /** Har touchmove par pichhla finger-span — incremental zoom (noisy WebView pehla frame). */
  let lastPinchDist = 0;
  /** Do ungliyon ke beech minimum span — bahut chhota startDist = ratio jump. */
  const MIN_PINCH_SPAN_PX = 28;
  /** Pinch midpoint — `applyViewZoomCss` scroll-anchor (PDF repaint band). */
  let pinchAnchorClientX = 0;
  let pinchAnchorClientY = 0;

  /** Page wrap stack + aux — canvas reuse ke baad bhi scroll size sahi. */
  const measurePdfPreviewContentSize = (): { W: number; H: number } => {
    const wraps = zoomInner.querySelectorAll("[data-pdf-page-wrap]");
    if (wraps.length > 0) {
      let maxW = 0;
      let sumH = 0;
      wraps.forEach((w) => {
        const el = w as HTMLElement;
        maxW = Math.max(maxW, el.offsetWidth);
        sumH += el.offsetHeight;
      });
      for (const node of zoomInner.children) {
        if (node instanceof HTMLElement && !node.hasAttribute("data-pdf-page-wrap")) {
          sumH += node.offsetHeight;
        }
      }
      return { W: Math.max(1, maxW), H: Math.max(1, sumH) };
    }
    const canvases = zoomInner.querySelectorAll("canvas");
    if (canvases.length === 0) {
      return {
        W: Math.max(1, zoomInner.scrollWidth || zoomInner.offsetWidth),
        H: Math.max(1, zoomInner.scrollHeight || zoomInner.offsetHeight),
      };
    }
    let maxW = 0;
    let sumH = 0;
    canvases.forEach((c, i) => {
      maxW = Math.max(maxW, c.offsetWidth);
      sumH += c.offsetHeight;
      if (i < canvases.length - 1) sumH += 12;
    });
    for (const node of zoomInner.children) {
      if (!(node instanceof HTMLCanvasElement) && node instanceof HTMLElement) {
        sumH += node.offsetHeight;
      }
    }
    return { W: Math.max(1, maxW), H: Math.max(1, sumH) };
  };

  const touchDist = (t: TouchList) => {
    if (t.length < 2) return 0;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };

  /** Screen midpoint → scrollHost client coords — +/- zoom anchor; padding offset se top-left jump fix. */
  const midpointToScrollClientAnchor = (midX: number, midY: number) => {
    const br = scrollHost.getBoundingClientRect();
    const x0 = br.left + scrollHost.clientLeft;
    const y0 = br.top + scrollHost.clientTop;
    const cw = scrollHost.clientWidth;
    const ch = scrollHost.clientHeight;
    const ax = Math.min(Math.max(0, midX - x0), Math.max(1, cw) - 1);
    const ay = Math.min(Math.max(0, midY - y0), Math.max(1, ch) - 1);
    return { ax, ay };
  };

  /** Bitmap `renderedZoomPercent` ke khilaf CSS `scale` + wrap size — hybrid me turant smooth; bada farq par PDF repaint. */
  const applyViewZoomCss = (opts?: {
    preserveAnchor?: boolean;
    anchorClientX?: number;
    anchorClientY?: number;
  }) => {
    if (!usePdfJs) return;
    if (!zoomInner.querySelector("[data-pdf-page-wrap],canvas")) return;
    const el = scrollHost;
    const basisZoom = Math.max(ZOOM_MIN, renderedZoomPercent);
    const s = clampZoom(zoomPercent) / basisZoom;
    const preserve = opts?.preserveAnchor === true;
    const scw = el.clientWidth;
    const sch = el.clientHeight;
    let nx = 0.5;
    let ny = 0.5;
    let anchorX = scw / 2;
    let anchorY = sch / 2;
    let sl0 = el.scrollLeft;
    let st0 = el.scrollTop;
    let sw0 = 1;
    let sh0 = 1;
    if (preserve && scw > 0 && sch > 0) {
      sw0 = Math.max(1, el.scrollWidth);
      sh0 = Math.max(1, el.scrollHeight);
      if (opts?.anchorClientX != null && opts?.anchorClientY != null) {
        anchorX = Math.min(Math.max(0, opts.anchorClientX), scw);
        anchorY = Math.min(Math.max(0, opts.anchorClientY), sch);
      } else {
        anchorX = scw * 0.5;
        anchorY = sch * 0.5;
      }
      sl0 = el.scrollLeft;
      st0 = el.scrollTop;
      nx = (sl0 + anchorX) / sw0;
      ny = (st0 + anchorY) / sh0;
    }
    const { W, H } = measurePdfPreviewContentSize();
    zoomInner.style.willChange = "transform";
    zoomInner.style.transformOrigin = "top left";
    zoomInner.style.backfaceVisibility = "hidden";
    zoomInner.style.transformStyle = "preserve-3d";
    zoomInner.style.perspective = "1000px";
    // `contain: … size` mat lagao — `inline-block` zoomInner ka intrinsic size bachhon se aata hai; `size` = 0×0 collapse + flash.
    zoomInner.style.transition = "none";
    zoomInner.style.transform = `scale(${s})`;
    const wrapW = `${Math.ceil(W * s)}px`;
    const wrapH = `${Math.ceil(H * s)}px`;
    zoomScalerWrap.style.width = wrapW;
    zoomScalerWrap.style.height = wrapH;
    // Kuch WebView flex item ko width ke baad bhi shrink karte — min size lock taaki scrollWidth sahi rahe.
    zoomScalerWrap.style.minWidth = wrapW;
    zoomScalerWrap.style.minHeight = wrapH;
    if (preserve && scw > 0 && sch > 0) {
      const ax0 = anchorX;
      const ay0 = anchorY;
      const nx0 = nx;
      const ny0 = ny;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void zoomScalerWrap.offsetHeight;
          void el.offsetHeight;
          const nsw = Math.max(1, el.scrollWidth);
          const nsh = Math.max(1, el.scrollHeight);
          const maxL = Math.max(0, nsw - scw);
          const maxT = Math.max(0, nsh - sch);
          el.scrollLeft = Math.round(Math.min(maxL, Math.max(0, nx0 * nsw - ax0)));
          el.scrollTop = Math.round(Math.min(maxT, Math.max(0, ny0 * nsh - ay0)));
        });
      });
    }
  };

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
      const { ensurePdfJsWorker, PDFJS_WORKER_VERSION_FALLBACK } = await import("@/lib/pdfjsWorkerSrc");
      const version =
        (pdfjsLib as { version?: string }).version ??
        pdfjs.version ??
        PDFJS_WORKER_VERSION_FALLBACK;
      await ensurePdfJsWorker(pdfjs, version);

      const blob = await fetch(blobUrl).then((r) => r.blob());
      if (previewCancelled.v) return;
      const pdf = await loadPdfJsDocument(blob, pdfjs, {
        isCancelled: () => previewCancelled.v,
      });
      if (!pdf || previewCancelled.v) return;

      /** Fit / hybrid: `skipOffscreen` hybrid repaint par — pehle viewport, idle me baaki. */
      const runPaintAtZoom = async (pct: number, skipOffscreen = false) => {
        if (previewCancelled.v) return;
        resetPdfPreviewTransforms();
        const cw = scrollHost.clientWidth > 0 ? scrollHost.clientWidth : 0;
        await renderPdfPagesToZoomInner(pdf, zoomInner, {
          zoomPercent: pct,
          scrollInnerWidthPx: cw > 0 ? cw : undefined,
          onFirstPageRendered: hideLoading,
          isCancelled: () => previewCancelled.v,
          skipOffscreen,
          scrollHostForCull: skipOffscreen ? scrollHost : undefined,
        });
        if (!previewCancelled.v) hideLoading();
      };

      /** Sab platform: pehli page viewport me fit (width+height constraint); multi-page sab ek hi scale. */
      const applyFitZoom = async () => {
        if (previewCancelled.v || !pdf) return;
        paintSupersessionToken++;
        if (repaintTimer != null) {
          clearTimeout(repaintTimer);
          repaintTimer = null;
        }
        pinchActive = false;
        pinchStartDist = 0;
        lastPinchDist = 0;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
        const cw = scrollHost.clientWidth;
        const ch = scrollHost.clientHeight;
        const padX = 28;
        const padY = 32;
        const availW = Math.max(120, cw - padX);
        const availH = Math.max(160, ch - padY);
        const vwBasis = Math.max(200, cw - 16);
        zoomPercent = clampZoom(await computeFitZoomPercentForFirstPage(pdf, availW, availH, vwBasis));
        if (!previewCancelled.v) {
          updateZoomLabel();
          // 220% par paint + chhota label = zyada CSS downscale = PC blur; label = paint se `rendered` match, scale 1.
          await runPaintAtZoom(zoomPercent);
          renderedZoomPercent = zoomPercent;
          scrollHost.scrollLeft = 0;
          scrollHost.scrollTop = 0;
          // Pehle frame me layout flush — bina iske `measurePdfPreviewContentSize` / scroll galat, ek page fit nahi dikhta.
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
          applyViewZoomCss();
        }
      };

      runPaintAtZoomRef = runPaintAtZoom;

      await applyFitZoom();
      toolbarFitPdf = applyFitZoom;
    } catch (e) {
      console.warn("[inAppPdfPreview] PDF.js preview failed", e);
      loadingOverlay.textContent = "Preview failed — use Share for PDF";
      loadingOverlay.style.fontSize = "14px";
      loadingOverlay.style.padding = "16px";
      // Overlay rahne dinchha ta user le message dekhlos
    }
  })();

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
  /** Fit dubara — viewport / padding ke hisaab se page 1 samaana; multi-page ek hi scale */
  const zoomFitBtn = mkBtn("Fit");
  zoomFitBtn.style.padding = "8px 12px";
  zoomFitBtn.style.fontSize = "13px";
  zoomFitBtn.setAttribute("aria-label", "Fit first page to screen");

  /** Hybrid: pehle CSS (smooth), farq ≥ `REPAINT_THRESHOLD` par debounced PDF repaint (sharp). */
  const setZoom = async (
    next: number,
    opts?: {
      preserveAnchor?: boolean;
      anchorClientX?: number;
      anchorClientY?: number;
      fromPinch?: boolean;
    }
  ) => {
    if (!usePdfJs) return;
    if (!opts?.fromPinch) {
      pinchActive = false;
      pinchStartDist = 0;
      lastPinchDist = 0;
    }
    zoomPercent = clampZoom(next);
    updateZoomLabel();

    applyViewZoomCss({
      preserveAnchor: opts?.preserveAnchor ?? true,
      anchorClientX: opts?.anchorClientX,
      anchorClientY: opts?.anchorClientY,
    });

    if (opts?.fromPinch) {
      return;
    }

    const diff = Math.abs(zoomPercent - renderedZoomPercent);
    if (diff < REPAINT_THRESHOLD) return;
    if (repaintTimer != null) clearTimeout(repaintTimer);
    const scheduleToken = paintSupersessionToken;
    const anchorForRepaint = {
      preserveAnchor: opts?.preserveAnchor ?? true,
      anchorClientX: opts?.anchorClientX,
      anchorClientY: opts?.anchorClientY,
    };
    repaintTimer = setTimeout(() => {
      repaintTimer = null;
      void (async () => {
        if (scheduleToken !== paintSupersessionToken) return;
        if (repainting || !runPaintAtZoomRef || previewCancelled.v) return;
        if (Math.abs(zoomPercent - renderedZoomPercent) < REPAINT_THRESHOLD) return;
        repainting = true;
        try {
          const paintAt = clampZoom(zoomPercent);
          const sl = scrollHost.scrollLeft;
          const st = scrollHost.scrollTop;
          await new Promise<void>((resolve) => {
            const execPaint = async () => {
              try {
                await runPaintAtZoomRef(paintAt, true);
              } finally {
                resolve();
              }
            };
            const ric = (globalThis as unknown as {
              requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            }).requestIdleCallback;
            if (typeof ric === "function") ric(() => void execPaint(), { timeout: 500 });
            else setTimeout(() => void execPaint(), 16);
          });
          scrollHost.scrollLeft = sl;
          scrollHost.scrollTop = st;
          if (scheduleToken !== paintSupersessionToken) return;
          renderedZoomPercent = paintAt;
          applyViewZoomCss(anchorForRepaint);
          window.setTimeout(() => {
            zoomInner.style.willChange = "auto";
          }, 180);
        } catch (e) {
          console.warn("[inAppPdfPreview] hybrid repaint failed", e);
        } finally {
          repainting = false;
        }
      })();
    }, PDF_REPAINT_DEBOUNCE_MS);
  };

  zoomOutBtn.onclick = () => {
    void setZoom(zoomPercent - ZOOM_STEP);
  };
  zoomInBtn.onclick = () => {
    void setZoom(zoomPercent + ZOOM_STEP);
  };
  zoomFitBtn.onclick = () => {
    void toolbarFitPdf?.();
  };

  // Pinch: `fromPinch` par sirf CSS; finger up par hi debounced PDF repaint.

  const endPinchAndCommitPaint = () => {
    if (!pinchActive) {
      pinchStartDist = 0;
      lastPinchDist = 0;
      return;
    }
    pinchActive = false;
    pinchStartDist = 0;
    lastPinchDist = 0;
    if (previewCancelled.v) return;
    void setZoom(zoomPercent, {
      preserveAnchor: true,
      anchorClientX: pinchAnchorClientX,
      anchorClientY: pinchAnchorClientY,
    });
  };

  // `capture: true` — do ungli canvas par hon to bhi event scrollHost se pehle mile (bubble canvas se miss ho sakta tha).
  const pinchTouchOpts: AddEventListenerOptions = { passive: false, capture: true };
  scrollHost.addEventListener(
    "touchstart",
    (ev) => {
      if (!usePdfJs || ev.touches.length !== 2) return;
      // Mobile pinch gesture ko browser/page default zoom se bachao; zoom handling preview ke andar hi rahe.
      ev.preventDefault();
      pinchActive = true;
      const rawDist = touchDist(ev.touches);
      pinchStartDist = Math.max(rawDist, MIN_PINCH_SPAN_PX);
      lastPinchDist = pinchStartDist;
      const t0 = ev.touches[0];
      const t1 = ev.touches[1];
      const midX = (t0.clientX + t1.clientX) * 0.5;
      const midY = (t0.clientY + t1.clientY) * 0.5;
      const a = midpointToScrollClientAnchor(midX, midY);
      pinchAnchorClientX = a.ax;
      pinchAnchorClientY = a.ay;
    },
    pinchTouchOpts
  );
  scrollHost.addEventListener(
    "touchmove",
    (ev) => {
      if (!usePdfJs || ev.touches.length !== 2) return;
      const d = touchDist(ev.touches);
      if (d <= 0) return;
      // Kabhi pehla stable 2-finger sample touchmove par — pinch yahin se shuru (touchstart miss).
      if (!pinchActive || pinchStartDist <= 0) {
        ev.preventDefault();
        pinchActive = true;
        pinchStartDist = Math.max(d, MIN_PINCH_SPAN_PX);
        lastPinchDist = pinchStartDist;
        const t0 = ev.touches[0]!;
        const t1 = ev.touches[1]!;
        const midX = (t0.clientX + t1.clientX) * 0.5;
        const midY = (t0.clientY + t1.clientY) * 0.5;
        const a = midpointToScrollClientAnchor(midX, midY);
        pinchAnchorClientX = a.ax;
        pinchAnchorClientY = a.ay;
        return;
      }
      // 2-finger move: incremental ratio — `pinchStartZoom * (d/startDist)` pehle move par 50% jump deta tha.
      ev.preventDefault();
      const t0 = ev.touches[0];
      const t1 = ev.touches[1];
      const midX = (t0.clientX + t1.clientX) * 0.5;
      const midY = (t0.clientY + t1.clientY) * 0.5;
      const a = midpointToScrollClientAnchor(midX, midY);
      pinchAnchorClientX = a.ax;
      pinchAnchorClientY = a.ay;
      const ratio = d / Math.max(lastPinchDist, 1);
      lastPinchDist = d;
      void setZoom(clampZoom(zoomPercent * ratio), {
        preserveAnchor: true,
        anchorClientX: pinchAnchorClientX,
        anchorClientY: pinchAnchorClientY,
        fromPinch: true,
      });
    },
    pinchTouchOpts
  );
  scrollHost.addEventListener(
    "touchend",
    (ev) => {
      if (!pinchActive) return;
      if (ev.touches.length >= 2) return;
      endPinchAndCommitPaint();
    },
    pinchTouchOpts
  );
  scrollHost.addEventListener(
    "touchcancel",
    () => {
      endPinchAndCommitPaint();
    },
    pinchTouchOpts
  );

  // Ctrl + wheel zoom (desktop / trackpad)
  scrollHost.addEventListener(
    "wheel",
    (ev) => {
      if (!usePdfJs || !ev.ctrlKey) return;
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const a = midpointToScrollClientAnchor(ev.clientX, ev.clientY);
      void setZoom(zoomPercent + delta, {
        preserveAnchor: true,
        anchorClientX: a.ax,
        anchorClientY: a.ay,
      });
    },
    { passive: false }
  );

  const printBtn = mkBtn("Print", true);
  printBtn.onclick = () => {
    void (async () => {
      try {
        if (!usePdfJs) {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          return;
        }

        const canvases = zoomInner.querySelectorAll("canvas");
        /** JPG + full-size canvas snapshot = print preview me black artefacts; sirf iframe fail par chalao */
        const printViaCanvasSnapshots = (): void => {
          if (canvases.length === 0) return;
          const w = window.open("", "_blank");
          if (!w) return;
          const body = Array.from(canvases)
            .map((c) => {
              const dataUrl = canvasToSafePrintDataUrl(c as HTMLCanvasElement);
              return `<div style="page-break-after:always;text-align:center;background:#fff"><img src="${dataUrl}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto"/></div>`;
            })
            .join("");
          w.document.write(
            `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Print</title><style>body{margin:0;background:#fff}@media print{body{background:#fff}}</style></head><body>${body}</body></html>`
          );
          w.document.close();
          w.focus();
          setTimeout(() => {
            try {
              w.print();
            } catch {
              /* ignore */
            }
            setTimeout(() => {
              try {
                w.close();
              } catch {
                /* ignore */
              }
            }, 600);
          }, 220);
        };

        let restoredScroll = false;
        const restorePdfJsScrollView = () => {
          if (restoredScroll) return;
          restoredScroll = true;
          iframe.style.display = "none";
          scrollHost.style.display = "flex";
        };

        try {
          iframe.style.display = "block";
          scrollHost.style.display = "none";

          await new Promise<void>((resolve, reject) => {
            const to = window.setTimeout(() => reject(new Error("pdf-iframe-load-timeout")), 6500);
            const clear = () => window.clearTimeout(to);
            const onLoad = () => {
              clear();
              resolve();
            };
            const onErr = () => {
              clear();
              reject(new Error("pdf-iframe-load-error"));
            };
            iframe.addEventListener("load", onLoad, { once: true });
            iframe.addEventListener("error", onErr, { once: true });
            iframe.src = "";
            iframe.src = blobUrl;
          });

          const cw = iframe.contentWindow;
          if (!cw) throw new Error("pdf-iframe-no-window");

          const afterDialog = () => {
            restorePdfJsScrollView();
          };
          cw.addEventListener("afterprint", afterDialog, { once: true });
          window.setTimeout(afterDialog, 3500);

          try {
            cw.focus();
            cw.print();
          } catch {
            throw new Error("pdf-print-throw");
          }
        } catch {
          restorePdfJsScrollView();
          printViaCanvasSnapshots();
        }
      } catch (e) {
        console.warn("[inAppPdfPreview] print failed", e);
      }
    })();
  };

  const shareBtn = mkBtn("Share");
  shareBtn.onclick = async () => {
    shareBtn.disabled = true;
    try {
      const blob = await fetch(blobUrl).then((r) => r.blob());
      await sharePdfBlob(blob, fileName, { previewRoot: root });
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
    zoomCluster.append(zoomOutBtn, zoomLabel, zoomInBtn, zoomFitBtn);
    bar.append(titleEl, zoomCluster, printBtn, shareBtn, closeBtn);
  } else {
    bar.append(titleEl, printBtn, shareBtn, closeBtn);
  }
  // Pehle preview area, pachi footer — screen preview; print = iframe.contentWindow.print() → toolbar PDF ma jodainna
  root.append(previewWrap, bar);

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      const sheet = root.querySelector(`[${PDF_SHARE_SHEET_ATTR}="1"]`);
      if (sheet) {
        sheet.remove();
        return;
      }
      safeClose();
    }
  });

  document.body.appendChild(root);
  pushInAppAttachmentPreviewLayer(root);
  // APK hardware back: sabse pehle in-app PDF preview band ho, peeche ka page back na ho.
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

/**
 * Multi-attachment gallery: slide badalne se pehle khula PDF overlay band karo (Escape = `safeClose` + blob revoke).
 * Warna purana blob URL zinda PDF.js / gallery `disposeSlideBlob` race.
 */
export function dismissOpenInAppPdfPreviewIfPresent(): void {
  if (typeof document === "undefined") return;
  const el = document.querySelector("[data-in-app-pdf-preview]");
  if (!(el instanceof HTMLElement)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
}

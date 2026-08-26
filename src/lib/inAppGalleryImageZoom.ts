"use client";

/**
 * Gallery image slide ke liye `inAppImagePreview` jaisa zoom + pan + pinch (multi-file viewer ke andar).
 */
function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export type GalleryImageZoomApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Entire image visible inside viewport — default on open (tall JPEG poora screen me). */
  fitHeight: () => void;
  /** Image width matches viewport width; scroll vertically to read. */
  fitWidth: () => void;
  /** @deprecated use fitHeight */
  fit: () => void;
  getScale: () => number;
  dispose: () => void;
};

export type GalleryImageZoomFitOpts = {
  /** Stitched multi-page PDF JPEG: fit/zoom uses 1 page height (scroll for page 2+). */
  onePageHeightPx?: number;
};

/**
 * `scrollHost` khali hona chahiye — yahin inner structure append hogi; `img` pehle se `src` set ho sakta hai.
 */
export function mountGalleryImageZoom(
  scrollHost: HTMLElement,
  img: HTMLImageElement,
  onScaleChange: (scale: number) => void,
  fitOpts?: GalleryImageZoomFitOpts
): GalleryImageZoomApi {
  const onePageHeightPx = Math.max(0, Number(fitOpts?.onePageHeightPx || 0));
  const multiPagePdfRaster = onePageHeightPx > 1;
  let disposed = false;
  let scrollResizeObserver: ResizeObserver | null = null;
  let dragPanActive = false;
  let dragPanPointerId = -1;

  scrollHost.style.cssText =
    "flex:1;min-width:0;min-height:0;width:100%;height:100%;overflow:scroll;background:#2a2a2a;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-x pan-y;user-select:none";

  const innerPad = document.createElement("div");
  innerPad.style.cssText =
    "position:relative;box-sizing:border-box;margin:0;padding:0;flex-shrink:0;touch-action:pan-x pan-y";

  const sizeBox = document.createElement("div");
  sizeBox.style.cssText = "position:absolute";

  const imgWrap = document.createElement("div");
  imgWrap.style.cssText =
    "display:block;transform-origin:0 0;transition:transform 0.15s ease-out;will-change:transform";

  /** Natural pixel size — scale transform se zoom; fit-width default ke liye max-height hata kar poora scroll */
  img.style.cssText =
    "display:block;width:auto;height:auto;max-width:none;max-height:none;object-fit:contain;box-shadow:0 2px 12px rgba(0,0,0,0.4);user-select:none;-webkit-user-drag:none";
  img.draggable = false;

  imgWrap.appendChild(img);
  sizeBox.appendChild(imgWrap);
  innerPad.appendChild(sizeBox);
  scrollHost.appendChild(innerPad);

  let scale = 1;
  /** Fit width/height: lamba image ho to scale chhota zaroori ho sakta hai — pinch/zoom-out floor bhi yahi (purana MIN 0.5 = pinch bug). */
  const FIT_SCALE_MIN = 0.02;
  const MIN_ZOOM = FIT_SCALE_MIN;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.25;

  let baseLayoutW = 0;
  let baseLayoutH = 0;

  const emitScale = () => onScaleChange(scale);

  const H_PAD = 16;

  const ensureBaseLayout = () => {
    if (baseLayoutW > 0 && baseLayoutH > 0) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (nw < 2 || nh < 2) return;
    baseLayoutW = nw;
    baseLayoutH = nh;
    img.style.width = `${nw}px`;
    img.style.height = `${nh}px`;
    imgWrap.style.width = `${baseLayoutW}px`;
    imgWrap.style.height = `${baseLayoutH}px`;
  };

  const computeFitWidthScale = () => {
    ensureBaseLayout();
    if (baseLayoutW <= 0) return 1;
    const vw = Math.max(scrollHost.clientWidth - H_PAD, 1);
    return Math.max(FIT_SCALE_MIN, Math.min(MAX_ZOOM, vw / baseLayoutW));
  };

  const computeFitHeightScale = () => {
    ensureBaseLayout();
    if (baseLayoutW <= 0) return 1;
    const vw = Math.max(scrollHost.clientWidth - H_PAD, 1);
    const vh = Math.max(scrollHost.clientHeight - H_PAD, 1);
    const fitH =
      multiPagePdfRaster && img.naturalHeight > onePageHeightPx ? onePageHeightPx : baseLayoutH;
    return Math.max(
      FIT_SCALE_MIN,
      Math.min(MAX_ZOOM, Math.min(vw / baseLayoutW, vh / fitH))
    );
  };

  let dragPanStartX = 0;
  let dragPanStartY = 0;
  let dragPanStartScrollL = 0;
  let dragPanStartScrollT = 0;

  let pinchStartDist = 0;
  /** Frame-to-frame pinch — purana `startScale * (d/startDist)` pehle touchmove par noisy ratio = jump (WebView). */
  let lastPinchDist = 0;
  /** Do ungliyon ke beech kam se kam span — chhota baseline = zyada ratio = ek hi frame me zoom jump. */
  const MIN_PINCH_SPAN_PX = 28;

  const updateGrabCursor = () => {
    const maxX = scrollHost.scrollWidth - scrollHost.clientWidth;
    const maxY = scrollHost.scrollHeight - scrollHost.clientHeight;
    const canPan = maxX > 2 || maxY > 2;
    const touchAct = canPan ? "none" : "pan-x pan-y";
    scrollHost.style.touchAction = touchAct;
    innerPad.style.touchAction = touchAct;
    if (dragPanActive) {
      scrollHost.style.cursor = "grabbing";
      return;
    }
    scrollHost.style.cursor = canPan ? "grab" : "";
  };

  const syncLayout = (opts?: { skipTransition?: boolean }) => {
    if (disposed) return;
    ensureBaseLayout();
    if (baseLayoutW <= 0) {
      imgWrap.style.transform = `scale(${scale})`;
      updateGrabCursor();
      emitScale();
      return;
    }
    if (opts?.skipTransition) imgWrap.style.transition = "none";
    else imgWrap.style.transition = "transform 0.15s ease-out";

    imgWrap.style.transform = `scale(${scale})`;

    const bw = Math.max(1, Math.ceil(baseLayoutW * scale));
    const bh = Math.max(1, Math.ceil(baseLayoutH * scale));
    const vw = Math.max(scrollHost.clientWidth, 1);
    const vh = Math.max(scrollHost.clientHeight, 1);
    const innerW = Math.max(vw, bw);
    const innerH = Math.max(vh, bh);

    innerPad.style.width = `${innerW}px`;
    innerPad.style.height = `${innerH}px`;

    sizeBox.style.width = `${bw}px`;
    sizeBox.style.height = `${bh}px`;
    sizeBox.style.left = `${(innerW - bw) / 2}px`;
    sizeBox.style.top = `${(innerH - bh) / 2}px`;

    updateGrabCursor();
    emitScale();
  };

  const endManualDragPan = (e?: PointerEvent) => {
    if (!dragPanActive) return;
    if (e && e.pointerId !== dragPanPointerId) return;
    dragPanActive = false;
    dragPanPointerId = -1;
    if (e) {
      try {
        scrollHost.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    updateGrabCursor();
  };

  const abortManualPanForPinch = () => {
    if (!dragPanActive || dragPanPointerId < 0) return;
    const pid = dragPanPointerId;
    dragPanActive = false;
    dragPanPointerId = -1;
    try {
      scrollHost.releasePointerCapture(pid);
    } catch {
      /* ignore */
    }
    updateGrabCursor();
  };

  const canStartPointerPan = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return e.button === 0;
    if (e.pointerType === "touch" || e.pointerType === "pen") return e.isPrimary;
    return false;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (disposed || !canStartPointerPan(e)) return;
    const maxX = scrollHost.scrollWidth - scrollHost.clientWidth;
    const maxY = scrollHost.scrollHeight - scrollHost.clientHeight;
    if (maxX <= 2 && maxY <= 2) return;
    e.preventDefault();
    dragPanActive = true;
    dragPanPointerId = e.pointerId;
    dragPanStartX = e.clientX;
    dragPanStartY = e.clientY;
    dragPanStartScrollL = scrollHost.scrollLeft;
    dragPanStartScrollT = scrollHost.scrollTop;
    scrollHost.style.cursor = "grabbing";
    try {
      scrollHost.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (pinchStartDist > 0) return;
    if (!dragPanActive || e.pointerId !== dragPanPointerId) return;
    e.preventDefault();
    const dx = e.clientX - dragPanStartX;
    const dy = e.clientY - dragPanStartY;
    scrollHost.scrollLeft = dragPanStartScrollL - dx;
    scrollHost.scrollTop = dragPanStartScrollT - dy;
  };

  scrollHost.addEventListener("pointerdown", onPointerDown, { passive: false });
  scrollHost.addEventListener("pointermove", onPointerMove, { passive: false });
  scrollHost.addEventListener("pointerup", (e) => endManualDragPan(e));
  scrollHost.addEventListener("pointercancel", (e) => endManualDragPan(e));
  scrollHost.addEventListener("lostpointercapture", () => endManualDragPan());

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      abortManualPanForPinch();
      const raw = touchDistance(e.touches[0]!, e.touches[1]!);
      pinchStartDist = Math.max(raw, MIN_PINCH_SPAN_PX);
      lastPinchDist = pinchStartDist;
      if (pinchStartDist > 0) imgWrap.style.transition = "none";
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    const d = touchDistance(e.touches[0]!, e.touches[1]!);
    if (d <= 0) return;
    // Pehla 2-finger move kabhi touchstart se pehle aata — yahan pinch shuru karo.
    if (pinchStartDist <= 0) {
      abortManualPanForPinch();
      pinchStartDist = Math.max(d, MIN_PINCH_SPAN_PX);
      lastPinchDist = pinchStartDist;
      imgWrap.style.transition = "none";
    }
    e.preventDefault();
    const ratio = d / Math.max(lastPinchDist, 1);
    lastPinchDist = d;
    let next = scale * ratio;
    next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    scale = next;
    syncLayout({ skipTransition: true });
  };

  const endPinch = (e?: TouchEvent) => {
    if (pinchStartDist <= 0 && lastPinchDist <= 0) return;
    if (e && e.touches.length >= 2) return;
    pinchStartDist = 0;
    lastPinchDist = 0;
    imgWrap.style.transition = "transform 0.15s ease-out";
    requestAnimationFrame(() => {
      if (baseLayoutW > 0) syncLayout({ skipTransition: true });
    });
  };

  scrollHost.addEventListener("touchstart", onTouchStart, { passive: true });
  scrollHost.addEventListener("touchmove", onTouchMove, { passive: false });
  scrollHost.addEventListener("touchend", (e) => endPinch(e), { passive: true });
  scrollHost.addEventListener("touchcancel", () => endPinch(), { passive: true });

  // Zoom ke baad wheel: Radix dialog / preview layer par native scroll miss — manual scrollTop
  scrollHost.addEventListener(
    "wheel",
    (ev) => {
      const canY = scrollHost.scrollHeight > scrollHost.clientHeight + 1;
      const canX = scrollHost.scrollWidth > scrollHost.clientWidth + 1;
      if (!canY && !canX) return;
      ev.preventDefault();
      ev.stopPropagation();
      scrollHost.scrollTop += ev.deltaY;
      scrollHost.scrollLeft += ev.deltaX;
    },
    { passive: false }
  );

  const initImageLayout = () => {
    if (disposed) return;
    if (img.naturalWidth < 1 && img.offsetWidth < 2) return;
    baseLayoutW = 0;
    baseLayoutH = 0;
    img.style.width = "";
    img.style.height = "";
    imgWrap.style.width = "";
    imgWrap.style.height = "";
    scale = 1;
    emitScale();

    let layoutWaitFrames = 0;
    const finish = () => {
      if (disposed) return;
      ensureBaseLayout();
      if (baseLayoutW <= 0) return;
      if (scrollHost.clientWidth < 2) {
        layoutWaitFrames += 1;
        if (layoutWaitFrames > 60) return;
        requestAnimationFrame(finish);
        return;
      }
      // Default: poora image ek screen me (W+H) — fitWidth se tall JPEG zoomed / scrollbars khulte the
      scale = computeFitHeightScale();
      emitScale();
      syncLayout();
      requestAnimationFrame(() => {
        const sl = Math.max(0, (scrollHost.scrollWidth - scrollHost.clientWidth) / 2);
        const st = multiPagePdfRaster
          ? 0
          : Math.max(0, (scrollHost.scrollHeight - scrollHost.clientHeight) / 2);
        scrollHost.scrollTo({ left: sl, top: st, behavior: "auto" });
      });
    };

    requestAnimationFrame(() => requestAnimationFrame(finish));
  };

  if (img.complete && img.naturalWidth > 0) {
    requestAnimationFrame(initImageLayout);
  } else {
    img.addEventListener("load", () => initImageLayout(), { once: true });
  }

  if (typeof ResizeObserver !== "undefined") {
    scrollResizeObserver = new ResizeObserver(() => {
      if (baseLayoutW > 0) syncLayout({ skipTransition: true });
    });
    scrollResizeObserver.observe(scrollHost);
  }

  const zoomOut = () => {
    scale = Math.max(MIN_ZOOM, Math.round((scale - ZOOM_STEP) * 100) / 100);
    syncLayout();
  };

  const zoomIn = () => {
    scale = Math.min(MAX_ZOOM, Math.round((scale + ZOOM_STEP) * 100) / 100);
    syncLayout();
  };

  const fitWidth = () => {
    scale = computeFitWidthScale();
    syncLayout();
    requestAnimationFrame(() => {
      scrollHost.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
  };

  const fitHeight = () => {
    scale = computeFitHeightScale();
    syncLayout();
    requestAnimationFrame(() => {
      const sl = Math.max(0, (scrollHost.scrollWidth - scrollHost.clientWidth) / 2);
      const st = multiPagePdfRaster
        ? 0
        : Math.max(0, (scrollHost.scrollHeight - scrollHost.clientHeight) / 2);
      scrollHost.scrollTo({ left: sl, top: st, behavior: "auto" });
    });
  };

  /** Backward compat: pehle "Fit" = poora image screen me — ab fitHeight */
  const fit = fitHeight;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    endManualDragPan();
    try {
      scrollResizeObserver?.disconnect();
    } catch {
      /* ignore */
    }
    scrollResizeObserver = null;
    scrollHost.replaceChildren();
  };

  return {
    zoomIn,
    zoomOut,
    fitHeight,
    fitWidth,
    fit,
    getScale: () => scale,
    dispose,
  };
}

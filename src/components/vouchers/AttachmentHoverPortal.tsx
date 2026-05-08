"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFileHoverPreview } from "@/contexts/FileHoverPreviewContext";

/** Tooltip se zyada: fixed portal + solid bg taaki table/parent overflow ya blend se file transparent na dikhe */
const HOVER_CLOSE_MS = 280;
const PANEL_Z = 400000;
const BACKDROP_Z = PANEL_Z - 1;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
/** Fit Width/Height: natural-size layout × scale — chhoti scale allowed (lamba stitched JPG) */
const FIT_ZOOM_MIN = 0.02;

/** Fit window: `z` jis se layout ke baad poora content (sab images) viewport ke andar ho */
function computeFitWindowZoomFromImages(root: HTMLElement, cw: number, ch: number): number | null {
  const imgs = [...root.querySelectorAll("img")].filter(
    (n): n is HTMLImageElement =>
      n instanceof HTMLImageElement && n.naturalWidth >= 2 && n.naturalHeight >= 1
  );
  if (imgs.length === 0) return null;
  const innerW = Math.max(cw - 16, 1);
  const innerH = Math.max(ch - 16, 1);
  let maxNw = 0;
  let sumNh = 0;
  for (const im of imgs) {
    maxNw = Math.max(maxNw, im.naturalWidth);
    sumNh += im.naturalHeight;
  }
  // Har img par same `zoom`: width ≈ nw*z → total scroll width maxNw*z; vertical stack → height ≈ sumNh*z
  const zw = innerW / maxNw;
  const zh = innerH / Math.max(sumNh, 1);
  const z = Math.min(zw, zh);
  return Math.min(ZOOM_MAX, Math.max(FIT_ZOOM_MIN, z));
}

/** Multi-attachment preview: pehli decode hui image se zoom ratio (sab img par same factor) */
function getFirstSizedImg(root: HTMLElement): HTMLImageElement | null {
  const list = root.querySelectorAll("img");
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.naturalWidth >= 2) return el;
  }
  return list[0] ?? null;
}

type PanSession = {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

/** Hydration-safe nahi: useLayoutEffect se pehle paint tak false — coarse pointer / touch par tap-toggle (hover enter/leave mobile par turant band ho jata tha) */
function useTapInteractionMode(): boolean {
  const [tap, setTap] = React.useState(false);
  React.useLayoutEffect(() => {
    setTap(
      typeof window !== "undefined" &&
        (window.matchMedia("(pointer: coarse)").matches ||
          ("ontouchstart" in window && navigator.maxTouchPoints > 0))
    );
  }, []);
  return tap;
}

/** Default `window` = poora image scroll viewport ke andar fit (zoom change se chhota panel + mouse leave wala bug kam) */
type FitMode = "window" | "width" | "height";

type AttachmentHoverPortalProps = {
  /** Hover trigger (icon / thumbnail) */
  children: React.ReactNode;
  /** Preview content — panel ke andar solid background par */
  preview: React.ReactNode;
  disabled?: boolean;
  /** Trigger wrapper class — table icon vs bile FilePreview tile ke liye */
  triggerClassName?: string;
  /** PDF: nested FilePreview ke canvas par dblclick kabhi img tak nahi — scroll area se open in browser */
  onPreviewDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export function AttachmentHoverPortal({
  children,
  preview,
  disabled = false,
  triggerClassName,
  onPreviewDoubleClick,
}: AttachmentHoverPortalProps) {
  const { enabled: globalHoverPreviewEnabled } = useFileHoverPreview();
  const effectiveDisabled = disabled || !globalHoverPreviewEnabled;
  const useTapMode = useTapInteractionMode();
  const [open, setOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  /** Neeche Window / Width / Height — `window` default */
  const [fitMode, setFitMode] = React.useState<FitMode>("window");
  /** Ek baar panel andar click → trigger/pointer-leave auto-close band + backdrop se bahar click = close */
  const [stickOpen, setStickOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const panRef = React.useRef<PanSession>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, [cancelClose]);

  const updatePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 10;
    const maxPanelW = Math.min(820, window.innerWidth - 2 * margin);
    let left = r.right + margin;
    if (left + maxPanelW > window.innerWidth - margin) {
      left = Math.max(margin, r.left - maxPanelW - margin);
    }
    let top = r.top;
    const maxH = window.innerHeight * 0.88;
    if (top + maxH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - maxH - margin);
    }
    setPos({ top, left });
  }, []);

  const applyFitWidth = React.useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const img = getFirstSizedImg(root);
    if (!img || img.naturalWidth < 2) return;

    const attempt = (n: number) => {
      if (n > 60) return;
      if (root.clientWidth < 2) {
        requestAnimationFrame(() => attempt(n + 1));
        return;
      }
      const cw = Math.max(root.clientWidth - 16, 1);
      const nw = img.naturalWidth;
      const z = Math.min(ZOOM_MAX, Math.max(FIT_ZOOM_MIN, cw / nw));
      setZoom(z);
      setFitMode("width");
      requestAnimationFrame(() => {
        root.scrollTo({ left: 0, top: 0, behavior: "auto" });
      });
    };
    attempt(0);
  }, []);

  const applyFitHeight = React.useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const img = getFirstSizedImg(root);
    if (!img || img.naturalWidth < 2) return;

    const attempt = (n: number) => {
      if (n > 60) return;
      if (root.clientWidth < 2 || root.clientHeight < 2) {
        requestAnimationFrame(() => attempt(n + 1));
        return;
      }
      const cw = Math.max(root.clientWidth - 16, 1);
      const ch = Math.max(root.clientHeight - 16, 1);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const z = Math.min(
        ZOOM_MAX,
        Math.max(FIT_ZOOM_MIN, Math.min(cw / nw, ch / nh))
      );
      setZoom(z);
      setFitMode("height");
      requestAnimationFrame(() => {
        const sl = Math.max(0, (root.scrollWidth - root.clientWidth) / 2);
        const st = Math.max(0, (root.scrollHeight - root.clientHeight) / 2);
        root.scrollTo({ left: sl, top: st, behavior: "auto" });
      });
    };
    attempt(0);
  }, []);

  /** Poori preview (multi-image stack bhi) scroll area ke andar fit */
  const applyFitWindow = React.useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;

    const attempt = (n: number) => {
      if (n > 60) return;
      if (root.clientWidth < 2 || root.clientHeight < 2) {
        requestAnimationFrame(() => attempt(n + 1));
        return;
      }
      const cw = Math.max(root.clientWidth, 1);
      const ch = Math.max(root.clientHeight, 1);
      let z = computeFitWindowZoomFromImages(root, cw, ch);
      if (z == null) {
        const img = getFirstSizedImg(root);
        if (!img || img.naturalWidth < 2) return;
        const nw = img.naturalWidth;
        const nh = Math.max(img.naturalHeight, 1);
        const innerW = Math.max(cw - 16, 1);
        const innerH = Math.max(ch - 16, 1);
        z = Math.min(ZOOM_MAX, Math.max(FIT_ZOOM_MIN, Math.min(innerW / nw, innerH / nh)));
      }
      setZoom(z);
      setFitMode("window");
      /** Pehli paint ke baad scrollWidth/Height — flex `gap` + rounding; analytical `z` kabhi thoda chhota */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const r = scrollRef.current;
          if (!r) return;
          const ratio = Math.min(
            r.clientHeight / Math.max(r.scrollHeight, 1),
            r.clientWidth / Math.max(r.scrollWidth, 1),
            1
          );
          const z2 = Math.max(FIT_ZOOM_MIN, Math.min(ZOOM_MAX, z * ratio));
          if (ratio < 0.995) {
            setZoom(z2);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const r2 = scrollRef.current;
                if (!r2) return;
                const sl = Math.max(0, (r2.scrollWidth - r2.clientWidth) / 2);
                const st = Math.max(0, (r2.scrollHeight - r2.clientHeight) / 2);
                r2.scrollTo({ left: sl, top: st, behavior: "auto" });
              });
            });
          } else {
            const sl = Math.max(0, (r.scrollWidth - r.clientWidth) / 2);
            const st = Math.max(0, (r.scrollHeight - r.clientHeight) / 2);
            r.scrollTo({ left: sl, top: st, behavior: "auto" });
          }
        });
      });
    };
    attempt(0);
  }, []);

  const handleOpen = React.useCallback(() => {
    if (effectiveDisabled) return;
    cancelClose();
    setStickOpen(false);
    updatePosition();
    setOpen(true);
  }, [effectiveDisabled, cancelClose, updatePosition]);

  /** Global switch OFF: khula preview turant band (header toggle). */
  React.useEffect(() => {
    if (effectiveDisabled) {
      setOpen(false);
      setStickOpen(false);
    }
  }, [effectiveDisabled]);

  React.useEffect(() => {
    if (!open) {
      setZoom(1);
      setFitMode("window");
      setStickOpen(false);
      return;
    }
    if (useTapMode) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition, useTapMode]);

  /** Default: fit to window — `preview` dep mat rakho (har render naya ref = loop) */
  React.useLayoutEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    if (!root) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) applyFitWindow();
    };
    const imgs = root.querySelectorAll("img");
    const onLoad = () => {
      if (!cancelled) run();
    };
    imgs.forEach((im) => {
      if (!im.complete) im.addEventListener("load", onLoad, { once: true });
    });
    const id = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      imgs.forEach((im) => {
        if (!im.complete) im.removeEventListener("load", onLoad);
      });
    };
  }, [open, applyFitWindow]);

  /**
   * Har `<img>` ko `width = naturalW * zoom` — multi-file stack + PDF thumb baad me aaye to MutationObserver.
   */
  const [scrollable, setScrollable] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!open) {
      setScrollable(false);
      return;
    }
    const root = scrollRef.current;
    if (!root) return;

    const syncScrollable = () => {
      const r = scrollRef.current;
      if (!r) return;
      setScrollable(r.scrollWidth > r.clientWidth + 2 || r.scrollHeight > r.clientHeight + 2);
    };

    const applyLayoutAll = () => {
      root.querySelectorAll("img").forEach((img) => {
        if (!img.naturalWidth || img.naturalWidth < 2) return;
        const nw = img.naturalWidth;
        img.style.width = `${nw * zoom}px`;
        img.style.height = "auto";
        img.style.maxWidth = "none";
        img.style.display = "block";
      });
      syncScrollable();
      requestAnimationFrame(syncScrollable);
    };

    const onImgLoad = () => applyLayoutAll();
    const bindImgLoads = () => {
      root.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", onImgLoad, { once: true });
      });
    };

    applyLayoutAll();
    bindImgLoads();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            applyLayoutAll();
            syncScrollable();
          })
        : null;
    ro?.observe(root);

    const mo =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            bindImgLoads();
            applyLayoutAll();
          })
        : null;
    mo?.observe(root, { childList: true, subtree: true });

    window.addEventListener("resize", syncScrollable);

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", syncScrollable);
    };
  }, [open, zoom]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  const closePanel = React.useCallback(() => {
    cancelClose();
    setOpen(false);
    setStickOpen(false);
  }, [cancelClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  /**
   * Dialog open hone par Radix / react-remove-scroll wheel ko lock karta hai; portal `body` par hai isliye
   * native scroll kabhi fire nahi hota — non-passive wheel se yahin scrollTop/Left badhao (baaki jagah bhi safe).
   */
  React.useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      el.scrollTop += e.deltaY;
      el.scrollLeft += e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  /** PC: mouse left = pan (scroll area); capture hata diya — img se bubble yahi aata hai */
  const handleScrollPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    panRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
  };

  const handleScrollPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = panRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    el.scrollLeft = s.scrollLeft - dx;
    el.scrollTop = s.scrollTop - dy;
    e.preventDefault();
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = panRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    panRef.current.active = false;
    try {
      scrollRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleTriggerPointerEnter = () => {
    if (effectiveDisabled || useTapMode) return;
    handleOpen();
  };

  const handleTriggerPointerLeave = () => {
    if (effectiveDisabled || useTapMode || stickOpen) return;
    scheduleClose();
  };

  /** Panel andar click: hover auto-close off — `stopPropagation` mat (toolbar / zoom buttons ko event chahiye) */
  const handlePanelPointerDownCapture = () => {
    if (stickOpen) return;
    setStickOpen(true);
    cancelClose();
  };

  /** Mobile / touch: ek baar tap = khula rahe; hover enter–leave se band nahi (pehle open + turant close ka bug) */
  const handleTriggerClick = (e: React.MouseEvent) => {
    if (effectiveDisabled || !useTapMode) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen((prev) => {
      if (prev) {
        setStickOpen(false);
        return false;
      }
      setStickOpen(false);
      updatePosition();
      return true;
    });
  };

  const portalTree =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        {/* Tap mode: hamesha backdrop; desktop: sirf `stickOpen` — bahar click = close */}
        {(useTapMode || stickOpen) ? (
          <div
            className={cn("fixed inset-0", useTapMode ? "bg-black/45" : "bg-transparent")}
            style={{ zIndex: BACKDROP_Z }}
            data-attachment-preview-backdrop=""
            onPointerDown={(e) => {
              e.preventDefault();
              closePanel();
            }}
            aria-hidden
          />
        ) : null}
        <div
          className={cn(
            "pointer-events-auto fixed flex max-h-[min(88vh,calc(100dvh-16px))] w-[min(820px,calc(100vw-20px))] flex-col overflow-hidden",
            // reference-other-app (pic 2): mota blue border + barah round + zoom bar same frame
            "border-[3px] border-blue-600 bg-white shadow-2xl dark:bg-zinc-950",
            "isolate [opacity:1]"
          )}
          style={
            useTapMode
              ? {
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: PANEL_Z,
                  borderRadius: "15mm",
                }
              : { top: pos.top, left: pos.left, zIndex: PANEL_Z, borderRadius: "15mm" }
          }
          data-attachment-preview-portal=""
          onPointerEnter={useTapMode ? undefined : cancelClose}
          onPointerLeave={useTapMode || stickOpen ? undefined : scheduleClose}
          onPointerDownCapture={useTapMode ? undefined : handlePanelPointerDownCapture}
          /* Bubble par hi stop — capture par mat (warna toolbar button / img tak event pahunchta hi nahi) */
          onPointerDown={(e) => e.stopPropagation()}
          /* Portal DOM body par hai lekin React bubble table row tak jata hai — dblclick se voucher edit na khule */
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {/* Title center — close: neeche toolbar + backdrop / Escape (user: header par X nahi) */}
          <div className="relative flex shrink-0 items-center justify-center border-b border-blue-600/25 px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Preview</span>
          </div>

          <div
            ref={scrollRef}
            className={cn(
              "min-h-0 flex-1 select-none overflow-auto bg-white px-2 pb-2 pt-1 dark:bg-zinc-950",
              scrollable ? "cursor-grab active:cursor-grabbing" : "cursor-default"
            )}
            style={{ touchAction: "pan-x pan-y" }}
            onPointerDown={handleScrollPointerDown}
            onPointerMove={handleScrollPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onDragStart={(e) => e.preventDefault()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onPreviewDoubleClick?.(e);
            }}
          >
            {/* Zoom = img width multiplier — transform scale() hata diya (layout/scroll fix) */}
            <div className="flex min-w-0 w-full items-start justify-start py-1">
              <div className="inline-block w-max max-w-none shrink-0">{preview}</div>
            </div>
          </div>

          {/* PC: zoom +/− neeche; mobile par bhi yahi bar — top se hata diya */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-blue-600/25 px-2 py-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Zoom out"
              onClick={() =>
                setZoom((z) => Math.max(FIT_ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))
              }
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-9 shrink-0 border-0 px-2.5 text-xs sm:px-3",
                fitMode === "window"
                  ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                  : "bg-muted text-muted-foreground hover:bg-muted/90 dark:bg-muted"
              )}
              onClick={applyFitWindow}
            >
              Fit window
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-9 shrink-0 border-0 px-2.5 text-xs sm:px-3",
                fitMode === "width"
                  ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                  : "bg-muted text-muted-foreground hover:bg-muted/90 dark:bg-muted"
              )}
              onClick={applyFitWidth}
            >
              Width
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-9 shrink-0 border-0 px-2.5 text-xs sm:px-3",
                fitMode === "height"
                  ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                  : "bg-muted text-muted-foreground hover:bg-muted/90 dark:bg-muted"
              )}
              onClick={applyFitHeight}
            >
              Height
            </Button>
            {/* Sirf label — header X se overlap avoid; icon hata user request */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-4 text-xs font-semibold border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-900/50"
              aria-label="Close preview"
              onClick={() => closePanel()}
            >
              Close
            </Button>
          </div>
        </div>
      </>,
      document.body
    );

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex", triggerClassName)}
        onPointerEnter={handleTriggerPointerEnter}
        onPointerLeave={handleTriggerPointerLeave}
        onClick={handleTriggerClick}
      >
        {children}
      </span>
      {portalTree}
    </>
  );
}

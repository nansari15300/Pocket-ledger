"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ZoomIn, ZoomOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Tooltip se zyada: fixed portal + solid bg taaki table/parent overflow ya blend se file transparent na dikhe */
const HOVER_CLOSE_MS = 280;
const PANEL_Z = 400000;
const BACKDROP_Z = PANEL_Z - 1;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

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

type AttachmentHoverPortalProps = {
  /** Hover trigger (icon / thumbnail) */
  children: React.ReactNode;
  /** Preview content — panel ke andar solid background par */
  preview: React.ReactNode;
  disabled?: boolean;
  /** Trigger wrapper class — table icon vs bile FilePreview tile ke liye */
  triggerClassName?: string;
};

export function AttachmentHoverPortal({
  children,
  preview,
  disabled = false,
  triggerClassName,
}: AttachmentHoverPortalProps) {
  const useTapMode = useTapInteractionMode();
  const [open, setOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
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

  const handleOpen = React.useCallback(() => {
    if (disabled) return;
    cancelClose();
    updatePosition();
    setOpen(true);
  }, [disabled, cancelClose, updatePosition]);

  React.useEffect(() => {
    if (!open) {
      setZoom(1);
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

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** PC / mouse: zoom &gt; 1 ke baad primary button drag = pan; touch par sirf native scroll */
  const handleScrollPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (zoom <= 1) return;
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
    if (disabled || useTapMode) return;
    handleOpen();
  };

  const handleTriggerPointerLeave = () => {
    if (disabled || useTapMode) return;
    scheduleClose();
  };

  /** Mobile / touch: ek baar tap = khula rahe; hover enter–leave se band nahi (pehle open + turant close ka bug) */
  const handleTriggerClick = (e: React.MouseEvent) => {
    if (disabled || !useTapMode) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen((prev) => {
      if (prev) return false;
      updatePosition();
      return true;
    });
  };

  const portalTree =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        {useTapMode ? (
          <div
            className="fixed inset-0 bg-black/45"
            style={{ zIndex: BACKDROP_Z }}
            data-attachment-preview-backdrop=""
            onPointerDown={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
            aria-hidden
          />
        ) : null}
        <div
          className={cn(
            "pointer-events-auto fixed flex max-h-[min(88vh,calc(100dvh-16px))] w-[min(820px,calc(100vw-20px))] flex-col overflow-hidden",
            "border-[3px] border-blue-600 bg-white shadow-2xl dark:bg-zinc-950",
            "isolate [opacity:1]"
          )}
          // 15mm dono axis par — PC/mobile same; Tailwind rounded-[15mm] ke saath inline bhi taaki border follow kare
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
          onPointerLeave={useTapMode ? undefined : scheduleClose}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-600/25 px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Preview</span>
            {useTapMode ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Close preview"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className={cn(
              "min-h-0 flex-1 select-none overflow-auto bg-white px-2 pb-2 pt-1 dark:bg-zinc-950",
              zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
            )}
            onPointerDown={handleScrollPointerDown}
            onPointerMove={handleScrollPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onDragStart={(e) => e.preventDefault()}
          >
            {/* zoom &gt; 1 par PC me grab se pan; scale yahi par */}
            <div className="flex w-full items-center justify-center py-1">
              <div
                className="inline-block max-w-full"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.12s ease-out",
                }}
              >
                {preview}
              </div>
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
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))}
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
            <Button type="button" variant="secondary" size="sm" className="h-9 shrink-0 px-3 text-xs" onClick={() => setZoom(1)}>
              Fit
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

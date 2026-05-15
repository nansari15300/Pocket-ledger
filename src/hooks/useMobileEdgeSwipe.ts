"use client";

import { useCallback, useEffect, useRef } from "react";

type Edge = "left" | "right";

/** CSS `mm` → screen px (approx physical 10mm edge zone); `innerWidth` se alag, chhota probe */
export function readCssMmAsPx(mm: number): number {
  if (typeof document === "undefined") return Math.round(mm * (96 / 25.4));
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
  probe.style.width = `${mm}mm`;
  document.documentElement.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  document.documentElement.removeChild(probe);
  return Math.max(20, Math.round(w));
}

export type EdgeSwipeDocumentOptions = {
  /** Kinara zone — user request ~10mm; `resize` par dubara measure */
  edgeWidthMm?: number;
  edgeWidthPx?: number;
  minSwipePx?: number;
  /**
   * Sirf `edge === "left"`: `touchstart` passive:false + `preventDefault` edge strip par —
   * Chrome/Android OS “swipe = history back” ko halka roke; app menu swipe rahe.
   */
  blockOverscrollHistoryOnLeftEdge?: boolean;
};

/**
 * `document` capture — andar `stopPropagation` wale controls ke baad bhi edge swipe mile
 * (jaise `/company` jahan `main` par handler hi nahi).
 * Header / sidebar-trigger: left ~10mm par `preventDefault` se hamburger tap kill na ho — `touchComposedPathIncludesHeaderOrSafeZone`.
 */
function touchComposedPathIncludesHeaderOrSafeZone(e: TouchEvent): boolean {
  const path =
    typeof e.composedPath === "function" ? (e.composedPath() as EventTarget[]) : [];
  for (const n of path) {
    if (!(n instanceof Element)) continue;
    if (n.closest("header")) return true;
    if (n.closest("[data-pl-no-edge-swipe-capture]")) return true;
  }
  return false;
}

export function useEdgeSwipeDocumentCapture(
  enabled: boolean,
  edge: Edge,
  onTrigger: () => void,
  options?: EdgeSwipeDocumentOptions
) {
  const minSwipe = options?.minSwipePx ?? 56;
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const edgeWidthRef = useRef(28);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  const optsRef = useRef(options);
  optsRef.current = options;

  // Edge zone: mm ho to orientation/resize par dubara naap
  useEffect(() => {
    const o = optsRef.current;
    const apply = () => {
      edgeWidthRef.current =
        typeof o?.edgeWidthMm === "number" ? readCssMmAsPx(o.edgeWidthMm) : (o?.edgeWidthPx ?? 28);
    };
    apply();
    if (typeof o?.edgeWidthMm !== "number") return;
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [enabled, options?.edgeWidthMm, options?.edgeWidthPx]);

  useEffect(() => {
    if (!enabled) return;
    const blockLeftChromeBack = edge === "left" && Boolean(optsRef.current?.blockOverscrollHistoryOnLeftEdge);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        startRef.current = null;
        return;
      }
      const t = e.touches[0];
      const vw = window.innerWidth;
      const edgeWidth = edgeWidthRef.current;
      if (edge === "left") {
        if (t.clientX <= edgeWidth) {
          // Sticky header ke andar shuru hone wala touch: menu swipe + `preventDefault` mat — hamburger click chale.
          if (touchComposedPathIncludesHeaderOrSafeZone(e)) {
            startRef.current = null;
            return;
          }
          startRef.current = { x: t.clientX, y: t.clientY };
          // OS/browser edge “back” se pehle default gesture roko — sirf ~edgeWidth strip
          if (blockLeftChromeBack) e.preventDefault();
        } else startRef.current = null;
      } else {
        if (t.clientX >= vw - edgeWidth) startRef.current = { x: t.clientX, y: t.clientY };
        else startRef.current = null;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!startRef.current || e.changedTouches.length !== 1) {
        startRef.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = Math.abs(t.clientY - startRef.current.y);
      startRef.current = null;
      if (dy > Math.abs(dx) * 0.65) return;
      if (edge === "left" && dx >= minSwipe) onTriggerRef.current();
      if (edge === "right" && dx <= -minSwipe) onTriggerRef.current();
    };

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: !blockLeftChromeBack });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
    };
  }, [enabled, edge, minSwipe, options?.blockOverscrollHistoryOnLeftEdge]);
}

/**
 * Mobile: kinara swipe — har gesture alag panel.
 * Baen kinara + swipe RIGHT → app sidebar (layout main).
 * Daen kinara + swipe LEFT → report list / settings list Sheet (page par).
 */
export function useEdgeSwipeTrigger(
  enabled: boolean,
  edge: Edge,
  onTrigger: () => void,
  options?: { edgeWidthPx?: number; minSwipePx?: number }
) {
  const edgeWidth = options?.edgeWidthPx ?? 28;
  const minSwipe = options?.minSwipePx ?? 56;
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) {
        startRef.current = null;
        return;
      }
      const t = e.touches[0];
      const vw = typeof window !== "undefined" ? window.innerWidth : 400;
      if (edge === "left") {
        if (t.clientX <= edgeWidth) startRef.current = { x: t.clientX, y: t.clientY };
        else startRef.current = null;
      } else {
        if (t.clientX >= vw - edgeWidth) startRef.current = { x: t.clientX, y: t.clientY };
        else startRef.current = null;
      }
    },
    [enabled, edge, edgeWidth]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !startRef.current || e.changedTouches.length !== 1) {
        startRef.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = Math.abs(t.clientY - startRef.current.y);
      startRef.current = null;
      if (dy > Math.abs(dx) * 0.65) return;
      if (edge === "left" && dx >= minSwipe) onTrigger();
      if (edge === "right" && dx <= -minSwipe) onTrigger();
    },
    [enabled, edge, minSwipe, onTrigger]
  );

  return { onTouchStart, onTouchEnd };
}

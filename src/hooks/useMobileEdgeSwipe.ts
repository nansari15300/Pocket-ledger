"use client";

import { useCallback, useRef } from "react";

type Edge = "left" | "right";

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

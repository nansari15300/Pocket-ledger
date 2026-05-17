"use client";

import { useCallback, useRef } from "react";

export const ATTACHMENT_HOLD_MS_MOBILE = 1000;
export const ATTACHMENT_HOLD_MS_DESKTOP = 2000;
const DEFAULT_HOLD_MS = ATTACHMENT_HOLD_MS_DESKTOP;
const MOVE_CANCEL_PX_DESKTOP = 14;
/** Touch par thodi finger hilti hai — timer jaldi cancel na ho */
const MOVE_CANCEL_PX_TOUCH = 36;

/**
 * Press-hold; chhota drag se cancel; hold ke baad aane wala synthetic click suppress.
 */
export function useAttachmentHoldPointer(opts: {
  holdMs?: number;
  moveCancelPx?: number;
  disabled?: boolean;
  onHoldComplete?: () => void | Promise<void>;
}) {
  const { holdMs = DEFAULT_HOLD_MS, moveCancelPx, disabled, onHoldComplete } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; pointerType: string } | null>(null);
  const holdFiredRef = useRef(false);
  const suppressClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !onHoldComplete) return;
      if (e.button !== 0) return;
      holdFiredRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY, pointerType: e.pointerType };
      clearTimer();
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        holdFiredRef.current = true;
        try {
          await onHoldComplete();
        } catch (err) {
          console.error("attachment hold action", err);
        }
        suppressClickRef.current = true;
      }, holdMs);
    },
    [disabled, clearTimer, holdMs, onHoldComplete]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || timerRef.current === null) return;
      const isTouch = startRef.current.pointerType === "touch" || e.pointerType === "touch";
      const cancelPx =
        moveCancelPx ?? (isTouch ? MOVE_CANCEL_PX_TOUCH : MOVE_CANCEL_PX_DESKTOP);
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (dx * dx + dy * dy > cancelPx * cancelPx) {
        clearTimer();
        startRef.current = null;
      }
    },
    [clearTimer, moveCancelPx]
  );

  const endPointer = useCallback(() => {
    if (!holdFiredRef.current) clearTimer();
    startRef.current = null;
  }, [clearTimer]);

  /** Touch: `pointerleave` se hold mat todo — child/img par false leave aata hai */
  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch" || startRef.current?.pointerType === "touch") return;
      if (!holdFiredRef.current) clearTimer();
      startRef.current = null;
    },
    [clearTimer]
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onPointerLeave,
    onClickCapture,
  };
}

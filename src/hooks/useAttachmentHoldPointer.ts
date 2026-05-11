"use client";

import { useCallback, useRef } from "react";

const DEFAULT_HOLD_MS = 2000;
const DEFAULT_MOVE_CANCEL_PX = 14;

/**
 * ~2s press-hold; chhota drag se cancel; hold ke baad aane wala synthetic click suppress.
 */
export function useAttachmentHoldPointer(opts: {
  holdMs?: number;
  moveCancelPx?: number;
  disabled?: boolean;
  onHoldComplete: () => void | Promise<void>;
}) {
  const { holdMs = DEFAULT_HOLD_MS, moveCancelPx = DEFAULT_MOVE_CANCEL_PX, disabled, onHoldComplete } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        startRef.current = null;
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
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (dx * dx + dy * dy > moveCancelPx * moveCancelPx) {
        clearTimer();
        startRef.current = null;
      }
    },
    [clearTimer, moveCancelPx]
  );

  const endPointer = useCallback(() => {
    clearTimer();
    startRef.current = null;
  }, [clearTimer]);

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
    onPointerLeave: endPointer,
    onClickCapture,
  };
}

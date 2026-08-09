"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Transition } from "framer-motion";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { isElectronEnvironment } from "@/hooks/use-mobile";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Master-detail entity lists (Party, Bank, Tax, Items, Income…):
 * Settings → Row Animation — same contract as TransactionsTable:
 * - `layout="position"` (reorder = slide, not size morph)
 * - duration + easeInOut from animation settings
 * - no enter/exit “fly in”; exit transition duration 0
 * - no custom transformTemplate (FM12 me Y FLIP tod raha tha → snap)
 */
export function useMasterListRowMotion(options?: { enabled?: boolean }) {
  const motionEnabled = options?.enabled !== false;
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled =
    motionEnabled && animationSettings?.rows?.enabled === true;
  const rowDuration = Number(animationSettings?.rows?.duration ?? 2.5) || 2.5;

  const preferCompositorMotion =
    isCapacitorNativeApp() || isStaticAppBuild() || isElectronEnvironment();

  const [touchScrolling, setTouchScrolling] = useState(false);
  const touchEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markListScrolling = useCallback(() => {
    setTouchScrolling(true);
    if (touchEndTimer.current) clearTimeout(touchEndTimer.current);
    touchEndTimer.current = setTimeout(() => {
      setTouchScrolling(false);
      touchEndTimer.current = null;
    }, 140);
  }, []);

  const layoutActive = isRowAnimationEnabled && !touchScrolling;
  const animatePresenceMode = "popLayout" as const;

  const rowTransition: Transition = useMemo(
    () =>
      !layoutActive
        ? { duration: 0 }
        : {
            // FM11+/12: layout FLIP uses `transition.layout`; also set top-level for compat.
            duration: rowDuration,
            ease: "easeInOut",
            layout: { duration: rowDuration, ease: "easeInOut" },
          },
    [layoutActive, rowDuration]
  );

  const rowMotionProps = useMemo(
    () => ({
      layout: layoutActive ? ("position" as const) : false,
      initial: false as const,
      exit: { transition: { duration: 0 } },
      transition: rowTransition,
      style: layoutActive
        ? ({
            isolation: "isolate",
            ...(preferCompositorMotion ? { willChange: "transform" as const } : null),
          } as const)
        : undefined,
    }),
    [layoutActive, rowTransition, preferCompositorMotion]
  );

  /** Sort/filter FLIP window — PL rematch mid-animation ko hold karne ke liye. */
  const layoutHoldMs = isRowAnimationEnabled
    ? Math.round(rowDuration * 1000) + 80
    : 0;

  return {
    animatePresenceMode,
    rowMotionProps,
    markListScrolling,
    layoutActive,
    preferCompositorMotion,
    isRowAnimationEnabled,
    rowDuration,
    layoutHoldMs,
  };
}

/**
 * PL Server rematch / context churn mid-FLIP pe sort rows mute — online jaisi smooth layout.
 * Order change (sort/filter) turant apply; usi window me balance/array identity noise ignore.
 */
export function useMasterListDisplayRows<T>(
  rows: readonly T[],
  orderKey: string,
  options?: { enabled?: boolean; holdMs?: number }
): { displayRows: T[]; displayOrderKey: string } {
  const enabled = options?.enabled !== false;
  const holdMs = Math.max(0, Number(options?.holdMs ?? 0) || 0);

  const latestRef = useRef({ rows: rows as T[], orderKey });
  latestRef.current = { rows: rows as T[], orderKey };

  const displayOrderKeyRef = useRef(orderKey);
  const holdingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [display, setDisplay] = useState(() => ({
    rows: rows as T[],
    orderKey,
  }));

  useEffect(() => {
    if (!enabled || holdMs <= 0) {
      holdingRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      displayOrderKeyRef.current = orderKey;
      setDisplay({ rows: rows as T[], orderKey });
      return;
    }

    if (orderKey !== displayOrderKeyRef.current) {
      displayOrderKeyRef.current = orderKey;
      holdingRef.current = true;
      setDisplay({ rows: rows as T[], orderKey });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        holdingRef.current = false;
        timerRef.current = null;
        const latest = latestRef.current;
        displayOrderKeyRef.current = latest.orderKey;
        setDisplay({ rows: latest.rows, orderKey: latest.orderKey });
      }, holdMs);
      return;
    }

    if (!holdingRef.current) {
      setDisplay({ rows: rows as T[], orderKey });
    }
  }, [rows, orderKey, enabled, holdMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    displayRows: display.rows,
    displayOrderKey: display.orderKey,
  };
}

/** Stable order fingerprint — pass as `layoutDependency` so FLIP reruns when sort/filter reorder. */
export function masterListOrderKey(ids: readonly (string | number | null | undefined)[]): string {
  return ids.map((id) => (id == null ? "" : String(id))).join("|");
}

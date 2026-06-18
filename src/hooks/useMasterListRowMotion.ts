"use client";

import { useCallback, useRef, useState } from "react";
import type { Transition } from "framer-motion";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { useIsMobile, isElectronEnvironment } from "@/hooks/use-mobile";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Master-detail entity lists (Party, Bank, Tax, Items, Income…):
 * mobile touch scroll par full `layout` + `popLayout` frame drop karta hai —
 * position-only spring + scroll pause se 60fps jaisa smooth move.
 */
export function useMasterListRowMotion(options?: { enabled?: boolean }) {
  const motionEnabled = options?.enabled !== false;
  const { settings: animationSettings } = useAnimationSettings();
  const isMobile = useIsMobile();
  const isRowAnimationEnabled =
    motionEnabled && animationSettings?.rows?.enabled === true;
  const rowDuration = animationSettings?.rows?.duration ?? 2.5;

  const preferCompositorMotion =
    isMobile || isCapacitorNativeApp() || isStaticAppBuild() || isElectronEnvironment();

  const [touchScrolling, setTouchScrolling] = useState(false);
  const touchEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markListScrolling = useCallback(() => {
    if (!preferCompositorMotion) return;
    setTouchScrolling(true);
    if (touchEndTimer.current) clearTimeout(touchEndTimer.current);
    touchEndTimer.current = setTimeout(() => {
      setTouchScrolling(false);
      touchEndTimer.current = null;
    }, 140);
  }, [preferCompositorMotion]);

  const layoutActive = isRowAnimationEnabled && !touchScrolling;
  const animatePresenceMode = preferCompositorMotion
    ? ("sync" as const)
    : ("popLayout" as const);

  const rowTransition: Transition = !layoutActive
    ? { duration: 0 }
    : preferCompositorMotion
      ? {
          type: "spring",
          stiffness: 580,
          damping: 42,
          mass: 0.75,
          restDelta: 0.5,
        }
      : { duration: rowDuration, ease: "easeInOut" };

  const rowMotionProps = {
    layout: layoutActive ? (preferCompositorMotion ? ("position" as const) : true) : false,
    initial: false as const,
    exit: { transition: { duration: 0 } },
    transition: rowTransition,
    style:
      layoutActive && preferCompositorMotion
        ? ({ willChange: "transform" } as const)
        : undefined,
  };

  return {
    animatePresenceMode,
    rowMotionProps,
    markListScrolling,
    layoutActive,
    preferCompositorMotion,
  };
}

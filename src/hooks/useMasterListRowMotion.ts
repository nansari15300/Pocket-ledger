"use client";

import { useCallback, useRef, useState } from "react";
import type { Transition } from "framer-motion";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { isElectronEnvironment } from "@/hooks/use-mobile";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Master-detail entity lists (Party, Bank, Tax, Items, Income…):
 * Settings → Row Animation demo jaisa — `duration` + `easeInOut` + `popLayout` (sab devices).
 * Touch scroll ke dauran layout pause — frame drop kam.
 */
export function useMasterListRowMotion(options?: { enabled?: boolean }) {
  const motionEnabled = options?.enabled !== false;
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled =
    motionEnabled && animationSettings?.rows?.enabled === true;
  const rowDuration = animationSettings?.rows?.duration ?? 2.5;

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

  const rowTransition: Transition = !layoutActive
    ? { duration: 0 }
    : {
        duration: isRowAnimationEnabled ? rowDuration : 0,
        ease: "easeInOut",
      };

  const rowMotionProps = {
    layout: layoutActive ? true : false,
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

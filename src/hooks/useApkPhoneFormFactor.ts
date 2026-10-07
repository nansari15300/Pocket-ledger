"use client";

import { useEffect, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

type FormFactorInfo = { smallestScreenWidthDp: number };
type FormFactorPlugin = { getInfo(): Promise<FormFactorInfo> };

const TABLET_SMALLEST_WIDTH_DP = 600;

function isPhoneWidthFallback(): boolean {
  if (typeof window === "undefined") return false;
  const screenWidth = Math.min(
    window.screen.width || window.innerWidth,
    window.screen.height || window.innerHeight
  );
  return screenWidth < TABLET_SMALLEST_WIDTH_DP;
}

/** Hardware class for APK-only header controls; independent of the PC/Mobile view override. */
export function useApkPhoneFormFactor(): boolean {
  const [isApkPhone, setIsApkPhone] = useState(false);

  useEffect(() => {
    if (!isCapacitorNativeApp()) {
      setIsApkPhone(false);
      return;
    }

    // Set a fast CSS-screen fallback while the Android resource value is being read.
    setIsApkPhone(isPhoneWidthFallback());
    let active = true;
    let infoPromise: Promise<FormFactorInfo>;
    try {
      infoPromise = registerPlugin<FormFactorPlugin>("FormFactor").getInfo();
    } catch {
      return;
    }
    void infoPromise.then(
      ({ smallestScreenWidthDp }) => {
        if (active && Number.isFinite(smallestScreenWidthDp) && smallestScreenWidthDp > 0) {
          setIsApkPhone(smallestScreenWidthDp < TABLET_SMALLEST_WIDTH_DP);
        }
      },
      () => {
        // Keep the screen-width fallback if running on an older APK without this native bridge.
      }
    );

    return () => {
      active = false;
    };
  }, []);

  return isApkPhone;
}

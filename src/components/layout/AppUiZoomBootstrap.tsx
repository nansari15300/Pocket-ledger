"use client";

import { useEffect } from "react";
import {
  bootstrapAppUiZoomFromStorage,
  isAppUiZoomAvailable,
  readStoredAppUiZoom,
  applyAppUiZoom,
} from "@/lib/appUiZoom";

/** Capacitor native: saved zoom restore on cold start; orientation/resize par viewport dubara sync. */
export function AppUiZoomBootstrap() {
  useEffect(() => {
    if (!isAppUiZoomAvailable()) return;
    bootstrapAppUiZoomFromStorage();

    const reapply = () => {
      applyAppUiZoom(readStoredAppUiZoom());
    };
    window.addEventListener("orientationchange", reapply);
    window.visualViewport?.addEventListener("resize", reapply);
    return () => {
      window.removeEventListener("orientationchange", reapply);
      window.visualViewport?.removeEventListener("resize", reapply);
    };
  }, []);
  return null;
}

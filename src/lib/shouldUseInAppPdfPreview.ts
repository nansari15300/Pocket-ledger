"use client";

import { Capacitor } from "@capacitor/core";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * Kab in-app PDF overlay (toolbar + preview) use karna hai — nayi tab / blob URL par navigate nahi.
 * - Static/Capacitor APK: WebView ma bahar PDF khaali
 * - Mobile browser: iframe embed blob PDF aksar fail / seedha system PDF
 * Desktop normal web: purana behaviour = nayi tab (iframe viewer) theek chalcha
 */
export function shouldUseInAppPdfPreviewOverlay(): boolean {
  if (typeof window === "undefined") return false;
  if (isStaticAppBuild()) return true;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* Capacitor bundle ma nahos */
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches) {
    return true;
  }
  return false;
}

/** PDF.js canvas scroll preview — iframe blob jhan reliable nahin (same conditions as overlay). */
export function shouldUsePdfJsCanvasPreview(): boolean {
  return shouldUseInAppPdfPreviewOverlay();
}

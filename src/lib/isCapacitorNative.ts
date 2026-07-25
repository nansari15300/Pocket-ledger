/**
 * Capacitor runtime WebView (APK / iOS shell) — `@capacitor/core` import ke bina check,
 * taaki SSR / desktop bundle me optional dependency na khinche.
 */
export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const C = (window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        /** Purane shells jahan sirf platform string milti ho — APK ledger shield eligibility ke fallback */
        getPlatform?: () => string;
      };
    }).Capacitor;
    if (!C) return false;
    if (typeof C.isNativePlatform === "function" && C.isNativePlatform()) return true;
    if (typeof C.getPlatform === "function") {
      const p = String(C.getPlatform()).toLowerCase();
      return p === "android" || p === "ios";
    }
    return false;
  } catch {
    return false;
  }
}

/** Android WebView / iOS in-app shell jab Capacitor global load na ho (purane APK builds). */
export function isAndroidOrIosEmbeddedWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua) && /; wv\)|\bwv\b|Capacitor|Ionic/i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    try {
      if (isCapacitorNativeApp()) return true;
      if (typeof window !== "undefined") {
        const proto = window.location.protocol;
        if (proto === "capacitor:" || proto === "ionic:") return true;
      }
      if (/AppleWebKit/i.test(ua) && !/Safari/i.test(ua)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** APK / iOS — browser nahi, app ke andar WebView. */
export function isEmbeddedMobileShell(): boolean {
  return isCapacitorNativeApp() || isAndroidOrIosEmbeddedWebView();
}

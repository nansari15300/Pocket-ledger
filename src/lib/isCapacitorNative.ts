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

/**
 * Capacitor runtime WebView (APK / iOS shell) — `@capacitor/core` import ke bina check,
 * taaki SSR / desktop bundle me optional dependency na khinche.
 */
export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const C = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(C?.isNativePlatform?.());
  } catch {
    return false;
  }
}

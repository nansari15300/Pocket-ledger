/**
 * Environment / runtime helpers for Web, EXE (Electron), APK (Capacitor), etc.
 * Use for build-specific behavior when needed (e.g. EXE: open links in same window).
 */

/** True if the app is running inside Electron (e.g. Windows EXE). */
export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent?.toLowerCase() ?? "";
  return ua.includes("electron");
}

/** True if the app is running inside a native WebView (e.g. Capacitor on Android/iOS). */
export function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { Capacitor?: unknown }).Capacitor;
}

/** True if running as a desktop/native app (Electron or Capacitor). */
export function isNativeApp(): boolean {
  return isElectron() || isCapacitor();
}

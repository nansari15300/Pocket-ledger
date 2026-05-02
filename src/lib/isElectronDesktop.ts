import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Packaged Electron `.exe` (userAgent me `Electron`) — Capacitor APK native nahi.
 * Desktop ribbon toggle / OS-specific header behaviour ke liye.
 */
export function isElectronDesktopApp(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isCapacitorNativeApp()) return false;
  return navigator.userAgent.toLowerCase().includes("electron");
}

"use client";

/**
 * APK / static bundle / Electron EXE — account-wide offline preload (data + attachments) inhein chalana hai.
 * Browser-only web build yahan include nahi.
 */

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";

/** `build:static`, Capacitor native, ya packaged Electron shell — `npm run dev` par STATIC_BUILD env se mat chalao. */
export function isEmbeddedOfflinePreloadClient(): boolean {
  if (typeof window === "undefined") {
    return isStaticAppBuild() && process.env.NODE_ENV !== "development";
  }
  if (isCapacitorNativeApp()) return true;
  if (getEmbeddedLockShellKind() === "exe") return true;
  if (window.location.protocol === "file:") return true;
  // Asli static export (out/APK) — dev me `.env.local` STATIC_BUILD=1 par Firestore enable/disable race (c050) avoid.
  if (isStaticAppBuild() && process.env.NODE_ENV !== "development") return true;
  return false;
}

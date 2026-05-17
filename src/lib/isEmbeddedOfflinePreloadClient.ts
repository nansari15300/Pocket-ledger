"use client";

/**
 * APK / static bundle / Electron EXE — account-wide offline preload (data + attachments) inhein chalana hai.
 * Browser-only web build yahan include nahi.
 */

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";

/** `build:static`, Capacitor native, ya packaged Electron shell. */
export function isEmbeddedOfflinePreloadClient(): boolean {
  if (isStaticAppBuild()) return true;
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return true;
  if (getEmbeddedLockShellKind() === "exe") return true;
  if (window.location.protocol === "file:") return true;
  return false;
}

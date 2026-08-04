"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isRealMobilePhone } from "@/hooks/use-mobile";

/** Header backup/Drive upload strip — Web, Mac, Electron EXE; mobile APK/phone hide. */
export function isDesktopPcBackupStripView(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return false;
  return !isRealMobilePhone();
}

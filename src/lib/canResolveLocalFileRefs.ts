"use client";

import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/** EXE/APK/static IndexedDB `local:` bytes resolve kar sakte hain. Hosted web nahi — wahan khaki FILE tile. */
export function canResolveLocalFileRefsOnThisDevice(): boolean {
  if (typeof window === "undefined") return false;
  return isElectronDesktopApp() || isCapacitorNativeApp() || isStaticAppBuild();
}

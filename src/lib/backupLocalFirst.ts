"use client";

import { Capacitor } from "@capacitor/core";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/** Static APK / EXE: SQLite + local attachment cache pehle — Firestore/server sirf jab local khali ho. */
export function backupPrefersLocalSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return isStaticAppBuild() || isElectronDesktopApp() || Capacitor.isNativePlatform();
}

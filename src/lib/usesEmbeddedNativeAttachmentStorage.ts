"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

/**
 * APK (Capacitor DataDirectory + SQLite `attachment_file_refs`) aur EXE (userData files + same SQLite)
 * — web browser IndexedDB blob cache se alag embedded native attachment pipeline.
 */
export function usesEmbeddedNativeAttachmentStorage(): boolean {
  return isCapacitorNativeApp() || isElectronDesktopApp();
}

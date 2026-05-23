"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** Electron preload / UA — Capacitor WebView ko Electron mat samjho. */
function isElectronPackagedShell(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return false;
  try {
    const w = window as unknown as { electron?: unknown; process?: { versions?: { electron?: string } } };
    if (w.electron != null) return true;
    if (w.process?.versions?.electron) return true;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron")) return true;
  return false;
}

/** Saved-account quick switch: sirf Capacitor APK + packaged Electron EXE — browser web par hide. */
export function isEmbeddedLoginAccountSwitchShell(): boolean {
  return typeof window !== "undefined" && (isCapacitorNativeApp() || isElectronPackagedShell());
}

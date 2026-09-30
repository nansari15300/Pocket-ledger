"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

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
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron")) {
    return true;
  }
  return false;
}

function isLoopbackHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/** `npm run dev` — admin panel preview on loopback. */
export function isLocalhostDevPreview(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp() || getEmbeddedLockShellKind() === "exe") return false;
  if (isElectronPackagedShell()) return false;
  return !isStaticAppBuild() && isLoopbackHost();
}

export function isAdminPanelDevPreview(): boolean {
  return isLocalhostDevPreview();
}

/** EXE/APK/static bundles omit `(admin)` routes — never show sidebar link in retail shells. */
function isAdminPanelExcludedFromRetailBuild(isStaticAppBundle: boolean): boolean {
  if (isStaticAppBundle) return true;
  if (isCapacitorNativeApp()) return true;
  const shell = getEmbeddedLockShellKind();
  if (shell === "exe" || shell === "apk") return true;
  return isElectronPackagedShell();
}

/** Sidebar / chrome: Admin Panel link — SuperAdmin email/role only (dev server included; no open preview). */
export function isAdminPanelNavVisible(isSuperAdminUser: boolean, isStaticAppBundle: boolean): boolean {
  if (!isSuperAdminUser) return false;
  if (isAdminPanelExcludedFromRetailBuild(isStaticAppBundle)) return false;
  return true;
}

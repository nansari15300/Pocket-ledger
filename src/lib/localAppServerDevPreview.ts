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
    if ((window as unknown as { plElectronLocalServer?: unknown }).plElectronLocalServer) return true;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron")) {
    return true;
  }
  return false;
}

/** Loopback — `npm run dev` ya packaged EXE static server (`http://127.0.0.1:port`). */
export function isLocalAppServerHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/** `npm run dev` — dev-stable sets NEXT_PUBLIC_PL_DEV_LOCAL_SERVER=1 for reliable client detection. */
export function isLocalhostDevPreview(): boolean {
  if (process.env.NEXT_PUBLIC_PL_DEV_LOCAL_SERVER === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp() || getEmbeddedLockShellKind() === "exe") return false;
  if (isElectronPackagedShell()) return false;
  // Next dev on loopback (not static `out/` served by side server)
  return !isStaticAppBuild() && isLocalAppServerHost();
}

export function isLocalAppServerDevPreview(): boolean {
  return isLocalhostDevPreview();
}

export function isAdminPanelDevPreview(): boolean {
  return isLocalhostDevPreview();
}

export function isAdminPanelNavVisible(isSuperAdminUser: boolean, isStaticAppBundle: boolean): boolean {
  if (isAdminPanelDevPreview()) return true;
  return isSuperAdminUser && !isStaticAppBundle;
}

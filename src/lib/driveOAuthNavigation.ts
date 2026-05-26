"use client";

import { appNavHref, settingsViewHref } from "@/lib/appNavHref";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Drive OAuth callback ke baad user kahan wapas aaye.
 * `explicitHref` — settingsViewHref("local_cloud_sync") jaisa; khali ho to current page.
 */
export function resolveDriveOAuthReturnPath(explicitHref?: string): string {
  const path = explicitHref
    ? appNavHref(explicitHref)
    : typeof window !== "undefined"
      ? appNavHref(window.location.pathname + window.location.search)
      : settingsViewHref("local_cloud_sync");

  if (typeof window === "undefined") return path;

  if (isCapacitorNativeApp()) {
    return `https://localhost${path.startsWith("/") ? path : `/${path}`}`;
  }

  const origin = window.location.origin;
  if (origin && origin !== "null") {
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

/** Google Drive OAuth — APK par Chrome Custom Tab; baaki par same-tab redirect. */
export async function openGoogleDriveOAuthUrl(url: string): Promise<void> {
  const u = String(url || "").trim();
  if (!u) throw new Error("Missing OAuth URL");

  if (isCapacitorNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: u });
      return;
    } catch (e) {
      console.warn("[driveOAuth] Browser.open failed, fallback location", e);
    }
  }
  window.location.href = u;
}

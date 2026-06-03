"use client";

import { appNavHref, settingsViewHref } from "@/lib/appNavHref";
import { getBillingApiBaseOrigin, POCKET_LEDGER_HOSTED_API_ORIGIN } from "@/lib/billingApiOrigin";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isElectronEnvironment } from "@/hooks/use-mobile";
import { isPocketLedgerAppOrigin } from "@/lib/pocketLedgerAppHosts";
import {
  parseCloudOAuthReturnUrl,
  stashCloudOAuthReturn,
} from "@/lib/cloudOAuthReturn";

/** Static EXE / APK / Capacitor — OAuth bridge + popup (same-tab navigate dashboard par fail hota tha). */
export function shouldUseCloudOAuthBridge(): boolean {
  return isCapacitorNativeApp() || isStaticAppBuild() || isElectronEnvironment();
}

function resolveFinalTargetPath(explicitHref?: string): string {
  if (explicitHref) return appNavHref(explicitHref);
  if (typeof window !== "undefined") {
    return appNavHref(window.location.pathname + window.location.search);
  }
  return settingsViewHref("local_cloud_sync");
}

/** App shell jahan user settings dekhta hai (bundled APK = https://localhost). */
function resolveOAuthTargetOrigin(): string {
  if (typeof window === "undefined") return POCKET_LEDGER_HOSTED_API_ORIGIN;
  const origin = window.location.origin.replace(/\/+$/, "");
  if (origin && origin !== "null") return origin;
  return isCapacitorNativeApp() ? "https://localhost" : POCKET_LEDGER_HOSTED_API_ORIGIN;
}

/**
 * OAuth callback redirect — Custom Tab / system browser se reachable.
 * Bundled APK: bridge hamesha pocket-ledger.com; `target` WebView origin par navigate.
 */
function resolveOAuthBridgeOrigin(): string {
  if (typeof window === "undefined") return POCKET_LEDGER_HOSTED_API_ORIGIN;

  if (isCapacitorNativeApp()) {
    return (getBillingApiBaseOrigin() || POCKET_LEDGER_HOSTED_API_ORIGIN).replace(/\/+$/, "");
  }

  const origin = window.location.origin.replace(/\/+$/, "");
  if (origin && origin !== "null") return origin;
  return (getBillingApiBaseOrigin() || POCKET_LEDGER_HOSTED_API_ORIGIN).replace(/\/+$/, "");
}

/**
 * Google Drive OAuth callback ke baad user kahan wapas aaye.
 * `explicitHref` — settingsViewHref("local_cloud_sync") jaisa; khali ho to current page.
 */
export function resolveDriveOAuthReturnPath(explicitHref?: string): string {
  const targetPath = resolveFinalTargetPath(explicitHref);

  if (typeof window === "undefined") return targetPath;

  if (!shouldUseCloudOAuthBridge()) {
    const origin = window.location.origin;
    if (origin && origin !== "null") {
      return `${origin.replace(/\/+$/, "")}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`;
    }
    return targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  }

  const bridgeOrigin = resolveOAuthBridgeOrigin();
  const targetOrigin = resolveOAuthTargetOrigin();
  const targetAbs = targetPath.startsWith("http")
    ? targetPath
    : `${targetOrigin}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`;
  const params = new URLSearchParams();
  params.set("target", targetAbs);
  return `${bridgeOrigin}${appNavHref("/oauth-return")}?${params.toString()}`;
}

function canReadPopupLocation(popup: Window): boolean {
  try {
    const href = popup.location.href;
    if (!href || href === "about:blank") return false;
    const popupOrigin = popup.location.origin.replace(/\/+$/, "");
    const openerOrigin = window.location.origin.replace(/\/+$/, "");
    if (popupOrigin === openerOrigin) return true;
    return isPocketLedgerAppOrigin(popupOrigin);
  } catch {
    return false;
  }
}

function startOAuthPopupPoll(popup: Window): void {
  const poll = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(poll);
      window.dispatchEvent(new Event("cloud-provider-oauth-return"));
      return;
    }
    if (!canReadPopupLocation(popup)) return;
    const parsed = parseCloudOAuthReturnUrl(popup.location.href);
    if (!parsed) return;
    stashCloudOAuthReturn({
      success: parsed.success,
      error: parsed.error,
    });
    try {
      popup.close();
    } catch {
      /* ignore */
    }
    window.clearInterval(poll);
    window.dispatchEvent(new Event("cloud-provider-oauth-return"));
  }, 400);
}

/** Google Drive OAuth — APK: Custom Tab; EXE/static: popup; dev browser: same-tab. */
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

  if (typeof window !== "undefined" && shouldUseCloudOAuthBridge() && !isCapacitorNativeApp()) {
    const popup = window.open(
      u,
      "pl_cloud_oauth",
      "noopener,noreferrer,width=520,height=720,scrollbars=yes"
    );
    if (popup) {
      startOAuthPopupPoll(popup);
      return;
    }
  }

  window.location.href = u;
}

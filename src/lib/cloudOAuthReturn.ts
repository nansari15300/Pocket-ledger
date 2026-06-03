"use client";

import { isPocketLedgerAppOrigin } from "@/lib/pocketLedgerAppHosts";

export const CLOUD_OAUTH_SUCCESS_SESSION_KEY = "pl_cloud_oauth_pending_success";
export const CLOUD_OAUTH_ERROR_SESSION_KEY = "pl_cloud_oauth_pending_error";
/** Popup / Custom Tab — sessionStorage alag window me; localStorage opener + bridge share kare. */
export const CLOUD_OAUTH_SUCCESS_LOCAL_KEY = "pl_cloud_oauth_pending_success";
export const CLOUD_OAUTH_ERROR_LOCAL_KEY = "pl_cloud_oauth_pending_error";

export type CloudOAuthReturnPayload = {
  success?: "drive_connected" | "dropbox_connected";
  error?: string;
};

function isAppShellHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    isPocketLedgerAppOrigin(`https://${h}`)
  );
}

/** Custom Tab / deep link URL se success/error nikaalo. */
export function parseCloudOAuthReturnUrl(rawUrl: string): (CloudOAuthReturnPayload & { path: string }) | null {
  try {
    const u = new URL(String(rawUrl || "").trim());
    if (!isAppShellHostname(u.hostname)) return null;
    const pathNorm = (u.pathname || "/").replace(/\/+$/, "") || "/";
    const isBridge = pathNorm === "/oauth-return";
    const success = u.searchParams.get("success");
    const error = u.searchParams.get("error");
    if (
      success !== "drive_connected" &&
      success !== "dropbox_connected" &&
      !error
    ) {
      return null;
    }
    const target = u.searchParams.get("target")?.trim();
    const path =
      isBridge && target
        ? target
        : `${u.pathname}${u.search}${u.hash}`;
    return {
      path,
      success:
        success === "drive_connected" || success === "dropbox_connected"
          ? success
          : undefined,
      error: error || undefined,
    };
  } catch {
    return null;
  }
}

export function stashCloudOAuthReturn(payload: CloudOAuthReturnPayload): void {
  if (typeof window === "undefined") return;
  try {
    if (payload.success) {
      sessionStorage.setItem(CLOUD_OAUTH_SUCCESS_SESSION_KEY, payload.success);
      sessionStorage.removeItem(CLOUD_OAUTH_ERROR_SESSION_KEY);
      localStorage.setItem(CLOUD_OAUTH_SUCCESS_LOCAL_KEY, payload.success);
      localStorage.removeItem(CLOUD_OAUTH_ERROR_LOCAL_KEY);
    } else if (payload.error) {
      sessionStorage.setItem(CLOUD_OAUTH_ERROR_SESSION_KEY, payload.error);
      sessionStorage.removeItem(CLOUD_OAUTH_SUCCESS_SESSION_KEY);
      localStorage.setItem(CLOUD_OAUTH_ERROR_LOCAL_KEY, payload.error);
      localStorage.removeItem(CLOUD_OAUTH_SUCCESS_LOCAL_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function consumeStashedCloudOAuthReturn(): CloudOAuthReturnPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const success =
      sessionStorage.getItem(CLOUD_OAUTH_SUCCESS_SESSION_KEY) ||
      localStorage.getItem(CLOUD_OAUTH_SUCCESS_LOCAL_KEY);
    const error =
      sessionStorage.getItem(CLOUD_OAUTH_ERROR_SESSION_KEY) ||
      localStorage.getItem(CLOUD_OAUTH_ERROR_LOCAL_KEY);
    sessionStorage.removeItem(CLOUD_OAUTH_SUCCESS_SESSION_KEY);
    sessionStorage.removeItem(CLOUD_OAUTH_ERROR_SESSION_KEY);
    localStorage.removeItem(CLOUD_OAUTH_SUCCESS_LOCAL_KEY);
    localStorage.removeItem(CLOUD_OAUTH_ERROR_LOCAL_KEY);
    if (success === "drive_connected" || success === "dropbox_connected") {
      return { success };
    }
    if (error) return { error };
  } catch {
    /* ignore */
  }
  return null;
}

function navigateToOAuthReturnDest(dest: string): void {
  try {
    const target = new URL(dest, window.location.href);
    const here = window.location.origin.replace(/\/+$/, "");
    if (target.origin.replace(/\/+$/, "") === here) {
      const next = `${target.pathname}${target.search}${target.hash}`;
      window.history.replaceState(null, "", next);
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.href = dest;
}

/** APK/EXE: OAuth return URL WebView par apply + session stash (refresh hook ke liye). */
export function applyCloudOAuthReturnUrl(rawUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const parsed = parseCloudOAuthReturnUrl(rawUrl);
  if (!parsed) return false;

  stashCloudOAuthReturn({
    success: parsed.success,
    error: parsed.error,
  });

  try {
    if (/^https?:\/\//i.test(parsed.path)) {
      navigateToOAuthReturnDest(parsed.path);
    } else {
      window.history.replaceState(null, "", parsed.path);
    }
  } catch {
    try {
      navigateToOAuthReturnDest(parsed.path);
    } catch {
      /* ignore */
    }
  }

  window.dispatchEvent(new Event("cloud-provider-oauth-return"));
  return true;
}

export function isCloudOAuthReturnUrl(rawUrl: string): boolean {
  return parseCloudOAuthReturnUrl(rawUrl) != null;
}

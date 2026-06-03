"use client";

import { getBillingApiBaseOrigin, getBillingApiUrl, POCKET_LEDGER_HOSTED_API_ORIGIN } from "@/lib/billingApiOrigin";
import { isPocketLedgerAppOrigin } from "@/lib/pocketLedgerAppHosts";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch, parseHostedApiResponseJson } from "@/lib/hostedApiFetch";
import { firebaseConfigProjectId } from "@/lib/firebaseProjectId";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { openGoogleDriveOAuthUrl, resolveDriveOAuthReturnPath } from "@/lib/driveOAuthNavigation";

export type DropboxAuthClientState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData?: unknown;
};

function isLoopbackBrowserOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

/** Client estimate — dev loopback uses `NEXT_PUBLIC_APP_URL` (same as server OAuth resolver). */
export function dropboxOAuthRedirectUriForBrowser(): string {
  const envAppUrl = String(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_URL || "" : ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const clientOrigin = window.location.origin.replace(/\/+$/, "");
    if (isLoopbackBrowserOrigin(clientOrigin)) {
      const dev =
        typeof process !== "undefined" && process.env.NODE_ENV === "development";
      const appUrl = dev ? clientOrigin : envAppUrl || clientOrigin;
      return `${appUrl}/api/auth/callback/dropbox`;
    }
    if (isPocketLedgerAppOrigin(clientOrigin)) {
      return `${clientOrigin}/api/auth/callback/dropbox`;
    }
  }

  const fallback = envAppUrl || POCKET_LEDGER_HOSTED_API_ORIGIN;
  return `${fallback}/api/auth/callback/dropbox`;
}

/** Last redirect URI from `getDropboxAuthUrl` — matches what Dropbox OAuth actually uses. */
let lastDropboxOAuthRedirectUri: string | null = null;

export function getLastDropboxOAuthRedirectUri(): string | null {
  return lastDropboxOAuthRedirectUri;
}

export function formatDropboxConnectError(message: string): string {
  const msg = String(message || "").trim();
  if (!/invalid.?redirect|redirect_uri/i.test(msg)) {
    return msg || "Dropbox connect failed";
  }
  const uri = getLastDropboxOAuthRedirectUri() || dropboxOAuthRedirectUriForBrowser();
  return `Dropbox redirect URI not registered. In Dropbox Developer Console → Redirect URIs, add exactly: ${uri}`;
}

function staticDropboxOAuthRedirectOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (!isStaticAppBuild() && !isCapacitorNativeApp()) return undefined;
  return getBillingApiBaseOrigin() || POCKET_LEDGER_HOSTED_API_ORIGIN;
}

export async function getDropboxAuthUrl(
  state: DropboxAuthClientState
): Promise<{ url: string; redirectUri: string }> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl("/api/auth/dropbox/dropbox-auth-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...state,
      clientOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      oauthRedirectUri: dropboxOAuthRedirectUriForBrowser(),
      oauthRedirectOrigin: staticDropboxOAuthRedirectOrigin(),
      firebaseProjectId: firebaseConfigProjectId(),
    }),
  });
  const json = await parseHostedApiResponseJson<{ url?: string; redirectUri?: string; error?: string }>(res);
  if (!res.ok || !json.url) {
    throw new Error(json.error || res.statusText || "Failed to get Dropbox auth URL");
  }
  const redirectUri =
    String(json.redirectUri || "").trim() || dropboxOAuthRedirectUriForBrowser();
  lastDropboxOAuthRedirectUri = redirectUri;
  return { url: json.url, redirectUri };
}

export async function disconnectDropbox(): Promise<void> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl("/api/auth/dropbox/dropbox-disconnect"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || res.statusText || "Dropbox disconnect failed");
  }
}

export { openGoogleDriveOAuthUrl as openDropboxOAuthUrl, resolveDriveOAuthReturnPath as resolveDropboxOAuthReturnPath };

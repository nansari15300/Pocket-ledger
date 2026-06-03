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

const DROPBOX_CALLBACK_PATH = "/api/auth/callback/dropbox";

function hostedDropboxOAuthRedirectUri(): string {
  const hosted =
    (typeof window !== "undefined" ? getBillingApiBaseOrigin() : "") ||
    POCKET_LEDGER_HOSTED_API_ORIGIN;
  return `${hosted.replace(/\/+$/, "")}${DROPBOX_CALLBACK_PATH}`;
}

/** Client redirect URI — loopback dev tab pehle (STATIC_BUILD=1 + localhost par bhi). */
export function dropboxOAuthRedirectUriForBrowser(): string {
  if (typeof window === "undefined") {
    return hostedDropboxOAuthRedirectUri();
  }

  const clientOrigin = window.location.origin.replace(/\/+$/, "");

  // Capacitor WebView — callback hosted site par.
  if (isCapacitorNativeApp()) {
    return hostedDropboxOAuthRedirectUri();
  }

  // Dev loopback — browser jis host se khula (localhost ≠ 127.0.0.1); Dropbox console me wahi exact URI.
  if (isLoopbackBrowserOrigin(clientOrigin)) {
    return `${clientOrigin}${DROPBOX_CALLBACK_PATH}`;
  }

  // Static export / preview (non-loopback) — hosted API + callback.
  if (isStaticAppBuild()) {
    return hostedDropboxOAuthRedirectUri();
  }

  if (isPocketLedgerAppOrigin(clientOrigin)) {
    return `${clientOrigin}${DROPBOX_CALLBACK_PATH}`;
  }

  const envAppUrl = String(process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return `${(envAppUrl || POCKET_LEDGER_HOSTED_API_ORIGIN).replace(/\/+$/, "")}${DROPBOX_CALLBACK_PATH}`;
}

/** Last redirect URI from `getDropboxAuthUrl` — matches what Dropbox OAuth actually uses. */
let lastDropboxOAuthRedirectUri: string | null = null;

export function getLastDropboxOAuthRedirectUri(): string | null {
  return lastDropboxOAuthRedirectUri;
}

/** Dev — Dropbox console me dono loopback URIs add karne ke liye. */
export function dropboxLoopbackRedirectUrisForDev(port = "3000"): string[] {
  const path = DROPBOX_CALLBACK_PATH;
  return [`http://localhost:${port}${path}`, `http://127.0.0.1:${port}${path}`];
}

export function formatDropboxConnectError(message: string): string {
  const msg = String(message || "").trim();
  if (!/invalid.?redirect|redirect_uri/i.test(msg)) {
    return msg || "Dropbox connect failed";
  }
  const uri = getLastDropboxOAuthRedirectUri() || dropboxOAuthRedirectUriForBrowser();
  let hint = "";
  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    hint = " (APK uses the hosted site callback, not localhost.)";
  } else if (typeof window !== "undefined" && isLoopbackBrowserOrigin(window.location.origin)) {
    try {
      const port = new URL(uri).port || "3000";
      const both = dropboxLoopbackRedirectUrisForDev(port).filter((u) => u !== uri);
      hint = both.length ? ` Also add: ${both.join(" and ")} if you switch host.` : "";
    } catch {
      hint = "";
    }
  }
  return `Dropbox redirect URI not registered. In Dropbox Developer Console → Redirect URIs, add exactly: ${uri}${hint}`;
}

function staticDropboxOAuthRedirectOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (!isStaticAppBuild() && !isCapacitorNativeApp()) return undefined;
  if (
    process.env.NODE_ENV === "development" &&
    isLoopbackBrowserOrigin(window.location.origin)
  ) {
    return undefined;
  }
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
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.info("[Dropbox OAuth] redirect_uri (Dropbox console me exact add karo):", redirectUri);
  }
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

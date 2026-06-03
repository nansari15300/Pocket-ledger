"use client";

import { getBillingApiBaseOrigin, getBillingApiUrl, POCKET_LEDGER_HOSTED_API_ORIGIN } from "@/lib/billingApiOrigin";
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

function staticDropboxOAuthRedirectOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (!isStaticAppBuild() && !isCapacitorNativeApp()) return undefined;
  return getBillingApiBaseOrigin() || POCKET_LEDGER_HOSTED_API_ORIGIN;
}

export async function getDropboxAuthUrl(state: DropboxAuthClientState): Promise<{ url: string }> {
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
      oauthRedirectOrigin: staticDropboxOAuthRedirectOrigin(),
      firebaseProjectId: firebaseConfigProjectId(),
    }),
  });
  const json = await parseHostedApiResponseJson<{ url?: string; error?: string }>(res);
  if (!res.ok || !json.url) {
    throw new Error(json.error || res.statusText || "Failed to get Dropbox auth URL");
  }
  return { url: json.url };
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

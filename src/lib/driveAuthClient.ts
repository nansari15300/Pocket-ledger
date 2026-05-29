"use client";

import { getBillingApiBaseOrigin, getBillingApiUrl, POCKET_LEDGER_HOSTED_API_ORIGIN } from "@/lib/billingApiOrigin";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch, parseHostedApiResponseJson } from "@/lib/hostedApiFetch";
import { firebaseConfigProjectId } from "@/lib/firebaseProjectId";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
export { openGoogleDriveOAuthUrl, resolveDriveOAuthReturnPath } from "@/lib/driveOAuthNavigation";

export type DriveAuthClientState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData?: unknown;
};

/** Static/APK: Google OAuth redirect_uri hosted site par — localhost:4173 par callback route nahi hota. */
function staticDriveOAuthRedirectOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (!isStaticAppBuild() && !isCapacitorNativeApp()) return undefined;
  return getBillingApiBaseOrigin() || POCKET_LEDGER_HOSTED_API_ORIGIN;
}

/** Browser — hosted API se OAuth URL (static/APK: pocket-ledger.com; dev: same-origin). */
export async function getGoogleDriveAuthUrl(state: DriveAuthClientState): Promise<{ url: string }> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl("/api/auth/google/drive-auth-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...state,
      // OAuth redirect_uri = hosted origin (static localhost par API nahi); clientOrigin = post-OAuth return bridge.
      clientOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      oauthRedirectOrigin: staticDriveOAuthRedirectOrigin(),
      // Hosted API: Firebase project verify — plans-seed jaisa static bundle se project key.
      firebaseProjectId: firebaseConfigProjectId(),
    }),
  });
  const json = await parseHostedApiResponseJson<{ url?: string; error?: string }>(res);
  if (!res.ok || !json.url) {
    throw new Error(json.error || res.statusText || "Failed to get Drive auth URL");
  }
  return { url: json.url };
}

/** Drive unlink — hosted API (static/APK) ya same-origin dev; client Firestore delete mat karo. */
export async function disconnectGoogleDrive(): Promise<void> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl("/api/auth/google/drive-disconnect"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || res.statusText || "Failed to disconnect Google Drive");
  }
}

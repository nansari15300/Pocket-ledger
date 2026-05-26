"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch } from "@/lib/hostedApiFetch";
export { openGoogleDriveOAuthUrl, resolveDriveOAuthReturnPath } from "@/lib/driveOAuthNavigation";

export type DriveAuthClientState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData?: unknown;
};

/** Browser — hosted API se OAuth URL (static/APK: pocket-ledger.com; dev: same-origin). */
export async function getGoogleDriveAuthUrl(state: DriveAuthClientState): Promise<{ url: string }> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl("/api/auth/google/drive-auth-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(state),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
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

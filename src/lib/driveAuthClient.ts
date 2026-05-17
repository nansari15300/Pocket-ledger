"use client";

import { auth } from "@/lib/firebase";

export type DriveAuthClientState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData?: unknown;
};

/** Browser — `/api/auth/google/drive-auth-url` (no `googleapis` import). */
export async function getGoogleDriveAuthUrl(state: DriveAuthClientState): Promise<{ url: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required to connect Google Drive");
  const token = await user.getIdToken();
  const res = await fetch("/api/auth/google/drive-auth-url", {
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

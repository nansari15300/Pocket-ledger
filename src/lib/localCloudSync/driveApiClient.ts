"use client";

import { resolveDriveHostedApiUrl } from "@/lib/driveHostedApiOrigin";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch } from "@/lib/hostedApiFetch";

/** Shared Drive API POST — client modules se duplicate fetch na ho. */
export async function postDriveJsonViaClient<T>(path: string, body: unknown): Promise<T> {
  const { token } = await getFirebaseIdTokenForApi();
  const apiUrl = resolveDriveHostedApiUrl(path);
  const res = await hostedApiFetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(String((json as { error?: string }).error || res.statusText || `Request failed (${apiUrl})`));
  }
  return json;
}

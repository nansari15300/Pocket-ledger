import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch, parseHostedApiResponseJson } from "@/lib/hostedApiFetch";

/** Shared Drive API POST — client modules se duplicate fetch na ho. */
export async function postDriveJsonViaClient<T>(path: string, body: unknown): Promise<T> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await parseHostedApiResponseJson<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(String((json as { error?: string }).error || res.statusText || "Request failed"));
  }
  return json;
}

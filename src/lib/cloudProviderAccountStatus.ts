"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch, parseHostedApiResponseJson } from "@/lib/hostedApiFetch";

export type CloudProviderAccountStatus = {
  googleDrive: boolean;
};

export async function fetchCloudProviderAccountStatus(): Promise<CloudProviderAccountStatus> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl("/api/auth/cloud-account-status"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseHostedApiResponseJson<CloudProviderAccountStatus & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || res.statusText || "Failed to load cloud account status");
  }
  return {
    googleDrive: json.googleDrive === true,
  };
}

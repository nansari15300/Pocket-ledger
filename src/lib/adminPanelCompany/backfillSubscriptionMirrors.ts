"use client";

import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";

/** Pull paid subscription payments into Admin Panel Company parties + sale vouchers. */
export async function backfillAdminPanelSubscriptionMirrors(limit = 500): Promise<void> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(adminPanelCompanyApiUrl("/api/admin/company/mirror-subscriptions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ limit }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not sync subscription transactions");
}

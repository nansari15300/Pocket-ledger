"use client";

import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";
import { ADMIN_PANEL_COMPANIES_COLLECTION, CLOUD_ADMIN_PANEL_TENANT_ID } from "@/lib/adminPanelCompany/constants";

export type AdminPanelCompanyProfilePatch = {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  pan?: string;
};

export function adminPanelCompanyStorageLabel(): string {
  return `Cloud Firestore · ${ADMIN_PANEL_COMPANIES_COLLECTION}/${CLOUD_ADMIN_PANEL_TENANT_ID}`;
}

export async function patchAdminPanelCompanyProfile(patch: AdminPanelCompanyProfilePatch): Promise<void> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(adminPanelCompanyApiUrl("/api/admin/company"), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not save Admin Panel Company");
}

"use client";

import type { AdminPanelEntityKind } from "@/lib/adminPanelCompany/constants";
import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";

export type AdminPanelEntityRow = Record<string, unknown> & {
  id: string;
  createdAtMs?: number | null;
};

export async function listAdminPanelEntities(
  kind: AdminPanelEntityKind
): Promise<AdminPanelEntityRow[]> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(
    adminPanelCompanyApiUrl(`/api/admin/company/entities?kind=${encodeURIComponent(kind)}`),
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const raw = await res.text();
  let data: { rows?: AdminPanelEntityRow[]; error?: string };
  try {
    data = JSON.parse(raw) as { rows?: AdminPanelEntityRow[]; error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "Admin Panel Company API returned non-JSON (check /app basePath)."
        : `Admin Panel Company API failed (${res.status}).`
    );
  }
  if (!res.ok) throw new Error(data.error || "Could not load records");
  return data.rows ?? [];
}

export async function createAdminPanelEntity(
  kind: AdminPanelEntityKind,
  body: Record<string, unknown>
): Promise<{ id: string }> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(
    adminPanelCompanyApiUrl(`/api/admin/company/entities?kind=${encodeURIComponent(kind)}`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const raw = await res.text();
  let data: { id?: string; error?: string };
  try {
    data = JSON.parse(raw) as { id?: string; error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "Admin Panel Company API returned non-JSON (check /app basePath)."
        : `Admin Panel Company API failed (${res.status}).`
    );
  }
  if (!res.ok) throw new Error(data.error || "Could not save record");
  if (!data.id) throw new Error("Save succeeded without id");
  return { id: data.id };
}

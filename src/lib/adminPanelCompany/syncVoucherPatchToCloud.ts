"use client";

import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";

const ADMIN_PANEL_VOUCHER_PATCH_TIMEOUT_MS = 25_000;

/** Push bill-wise allocation patches to Firestore admin panel company (SQLite is local-first). */
export async function syncAdminPanelCompanyVoucherFieldsToCloud(
  voucherId: string,
  partial: Record<string, unknown>
): Promise<void> {
  const id = String(voucherId || "").trim();
  if (!id || !partial || typeof partial !== "object") return;
  const token = await getAdminPanelCompanyIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ADMIN_PANEL_VOUCHER_PATCH_TIMEOUT_MS);
  try {
    const res = await fetch(adminPanelCompanyApiUrl(`/api/admin/company/vouchers/${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(partial),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Admin panel voucher patch failed (${res.status})`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

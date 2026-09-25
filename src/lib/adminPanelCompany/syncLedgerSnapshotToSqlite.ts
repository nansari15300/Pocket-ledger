"use client";

import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";
import {
  ADMIN_PANEL_COMPANY_LOCAL_ID,
  ADMIN_PANEL_SEED_GATEWAY_BANK_ID,
} from "@/lib/adminPanelCompany/constants";
import {
  deleteCompanyDocFromBrowserDb,
  notifyBrowserDbCollectionUpdated,
  upsertCompanyDocInBrowserDb,
} from "@/lib/localCompanyDocMirror";

type SnapshotResponse = {
  collections: Record<string, Array<Record<string, unknown>>>;
  error?: string;
};

export async function syncAdminPanelLedgerSnapshotToSqlite(): Promise<void> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(adminPanelCompanyApiUrl("/api/admin/company/ledger-snapshot"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as SnapshotResponse;
  if (!res.ok) throw new Error(data.error || "Ledger snapshot failed");

  const companyId = ADMIN_PANEL_COMPANY_LOCAL_ID;
  const collections = data.collections ?? {};

  await deleteCompanyDocFromBrowserDb(companyId, "bank_accounts", ADMIN_PANEL_SEED_GATEWAY_BANK_ID, {
    force: true,
    notify: false,
  }).catch(() => {});

  for (const [collectionName, rows] of Object.entries(collections)) {
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      await upsertCompanyDocInBrowserDb(companyId, collectionName, id, row, { notify: false });
    }
    notifyBrowserDbCollectionUpdated(companyId, collectionName, {
      immediate: true,
      source: "admin_panel_ledger_snapshot",
    });
  }
}

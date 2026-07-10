"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { listPlServerDisplayCacheDocs } from "@/lib/plServerDisplayCache";

/** Server-gate company: ledger khali ho to connect/open par server se cache load chahiye. */
export async function plServerCompanyLedgerNeedsFullPull(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    if (isPlServerThinStaffClient()) {
      const vouchers = listPlServerDisplayCacheDocs(id, "vouchers", { includeSoftDeleted: true });
      if (vouchers.length === 0) return true;
      const parties = listPlServerDisplayCacheDocs(id, "parties", { includeSoftDeleted: true });
      return parties.length === 0;
    }
    const [parties, vouchers] = await Promise.all([
      listCompanyDocsFromBrowserDb(id, "parties", { forBackupMerge: true }),
      listCompanyDocsFromBrowserDb(id, "vouchers", { forBackupMerge: true }),
    ]);
    if (vouchers.length === 0) return true;
    return parties.length === 0;
  } catch {
    return true;
  }
}

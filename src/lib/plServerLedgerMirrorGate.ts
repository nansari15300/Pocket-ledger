"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";

/** Server-gate company: SQLite me vouchers khali hon to dubara full P2P pull chahiye (sirf parties hone se mat ruko). */
export async function plServerCompanyLedgerNeedsFullPull(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
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

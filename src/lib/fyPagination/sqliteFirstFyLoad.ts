"use client";

import type { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import { notifyBrowserDbCollectionUpdated } from "@/lib/localCompanyDocMirror";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import { hydrateOnlineVoucherRangeFromFirestore } from "@/lib/ledgerModes/online/fyMonthHydrate";
import { listVouchersFromBrowserDbByDateRange } from "@/lib/fyPagination/voucherQueries";
import { recordFyLoadedRange } from "@/lib/fyPagination/snapshotStore";
import type { FyActiveScope, FyDateRangeMs } from "@/lib/fyPagination/types";

export type FyScopeCompany = CompanyStorageRow & { country?: string };

/** Paint active FY scope from cached SQLite immediately — no network wait. */
export async function applyFyScopeFromSqlite(params: {
  companyId: string;
  fy: ReturnType<typeof useFyVoucherScope>;
  scope: FyActiveScope;
}): Promise<any[]> {
  const { companyId, fy, scope } = params;
  const rows = await listVouchersFromBrowserDbByDateRange(companyId, scope.range);
  await recordFyLoadedRange(companyId, scope.range.fromMs, scope.range.toMs, scope.periodKey ?? null);
  fy.setActiveScope(scope);
  if (rows.length) {
    fy.mergeHydratedVouchers(rows);
    fy.registerInMemoryVoucherIds(rows.map((v) => String(v.id || "")));
  }
  return rows;
}

async function mergeSqliteRangeIntoFyScope(params: {
  companyId: string;
  range: FyDateRangeMs;
  fy: ReturnType<typeof useFyVoucherScope>;
}): Promise<void> {
  const { companyId, range, fy } = params;
  const rows = await listVouchersFromBrowserDbByDateRange(companyId, range);
  if (!rows.length) return;
  fy.mergeHydratedVouchers(rows);
  fy.registerInMemoryVoucherIds(rows.map((v) => String(v.id || "")));
}

/**
 * Online: Firestore range → SQLite mirror, then silent FY merge + voucher list bump.
 * Refresh / filter change: UI already shows SQLite; this updates when server read completes.
 */
export function scheduleBackgroundOnlineFyRangeHydrate(params: {
  company: FyScopeCompany | null | undefined;
  companyId: string;
  range: FyDateRangeMs;
  fy: ReturnType<typeof useFyVoucherScope>;
}): void {
  const { company, companyId, range, fy } = params;
  if (!companyId || !isCloudLinkedCompanyStorage(company)) return;
  const fsCompanyId = String(company?.authoritativeCompanyId || companyId).trim();
  if (!fsCompanyId) return;

  void (async () => {
    try {
      await hydrateOnlineVoucherRangeFromFirestore({ companyId, fsCompanyId, range });
      await mergeSqliteRangeIntoFyScope({ companyId, range, fy });
      notifyBrowserDbCollectionUpdated(companyId, "vouchers", {
        immediate: true,
        source: "fy_range_hydrate",
      });
    } catch (err) {
      console.warn("[sqliteFirstFyLoad] background online hydrate", err);
    }
  })();
}

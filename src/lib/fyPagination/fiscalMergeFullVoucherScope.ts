"use client";

import { endOfDay } from "date-fns";
import { bsToAd, BS_CALENDAR_MIN_YEAR } from "@/lib/bs-date";
import { atNoonAd } from "@/lib/bsDateRangePresets";
import { getFiscalMergePartitionsFromCompany } from "@/lib/fiscalPartitionRows";
import { runningFyKey } from "@/lib/fyPagination/periodBounds";
import type { FyActiveScope } from "@/lib/fyPagination/types";

type FiscalCompanyLike = {
  fiscalSplitMode?: string;
  fiscalMergePartitionAtIsos?: string[] | null;
  fiscalMergePartitionAt?: unknown;
  country?: string;
};

/** FY merge divider enabled on this company (local or cloud-merged fields). */
export function companyUsesFiscalMergeDividers(
  company: FiscalCompanyLike | null | undefined
): boolean {
  if (!company || company.fiscalSplitMode !== "merge") return false;
  return getFiscalMergePartitionsFromCompany(company).length > 0;
}

/**
 * Fiscal merge ledgers: load full voucher mirror (all FYs) so running balance / snapshots
 * do not depend on partial month scope + FY floor clipping.
 */
/** Full SQLite voucher mirror — local opening math; skip server snapshot wait. */
export function hasFullLocalLedgerVoucherMirror(
  company: FiscalCompanyLike | null | undefined,
  activeScope: FyActiveScope | null | undefined
): boolean {
  if (activeScope?.policy === "full") return true;
  return companyUsesFiscalMergeDividers(company);
}

export function buildFiscalMergeFullVoucherScope(
  country?: string,
  today = new Date()
): FyActiveScope {
  const fromMs = atNoonAd(bsToAd({ y: BS_CALENDAR_MIN_YEAR, m: 1, d: 1 })).getTime();
  const toMs = endOfDay(today).getTime();
  const fyKey = runningFyKey(country, today);
  return {
    policy: "full",
    periodKind: "fy",
    periodKey: fyKey,
    range: { fromMs, toMs },
    openingSnapshotId: null,
    fyFloorMs: null,
  };
}

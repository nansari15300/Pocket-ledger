"use client";

import {
  listFiscalYearMergeRowsFromFyKeySet,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import {
  ensureFyVoucherIndex,
  type FyVoucherIndexLoadSource,
} from "@/lib/fiscalSplit/fyVoucherIndex";

export type FiscalSplitFyLoadSource = FyVoucherIndexLoadSource;

export type FiscalSplitFyLoadResult = {
  rows: FiscalYearMergeRow[];
  source: FiscalSplitFyLoadSource;
  vouchersScanned: number;
};

/**
 * Fiscal year & split settings — cached FY index (1 Firestore doc online).
 * Full voucher scan only on first visit / empty cache.
 */
export async function loadFiscalSplitFyRows(params: {
  companyId: string;
  company: CompanyStorageRow & { country?: string; authoritativeCompanyId?: string };
  onFirestoreProgress?: (scanned: number) => void;
}): Promise<FiscalSplitFyLoadResult> {
  const { companyId, company, onFirestoreProgress } = params;
  const country = company.country;
  const companyDates = resolveCompanyFiscalYearDates(
    company as { fiscalYearStart?: unknown; fiscalYearEnd?: unknown }
  );

  const { index, source, vouchersScanned } = await ensureFyVoucherIndex({
    companyId,
    company,
    onFirestoreScanProgress: onFirestoreProgress,
  });

  const keySet = new Set(index.fyKeys);
  const rows = listFiscalYearMergeRowsFromFyKeySet(keySet, country, keySet, companyDates);

  return {
    rows,
    source,
    vouchersScanned,
  };
}

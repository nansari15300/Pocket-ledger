"use client";

import {
  listFiscalYearMergeRowsFromFyKeySet,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import {
  dateSpanFromFyVoucherIndex,
  ensureFyVoucherIndex,
  type FyVoucherIndexLoadSource,
} from "@/lib/fiscalSplit/fyVoucherIndex";

export type FiscalSplitFyLoadSource = FyVoucherIndexLoadSource;

export type FiscalSplitFyLoadResult = {
  rows: FiscalYearMergeRow[];
  source: FiscalSplitFyLoadSource;
  vouchersScanned: number;
  /** Actual first / last voucher dates from FY index (not FY calendar bounds). */
  voucherDateFrom: Date | null;
  voucherDateTo: Date | null;
};

/**
 * Fiscal year & split settings — cached FY index (1 Firestore doc online).
 * Full voucher scan only on first visit / empty cache.
 */
export async function loadFiscalSplitFyRows(params: {
  companyId: string;
  company: CompanyStorageRow & { country?: string; authoritativeCompanyId?: string };
  onFirestoreProgress?: (scanned: number) => void;
  onSqliteProgress?: (scanned: number, total: number) => void;
}): Promise<FiscalSplitFyLoadResult> {
  const { companyId, company, onFirestoreProgress, onSqliteProgress } = params;
  const country = company.country;
  const companyDates = resolveCompanyFiscalYearDates(
    company as { fiscalYearStart?: unknown; fiscalYearEnd?: unknown }
  );

  const { index, source, vouchersScanned } = await ensureFyVoucherIndex({
    companyId,
    company,
    onFirestoreScanProgress: onFirestoreProgress,
    onSqliteScanProgress: onSqliteProgress,
  });

  const keySet = new Set(index.fyKeys);
  const rows = listFiscalYearMergeRowsFromFyKeySet(keySet, country, keySet, companyDates);
  const span = dateSpanFromFyVoucherIndex(index);

  return {
    rows,
    source,
    vouchersScanned,
    voucherDateFrom: span.from,
    voucherDateTo: span.to,
  };
}

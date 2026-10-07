"use client";

import {
  listFiscalYearMergeRowsFromFyKeySet,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
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

function makeFiscalSplitFyLoadResult(
  index: Awaited<ReturnType<typeof ensureFyVoucherIndex>>["index"],
  source: FiscalSplitFyLoadSource,
  vouchersScanned: number,
  country?: string,
  companyDates?: ReturnType<typeof resolveCompanyFiscalYearDates>
): FiscalSplitFyLoadResult {
  const span = dateSpanFromFyVoucherIndex(index);
  let fyKeys = index.fyKeys;
  if (span.from && span.to) {
    const firstVoucherFy = getAnusuchi13FyKey(country, span.from, companyDates);
    const lastVoucherFy = getAnusuchi13FyKey(country, span.to, companyDates);
    const firstYear = Number(firstVoucherFy.split("-")[0]);
    const lastYear = Number(lastVoucherFy.split("-")[0]);
    if (Number.isFinite(firstYear) && Number.isFinite(lastYear) && lastYear >= firstYear) {
      fyKeys = index.fyKeys.filter((fyKey) => {
        const year = Number(fyKey.split("-")[0]);
        return Number.isFinite(year) && year >= firstYear && year <= lastYear;
      });
      if (fyKeys.length !== index.fyKeys.length) {
        console.warn("[FY-SCAN] hid FY keys outside voucher date range", {
          source,
          firstVoucherFy,
          lastVoucherFy,
          cachedKeys: index.fyKeys.slice(0, 32),
          visibleKeys: fyKeys.slice(0, 32),
          hiddenKeys: index.fyKeys.filter((fyKey) => !fyKeys.includes(fyKey)).slice(0, 32),
        });
      }
    }
  }
  const keySet = new Set(fyKeys);
  // Fiscal split lists only fiscal years backed by vouchers. Avoid inserting
  // calendar gap rows: those dates do not represent voucher data for this company.
  const rows = listFiscalYearMergeRowsFromFyKeySet(keySet, country, keySet, companyDates, false);
  return {
    rows,
    source,
    vouchersScanned,
    voucherDateFrom: span.from,
    voucherDateTo: span.to,
  };
}

/**
 * Fiscal year & split settings — cached FY index (1 Firestore doc online).
 * Full voucher scan only on first visit / empty cache.
 */
export async function loadFiscalSplitFyRows(params: {
  companyId: string;
  company: CompanyStorageRow & { country?: string; authoritativeCompanyId?: string };
  onFirestoreProgress?: (scanned: number) => void;
  onSqliteProgress?: (scanned: number, total: number) => void;
  onLateUpdate?: (result: FiscalSplitFyLoadResult) => void;
}): Promise<FiscalSplitFyLoadResult> {
  const { companyId, company, onFirestoreProgress, onSqliteProgress, onLateUpdate } = params;
  const country = company.country;
  const companyDates = resolveCompanyFiscalYearDates(
    company as { fiscalYearStart?: unknown; fiscalYearEnd?: unknown }
  );

  const { index, source, vouchersScanned } = await ensureFyVoucherIndex({
    companyId,
    company,
    onFirestoreScanProgress: onFirestoreProgress,
    onSqliteScanProgress: onSqliteProgress,
    onIndexUpdate: (index, source) => {
      onLateUpdate?.(makeFiscalSplitFyLoadResult(index, source, 0, country, companyDates));
    },
  });
  return makeFiscalSplitFyLoadResult(index, source, vouchersScanned, country, companyDates);
}

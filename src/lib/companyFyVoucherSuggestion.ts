import {
  buildFiscalMergePeriods,
  inferTickedFyKeysFromPartitions,
  isAllFySplitComplete,
  listFiscalYearMergeRowsFromVouchers,
  normalizeTickedFyKeys,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";
import { readLocalFiscalSplit } from "@/lib/localFiscalSplitStore";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { resolveGstrVoucherDateSpan } from "@/lib/reports/gstrVoucherAmounts";

export type CompanyFyVoucherSuggestion = {
  fyCount: number;
  fyKeys: string[];
  countryFyLabel: string;
  voucherDateFrom: Date;
  voucherDateTo: Date;
  /** Merge split: har FY alag period — amber card shows splitted message. */
  allFySplitted?: boolean;
};

function isValidDate(d: unknown): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/** Company / Firestore fiscal year field → AD Date. */
export function parseCompanyFiscalYearDate(dateValue: unknown): Date | undefined {
  if (!dateValue) return undefined;
  if (dateValue instanceof Date) return isValidDate(dateValue) ? dateValue : undefined;
  if (typeof dateValue === "object" && dateValue !== null && "toDate" in dateValue) {
    try {
      const d = (dateValue as { toDate: () => Date }).toDate();
      return isValidDate(d) ? d : undefined;
    } catch {
      return undefined;
    }
  }
  const parsed = new Date(dateValue as string | number);
  return isValidDate(parsed) ? parsed : undefined;
}

export function isCompanyFiscalYearUnset(
  fiscalYearStart?: Date,
  fiscalYearEnd?: Date
): boolean {
  return !isValidDate(fiscalYearStart) && !isValidDate(fiscalYearEnd);
}

/** Both company Profile fiscal dates set — used for FY split / partition boundaries. */
export function resolveCompanyFiscalYearDates(company?: {
  fiscalYearStart?: unknown;
  fiscalYearEnd?: unknown;
} | null): { fiscalYearStart: Date; fiscalYearEnd: Date } | undefined {
  const fiscalYearStart = parseCompanyFiscalYearDate(company?.fiscalYearStart);
  const fiscalYearEnd = parseCompanyFiscalYearDate(company?.fiscalYearEnd);
  if (!isValidDate(fiscalYearStart) || !isValidDate(fiscalYearEnd)) return undefined;
  return { fiscalYearStart, fiscalYearEnd };
}

/** Human-readable FY convention for the selected country. */
export function getFiscalYearConventionLabel(country?: string): string {
  const normalized = (country || "").trim().toLowerCase();
  if (normalized === "nepal") return "Shrawan 1 – Asar end";
  if (normalized === "india") return "April – March";
  if (
    normalized === "bangladesh" ||
    normalized === "pakistan" ||
    normalized === "australia" ||
    normalized === "new zealand"
  ) {
    return "July – June";
  }
  return "January – December";
}

function voucherJsDate(date: unknown): Date | null {
  if (!date) return null;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  if (typeof date === "object" && date !== null && "toDate" in date) {
    try {
      const d = (date as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof date === "string" || typeof date === "number") {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Saved merge split → merged period count (null when merge off / not configured). */
export function resolveSavedFiscalMergePeriodCount(
  companyId: string | null | undefined,
  vouchers: Array<{ date?: unknown }>,
  country?: string,
  companyDates?: { fiscalYearStart: Date; fiscalYearEnd: Date } | null
): number | null {
  const local = readLocalFiscalSplit(companyId);
  if (local?.fiscalSplitMode !== "merge") return null;

  const fyRows = listFiscalYearMergeRowsFromVouchers(vouchers, country, companyDates);
  if (!fyRows.length) return null;

  const ticked = local.fiscalMergeTickedFyKeys?.length
    ? normalizeTickedFyKeys(fyRows, new Set(local.fiscalMergeTickedFyKeys))
    : inferTickedFyKeysFromPartitions(
        fyRows,
        local.fiscalMergePartitionAtIsos ??
          (local.fiscalMergePartitionAtIso ? [local.fiscalMergePartitionAtIso] : null)
      );

  return buildFiscalMergePeriods(fyRows, ticked).length;
}

/** Saved/local merge split — har FY row alag period? */
export function resolveAllFySplitComplete(
  companyId: string | null | undefined,
  vouchers: Array<{ date?: unknown }>,
  country?: string,
  companyDates?: { fiscalYearStart: Date; fiscalYearEnd: Date } | null
): boolean {
  const local = readLocalFiscalSplit(companyId);
  if (local?.fiscalSplitMode !== "merge") return false;

  const fyRows = listFiscalYearMergeRowsFromVouchers(vouchers, country, companyDates);
  if (!fyRows.length) return false;

  const ticked = local.fiscalMergeTickedFyKeys?.length
    ? normalizeTickedFyKeys(fyRows, new Set(local.fiscalMergeTickedFyKeys))
    : inferTickedFyKeysFromPartitions(
        fyRows,
        local.fiscalMergePartitionAtIsos ??
          (local.fiscalMergePartitionAtIso ? [local.fiscalMergePartitionAtIso] : null)
      );

  return isAllFySplitComplete(fyRows, ticked);
}

function resolveFySuggestionCount(rawFyCount: number, mergedPeriodCount?: number | null): number | null {
  if (mergedPeriodCount != null) {
    if (mergedPeriodCount < 2) return null;
    return mergedPeriodCount;
  }
  if (rawFyCount < 2) return null;
  return rawFyCount;
}

/**
 * When company FY is unset but vouchers span multiple fiscal years (by country),
 * return counts + first/last voucher dates for the edit-form suggestion panel.
 *
 * When merge split is active, `mergedPeriodCount` reflects remaining merged blocks
 * (e.g. 5 voucher FY rows → 2 merged periods → shows 2).
 */
export function buildCompanyFyVoucherSuggestion(params: {
  country?: string;
  fiscalYearStart?: Date;
  fiscalYearEnd?: Date;
  vouchers?: Array<{ date?: unknown }>;
  /** Fiscal split page: full FY list (SQLite / Firestore scan) — scoped vouchers ki zaroorat nahi. */
  fyRows?: FiscalYearMergeRow[];
  mergedPeriodCount?: number | null;
  allFySplitted?: boolean;
}): CompanyFyVoucherSuggestion | null {
  const { country, fiscalYearStart, fiscalYearEnd, vouchers, fyRows, mergedPeriodCount, allFySplitted } =
    params;
  if (!isCompanyFiscalYearUnset(fiscalYearStart, fiscalYearEnd)) return null;

  let sortedKeys: string[] = [];
  let voucherDateFrom: Date | null = null;
  let voucherDateTo: Date | null = null;

  if (fyRows?.length) {
    const txnRows = fyRows.filter((row) => row.hasTransactions);
    if (!txnRows.length) return null;
    sortedKeys = txnRows.map((row) => row.fyKey);
    voucherDateFrom = txnRows[0].start;
    voucherDateTo = txnRows[txnRows.length - 1].end;
  } else if (vouchers?.length) {
    const span = resolveGstrVoucherDateSpan(vouchers);
    if (!span?.from) return null;
    const fyKeys = new Set<string>();
    for (const v of vouchers) {
      const d = voucherJsDate(v.date);
      if (d) fyKeys.add(getAnusuchi13FyKey(country, d));
    }
    sortedKeys = [...fyKeys].sort((a, b) => {
      const aStart = Number(a.split("-")[0]) || 0;
      const bStart = Number(b.split("-")[0]) || 0;
      return aStart - bStart;
    });
    voucherDateFrom = span.from;
    voucherDateTo = span.to ?? span.from;
  } else {
    return null;
  }

  const fyCount = resolveFySuggestionCount(sortedKeys.length, mergedPeriodCount);
  if (fyCount == null || !voucherDateFrom) return null;

  return {
    fyCount,
    fyKeys: sortedKeys,
    countryFyLabel: getFiscalYearConventionLabel(country),
    voucherDateFrom,
    voucherDateTo: voucherDateTo ?? voucherDateFrom,
    allFySplitted: allFySplitted === true,
  };
}

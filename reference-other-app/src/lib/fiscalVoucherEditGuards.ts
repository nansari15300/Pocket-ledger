import { startOfDay } from "date-fns";
import type { Permission } from "@/lib/permissions";
import { getFiscalMergePartitionDateFromCompany } from "@/lib/fiscalPartitionRows";

/** Minimal company fields for fiscal preflight (avoid importing full Company type). */
export type CompanyFiscalPreflight = {
  fiscalSplitMode?: string;
  fiscalYearStart?: { toDate?: () => Date } | Date | null;
  fiscalMergePartitionAt?: { toDate?: () => Date };
};

function fiscalYearStartDay(company: CompanyFiscalPreflight | null | undefined): Date | null {
  if (!company?.fiscalYearStart) return null;
  const v = company.fiscalYearStart as { toDate?: () => Date } | Date;
  const d =
    v && typeof (v as { toDate?: () => Date }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate()
      : v instanceof Date
        ? v
        : new Date(v as string);
  return d instanceof Date && !isNaN(d.getTime()) ? startOfDay(d) : null;
}

export function isSplitBooksMode(company: CompanyFiscalPreflight | null | undefined): boolean {
  return company?.fiscalSplitMode === "separate";
}

/** True when date is strictly before configured fiscal year start (split-books guard). */
export function needsPriorFiscalYearSplitPermission(
  company: CompanyFiscalPreflight | null | undefined,
  date: Date | null | undefined
): boolean {
  if (!isSplitBooksMode(company) || !date) return false;
  const fs = fiscalYearStartDay(company);
  if (!fs) return false;
  return startOfDay(date) < fs;
}

export type FiscalVoucherPreflightResult =
  | { ok: true }
  | { ok: false; message?: string; silent?: boolean };

/**
 * Split books (separate): extra permission for any voucher date before fiscalYearStart.
 * Merge: confirm before save when edit touches the old side of the partition (balances after divider live-update).
 */
export function runFiscalVoucherPreflight(options: {
  company: CompanyFiscalPreflight | null | undefined;
  can: (p: Permission) => boolean;
  isEditing: boolean;
  recordDate: Date | undefined | null;
  originalVoucherDate?: Date | null;
  /** Override for tests / custom UI; default uses window.confirm */
  confirmMergeImpact?: () => boolean;
}): FiscalVoucherPreflightResult {
  const { company, can, isEditing, recordDate, originalVoucherDate, confirmMergeImpact } = options;

  const mergeConfirm =
    confirmMergeImpact ??
    (() =>
      window.confirm(
        "This company uses merged fiscal years (divider in one ledger). Saving this voucher will update running balances in the new fiscal period after the divider (opening figures follow from the old period).\n\nOK = apply the change.\nCancel = do not save (balances stay as they were)."
      ));

  const datesToCheck: Date[] = [];
  if (recordDate) datesToCheck.push(recordDate);
  if (isEditing && originalVoucherDate) datesToCheck.push(originalVoucherDate);

  for (const d of datesToCheck) {
    if (needsPriorFiscalYearSplitPermission(company, d) && !can("edit_prior_fiscal_year_split_books")) {
      return {
        ok: false,
        message:
          "You do not have permission to add or edit vouchers before the current fiscal year while Split books mode is on. An owner can allow this under Manage users → Permissions → Fiscal period.",
      };
    }
  }

  if (company?.fiscalSplitMode === "merge" && isEditing) {
    const partition = getFiscalMergePartitionDateFromCompany(company as Parameters<typeof getFiscalMergePartitionDateFromCompany>[0]);
    if (partition) {
      const orig = originalVoucherDate ? startOfDay(originalVoucherDate) : null;
      const rec = recordDate ? startOfDay(recordDate) : null;
      const touchesOldSide =
        (orig !== null && orig < partition) || (rec !== null && rec < partition);
      if (touchesOldSide && !mergeConfirm()) {
        return { ok: false, silent: true };
      }
    }
  }

  return { ok: true };
}

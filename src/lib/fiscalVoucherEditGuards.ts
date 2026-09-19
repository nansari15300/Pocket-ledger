import { startOfDay } from "date-fns";
import { getFiscalMergePartitionsFromCompany } from "@/lib/fiscalPartitionRows";

/** Minimal company fields for fiscal preflight (avoid importing full Company type). */
export type CompanyFiscalPreflight = {
  fiscalSplitMode?: string;
  fiscalYearStart?: { toDate?: () => Date } | Date | null;
  fiscalMergePartitionAt?: { toDate?: () => Date };
};

export type FiscalVoucherPreflightResult =
  | { ok: true }
  | { ok: false; message?: string; silent?: boolean };

/**
 * Merge: confirm before save when edit touches the old side of the partition (balances after divider live-update).
 */
export function runFiscalVoucherPreflight(options: {
  company: CompanyFiscalPreflight | null | undefined;
  isEditing: boolean;
  recordDate: Date | undefined | null;
  originalVoucherDate?: Date | null;
  /** Override for tests / custom UI; default uses window.confirm */
  confirmMergeImpact?: () => boolean;
}): FiscalVoucherPreflightResult {
  const { company, isEditing, recordDate, originalVoucherDate, confirmMergeImpact } = options;

  const mergeConfirm =
    confirmMergeImpact ??
    (() =>
      window.confirm(
        "This company uses merged fiscal years (divider in one ledger). Saving this voucher will update running balances in the new fiscal period after the divider (opening figures follow from the old period).\n\nOK = apply the change.\nCancel = do not save (balances stay as they were)."
      ));

  if (company?.fiscalSplitMode === "merge" && isEditing) {
    const partitions = getFiscalMergePartitionsFromCompany(
      company as Parameters<typeof getFiscalMergePartitionsFromCompany>[0]
    );
    if (partitions.length) {
      const orig = originalVoucherDate ? startOfDay(originalVoucherDate) : null;
      const rec = recordDate ? startOfDay(recordDate) : null;
      const touchesOldSide = partitions.some((partition) => {
        return (orig !== null && orig < partition) || (rec !== null && rec < partition);
      });
      if (touchesOldSide && !mergeConfirm()) {
        return { ok: false, silent: true };
      }
    }
  }

  return { ok: true };
}

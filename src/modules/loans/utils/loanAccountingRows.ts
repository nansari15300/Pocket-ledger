import type { LoanTransaction } from "../types/loanTransactionTypes";
import { compareLoanTxnChronological } from "./loanLedgerMovement";
import { todayIso } from "./loanDateUtils";

function isoFromVoucherDate(date: unknown): string {
  if (!date) return todayIso();
  const raw =
    date && typeof (date as { toDate?: () => Date }).toDate === "function"
      ? (date as { toDate: () => Date }).toDate()
      : new Date(date as string | number | Date);
  if (Number.isNaN(raw.getTime())) return todayIso();
  const y = raw.getFullYear();
  const m = String(raw.getMonth() + 1).padStart(2, "0");
  const d = String(raw.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function noteVoucherMatchesStaff(voucher: Record<string, unknown>, staffAccountId: string): boolean {
  if (!staffAccountId) return false;
  if (String(voucher.staffId || "") === staffAccountId) return true;
  const entries = voucher.entries;
  if (!Array.isArray(entries)) return false;
  return entries.some((e) => String((e as { accountId?: string }).accountId || "") === staffAccountId);
}

export function noteVoucherToLoanTransaction(
  voucher: Record<string, unknown>,
  loanId: string,
  companyId: string
): LoanTransaction {
  const ts = isoFromVoucherDate(voucher.date);
  const createdAt =
    voucher.createdAt && typeof (voucher.createdAt as { toDate?: () => Date }).toDate === "function"
      ? (voucher.createdAt as { toDate: () => Date }).toDate().toISOString()
      : new Date().toISOString();
  return {
    id: `note:${String(voucher.id || "")}`,
    companyId,
    loanId,
    scheduleId: null,
    kind: "note",
    amount: 0,
    principalAmount: 0,
    interestAmount: 0,
    chargeAmount: 0,
    lateFeeAmount: 0,
    paymentDate: ts,
    journalDate: ts,
    dueDate: null,
    bankAccountId: "",
    journalEntryId: String(voucher.id || ""),
    reversedTransactionId: null,
    reversalJournalId: null,
    referenceNumber: String(voucher.voucherNumber || voucher.id || ""),
    chequeNumber: "",
    bankTransactionId: "",
    paymentMode: "other",
    notes: String(voucher.narration || ""),
    createdAt,
    createdBy: String(voucher.userId || ""),
    isReversed: Boolean(voucher.isDeleted),
  };
}

/** Live (not deleted) voucher ids from the in-memory voucher list. `null` = list not ready yet. */
export function liveJournalIdSetFromVouchers(
  vouchers: Record<string, unknown>[] | null | undefined,
  opts?: { skipWhenEmptyLoading?: boolean }
): Set<string> | null {
  const list = vouchers || [];
  if (opts?.skipWhenEmptyLoading && list.length === 0) return null;
  const ids = new Set<string>();
  for (const v of list) {
    if (!v || v.isDeleted === true) continue;
    const id = String(v.id || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

export function loanTxnHasLiveJournal(txn: LoanTransaction, liveJournalIds: Set<string> | null): boolean {
  const id = String(txn.journalEntryId || "").trim();
  if (!id) return false;
  if (!liveJournalIds) return true;
  return liveJournalIds.has(id);
}

/** Loan journal rows + staff note vouchers for the loan liability account. */
export function mergeLoanAccountingTransactions(
  loanTxns: LoanTransaction[],
  vouchers: Record<string, unknown>[] | null | undefined,
  staffAccountId: string,
  loanId: string,
  companyId: string,
  liveJournalIds?: Set<string> | null
): LoanTransaction[] {
  const liveIds = liveJournalIds === undefined ? liveJournalIdSetFromVouchers(vouchers) : liveJournalIds;
  const base = loanTxns.filter((t) => loanTxnHasLiveJournal(t, liveIds));
  const journalIds = new Set(base.map((t) => String(t.journalEntryId || "")).filter(Boolean));
  const noteRows: LoanTransaction[] = [];
  for (const v of vouchers || []) {
    if (!v || v.isDeleted) continue;
    if (String(v.type || "") !== "note") continue;
    if (!noteVoucherMatchesStaff(v, staffAccountId)) continue;
    const vid = String(v.id || "");
    if (!vid || journalIds.has(vid)) continue;
    noteRows.push(noteVoucherToLoanTransaction(v, loanId, companyId));
  }
  return [...base, ...noteRows].sort(compareLoanTxnChronological);
}

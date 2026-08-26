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

/** Loan journal rows + staff note vouchers for the loan liability account. */
export function mergeLoanAccountingTransactions(
  loanTxns: LoanTransaction[],
  vouchers: Record<string, unknown>[] | null | undefined,
  staffAccountId: string,
  loanId: string,
  companyId: string
): LoanTransaction[] {
  const journalIds = new Set(
    loanTxns.map((t) => t.journalEntryId).filter((id): id is string => Boolean(id))
  );
  const base = loanTxns.filter((t) => Boolean(t.journalEntryId));
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

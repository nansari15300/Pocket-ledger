import { roundMoney } from "./loanRounding";
import type { LoanTransaction } from "../types/loanTransactionTypes";

/** Loan payable (Staff) ke hisaab se Dr/Cr — Bank statement jaisa. */
export function loanLiabilityDrCr(row: LoanTransaction): { debit: number; credit: number } {
  const principal = roundMoney(row.principalAmount || 0);
  const amount = roundMoney(row.amount || 0);
  switch (row.kind) {
    case "disbursement":
      return { debit: 0, credit: principal || amount };
    case "emi":
    case "partial_payment":
    case "prepayment":
      return { debit: principal || amount, credit: 0 };
    case "reversal":
      return { debit: 0, credit: principal || amount };
    default:
      return { debit: 0, credit: 0 };
  }
}

export function compareLoanTxnChronological(a: LoanTransaction, b: LoanTransaction): number {
  const date = String(a.paymentDate || "").localeCompare(String(b.paymentDate || ""));
  if (date !== 0) return date;
  return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
}

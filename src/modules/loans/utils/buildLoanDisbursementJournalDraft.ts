import { disbursementLines } from "../services/loanAccountingService";
import type { Loan } from "../types/loanTypes";
import { parseIsoDate, todayIso } from "./loanDateUtils";
import { roundMoney } from "./loanRounding";
import { remainingUndisbursedAmount } from "./loanUndisbursed";

export type LoanDisbursementJournalContext = {
  sanctioned: number;
  disbursed: number;
  remaining: number;
  loanName: string;
  loanNumber: string;
};

/** Prefill for AddVoucherDialog → journal (replaces Add Disbursement popup). */
export function buildLoanDisbursementJournalDraft(loan: Loan) {
  const remaining = remainingUndisbursedAmount(loan);
  const amount = roundMoney(remaining);
  const narration = `Loan disbursement — ${loan.loanName} (${loan.loanNumber})`;

  return {
    type: "journal" as const,
    date: parseIsoDate(todayIso()),
    narration,
    total: amount,
    entries: disbursementLines(loan.bankAccountId, loan.loanAccountId, amount),
    loanId: loan.id,
    loanTransactionKind: "disbursement",
    isLoanModuleVoucher: true,
    _loanDisbursementContext: {
      sanctioned: Number(loan.principalAmount || 0),
      disbursed: Number(loan.disbursedAmount || 0),
      remaining,
      loanName: loan.loanName,
      loanNumber: loan.loanNumber,
    } satisfies LoanDisbursementJournalContext,
  };
}

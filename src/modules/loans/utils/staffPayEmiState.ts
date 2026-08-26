import { currentSchedule, findLoanForAccount } from "../db/loanQueries";
import { refreshScheduleStatuses } from "../services/loanScheduleService";
import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow, ScheduleStatus } from "../types/loanScheduleTypes";
import { isLoanLiabilityStaff } from "../utils/loanLiabilityStaff";

export function isLoanPostingAllowed(loan: Loan): boolean {
  return (
    loan.status !== "closed" &&
    loan.status !== "cancelled" &&
    loan.status !== "draft" &&
    !!loan.disbursementJournalId
  );
}

export function pickNextPayEmiRow(loan: Loan, scheduleRows: LoanScheduleRow[]): LoanScheduleRow | null {
  const sched = refreshScheduleStatuses(loan, currentSchedule(scheduleRows));
  return sched.find((row) => row.status !== "paid" && !row.isHistorical) || null;
}

export function isEmiPayableNow(status: ScheduleStatus): boolean {
  return status === "due" || status === "overdue" || status === "partially_paid";
}

export function summarizeStaffPayEmiButtonState(params: {
  processedStaff: Array<{ id: string; groupId?: string | null; isLoanAccount?: boolean | null }>;
  allLoans: Loan[];
  schedulesByLoan: Record<string, LoanScheduleRow[]>;
  selectedAccountId?: string | null;
}): { show: boolean; emiDue: boolean } {
  const loanAccounts = params.processedStaff.filter(isLoanLiabilityStaff);
  if (loanAccounts.length === 0) {
    return { show: false, emiDue: false };
  }

  const loanAccountIds = new Set(loanAccounts.map((row) => row.id));
  const postingLoans = params.allLoans.filter(
    (loan) => isLoanPostingAllowed(loan) && loanAccountIds.has(String(loan.loanAccountId || "").trim())
  );

  const selectedAccountId = String(params.selectedAccountId || "").trim();
  const loansToCheck = selectedAccountId
    ? (() => {
        const linked = findLoanForAccount(postingLoans, selectedAccountId);
        return linked ? [linked] : [];
      })()
    : postingLoans;

  const emiDue = loansToCheck.some((loan) => {
    const row = pickNextPayEmiRow(loan, params.schedulesByLoan[loan.id] || []);
    return !!row && isEmiPayableNow(row.status);
  });

  return { show: true, emiDue };
}

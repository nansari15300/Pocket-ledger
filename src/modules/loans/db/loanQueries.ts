import type { Loan, LoanDashboardStats } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { computeScheduleStatus, remainingDue } from "../utils/loanStatus";
import { addCalendarDays, compareIsoDates, todayIso } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";

/** Loan payable Staff row → module loan (open first; otherwise latest match). */
export function findLoanForAccount(loans: Loan[], accountId: string | null | undefined): Loan | undefined {
  const id = String(accountId || "").trim();
  if (!id) return undefined;
  const matches = loans.filter((loan) => String(loan.loanAccountId || "").trim() === id);
  return (
    matches.find((loan) => loan.status !== "closed" && loan.status !== "cancelled") || matches[0]
  );
}

export function filterLoans(
  loans: Loan[],
  opts: { search?: string; status?: string; lender?: string }
): Loan[] {
  const q = String(opts.search || "").trim().toLowerCase();
  return loans.filter((loan) => {
    if (opts.status && opts.status !== "all") {
      if (opts.status === "overdue" && loan.status !== "overdue") return false;
      if (opts.status !== "overdue" && loan.status !== opts.status) return false;
    }
    if (opts.lender && String(loan.lenderName).toLowerCase() !== opts.lender.toLowerCase()) return false;
    if (!q) return true;
    const hay = `${loan.loanName} ${loan.loanNumber} ${loan.lenderName} ${loan.loanAccountId}`.toLowerCase();
    return hay.includes(q);
  });
}

export function currentSchedule(rows: LoanScheduleRow[]): LoanScheduleRow[] {
  const live = rows.filter((r) => !r.isHistorical);
  if (live.length === 0) return [];
  const version = Math.max(...live.map((r) => r.scheduleVersion || 1));
  return live
    .filter((r) => r.scheduleVersion === version)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
}

export function buildDashboardStats(loans: Loan[], schedulesByLoan: Record<string, LoanScheduleRow[]>, asOf = todayIso()): LoanDashboardStats {
  const active = loans.filter((l) => l.status !== "closed" && l.status !== "cancelled");
  let upcomingEmi = 0;
  let overdueAmount = 0;
  let overdueInstallments = 0;
  let maturingSoon = 0;
  const soon = addCalendarDays(asOf, 30);

  for (const loan of active) {
    const rows = currentSchedule(schedulesByLoan[loan.id] || []).map((row) => ({
      ...row,
      status: computeScheduleStatus(row, loan.gracePeriodDays, asOf),
    }));
    const next = rows.find((r) => r.status === "due" || r.status === "upcoming" || r.status === "partially_paid");
    if (next) upcomingEmi += remainingDue(next);
    for (const row of rows) {
      if (row.status === "overdue") {
        overdueAmount += remainingDue(row);
        overdueInstallments += 1;
      }
    }
    if (loan.maturityDate && compareIsoDates(loan.maturityDate, asOf) >= 0 && compareIsoDates(loan.maturityDate, soon) <= 0) {
      maturingSoon += 1;
    }
  }

  return {
    activeLoans: active.length,
    totalBorrowed: roundMoney(active.reduce((s, l) => s + (l.principalAmount || 0), 0)),
    outstanding: roundMoney(active.reduce((s, l) => s + (l.outstandingPrincipal || 0), 0)),
    principalPaid: roundMoney(active.reduce((s, l) => s + (l.paidPrincipal || 0), 0)),
    interestPaid: roundMoney(active.reduce((s, l) => s + (l.paidInterest || 0), 0)),
    upcomingEmi: roundMoney(upcomingEmi),
    overdueAmount: roundMoney(overdueAmount),
    overdueInstallments,
    maturingSoon,
  };
}

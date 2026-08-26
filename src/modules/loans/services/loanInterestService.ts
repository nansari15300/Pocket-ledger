import type { Loan } from "../types/loanTypes";
import { roundMoney } from "../utils/loanRounding";

export function calculateLateFee(loan: Pick<Loan, "lateFeeMode" | "lateFeeValue">, overdueAmount: number, daysOverdue: number): number {
  if (daysOverdue <= 0 || overdueAmount <= 0) return 0;
  if (loan.lateFeeMode === "none") return 0;
  if (loan.lateFeeMode === "fixed") return roundMoney(loan.lateFeeValue || 0);
  if (loan.lateFeeMode === "percent") return roundMoney(overdueAmount * ((loan.lateFeeValue || 0) / 100));
  if (loan.lateFeeMode === "daily_percent") {
    return roundMoney(overdueAmount * ((loan.lateFeeValue || 0) / 100) * daysOverdue);
  }
  return 0;
}

export function accruedInterestEstimate(outstandingPrincipal: number, annualRatePercent: number, days: number, dayBasis: number): number {
  const basis = dayBasis || 365;
  return roundMoney(outstandingPrincipal * (annualRatePercent / 100) * (Math.max(0, days) / basis));
}

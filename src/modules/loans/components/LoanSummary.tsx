"use client";

import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { remainingDue } from "../utils/loanStatus";
import { useDate } from "@/hooks/useDate";
import { remainingInstallments } from "../services/loanCalculationService";
import { daysBetween, todayIso } from "../utils/loanDateUtils";
import { accruedInterestEstimate } from "../services/loanInterestService";
import { useFormatLoanIso } from "./LoanSystemDateField";
import { effectiveRepaymentType, installmentAmountLabel, repaymentTypeLabel } from "../utils/loanRepaymentType";

export function LoanSummary({ loan, schedule }: { loan: Loan; schedule: LoanScheduleRow[] }) {
  const { formatCurrencyForPrint } = useDate();
  const fmt = useFormatLoanIso();
  const money = (n: number) => formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false });
  const next = schedule.find((r) => r.status === "due" || r.status === "upcoming" || r.status === "partially_paid" || r.status === "overdue");
  const accrued = accruedInterestEstimate(
    loan.outstandingPrincipal,
    loan.interestRate,
    Math.max(0, daysBetween(loan.disbursementDate, todayIso())),
    loan.dayBasis
  );
  const repaymentType = effectiveRepaymentType(loan.repaymentType);
  const nextDueLabel =
    repaymentType === "emi" ? "Next EMI" : repaymentType === "bullet" ? "Next Due" : "Next Interest";
  const items: Array<[string, string]> = [
    ["Original Principal", money(loan.principalAmount)],
    ["Outstanding Principal", money(loan.outstandingPrincipal)],
    ["Paid Principal", money(loan.paidPrincipal)],
    ["Interest Paid", money(loan.paidInterest)],
    ["Accrued Interest (est.)", money(accrued)],
    ["Repayment Type", repaymentTypeLabel(repaymentType)],
    [installmentAmountLabel(repaymentType), money(loan.emiAmount)],
    [nextDueLabel, next ? money(remainingDue(next)) : "—"],
    ["Disbursement Date", fmt(loan.disbursementDate)],
    ["Next Due Date", next ? fmt(next.dueDate) : "—"],
    ["Remaining Installments", String(remainingInstallments(schedule))],
    ["Maturity Date", fmt(loan.maturityDate)],
    ["Interest Rate", `${loan.interestRate}% ${loan.interestRateType}`],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="font-medium tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}

import type { Loan } from "../types/loanTypes";
import type { GeneratedScheduleRow, LoanScheduleRow } from "../types/loanScheduleTypes";
import { generateLoanSchedule } from "../calculations/scheduleGenerator";
import { newLoanDocId, nowIso } from "../db/loanIds";
import { computeScheduleStatus } from "../utils/loanStatus";
import { frequencyMonths } from "../utils/loanDateUtils";
import { effectiveRepaymentType } from "../utils/loanRepaymentType";

export function materializeSchedule(
  companyId: string,
  loanId: string,
  generated: GeneratedScheduleRow[]
): LoanScheduleRow[] {
  const ts = nowIso();
  return generated.map((row) => ({
    ...row,
    id: newLoanDocId("sch"),
    companyId,
    loanId,
    journalEntryId: null,
    paymentDate: null,
    createdAt: ts,
    updatedAt: ts,
  }));
}

export function refreshScheduleStatuses(loan: Pick<Loan, "gracePeriodDays">, rows: LoanScheduleRow[]): LoanScheduleRow[] {
  return rows.map((row) => ({
    ...row,
    status: computeScheduleStatus(row, loan.gracePeriodDays),
  }));
}

export function regenerateFutureSchedule(params: {
  loan: Loan;
  paidRows: LoanScheduleRow[];
  outstandingPrincipal: number;
  interestRate: number;
  remainingCount: number;
  firstFutureDate: string;
  emiAmount?: number;
  emiIsManual?: boolean;
}): GeneratedScheduleRow[] {
  if (params.remainingCount <= 0 || params.outstandingPrincipal <= 0) return [];
  const step = frequencyMonths(params.loan.paymentFrequency, params.loan.customIntervalMonths);
  return generateLoanSchedule({
    principal: params.outstandingPrincipal,
    interestRate: params.interestRate,
    interestMethod: params.loan.interestMethod,
    tenure: params.remainingCount * step,
    tenureUnit: "months",
    paymentFrequency: params.loan.paymentFrequency,
    customIntervalMonths: params.loan.customIntervalMonths,
    disbursementDate: params.loan.disbursementDate,
    firstPaymentDate: params.firstFutureDate,
    paymentDayMode: params.loan.paymentDayMode,
    paymentDay: params.loan.paymentDay,
    dayBasis: params.loan.dayBasis,
    compoundingFrequency: params.loan.compoundingFrequency,
    emiAmount: params.emiAmount ?? params.loan.emiAmount,
    emiIsManual: params.emiIsManual ?? params.loan.emiIsManual,
    repaymentType: effectiveRepaymentType(params.loan.repaymentType),
    scheduleVersion: params.loan.scheduleVersion + 1,
  });
}

export function markHistorical(rows: LoanScheduleRow[]): LoanScheduleRow[] {
  const ts = nowIso();
  return rows
    .filter((r) => !r.isHistorical && r.status !== "paid" && r.status !== "partially_paid")
    .map((r) => ({ ...r, isHistorical: true, status: "cancelled" as const, updatedAt: ts }));
}

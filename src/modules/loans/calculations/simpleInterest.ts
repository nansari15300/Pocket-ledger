import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import { roundMoney } from "../utils/loanRounding";
import { frequencyMonths } from "../utils/loanDateUtils";
import type { PaymentFrequency } from "../types/loanTypes";

/** Simple interest on original principal for each period: P × r × t */
export function buildSimpleInterestSchedule(params: {
  principal: number;
  annualRatePercent: number;
  dueDates: string[];
  frequency: PaymentFrequency;
  customIntervalMonths?: number;
  scheduleVersion: number;
}): GeneratedScheduleRow[] {
  const n = params.dueDates.length;
  const months = frequencyMonths(params.frequency, params.customIntervalMonths);
  const periodYears = months / 12;
  const interestEach = roundMoney(params.principal * (params.annualRatePercent / 100) * periodYears);
  const principalEach = roundMoney(params.principal / n);
  const rows: GeneratedScheduleRow[] = [];
  let opening = roundMoney(params.principal);
  let principalAllocated = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const principalDue = isLast ? roundMoney(params.principal - principalAllocated) : principalEach;
    const closingPrincipal = roundMoney(Math.max(0, opening - principalDue));
    rows.push({
      scheduleVersion: params.scheduleVersion,
      installmentNumber: i + 1,
      dueDate: params.dueDates[i]!,
      openingPrincipal: opening,
      principalDue,
      openingInterest: 0,
      interestDue: interestEach,
      totalDue: roundMoney(principalDue + interestEach),
      principalPaid: 0,
      interestPaid: 0,
      lateFee: 0,
      otherCharges: 0,
      totalPaid: 0,
      closingPrincipal,
      status: "upcoming",
      isHistorical: false,
    });
    principalAllocated = roundMoney(principalAllocated + principalDue);
    opening = closingPrincipal;
  }
  return rows;
}

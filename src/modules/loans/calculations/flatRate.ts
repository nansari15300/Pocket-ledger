import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import { roundMoney } from "../utils/loanRounding";

export function buildFlatRateSchedule(params: {
  principal: number;
  annualRatePercent: number;
  years: number;
  dueDates: string[];
  scheduleVersion: number;
}): GeneratedScheduleRow[] {
  const n = params.dueDates.length;
  const totalInterest = roundMoney(params.principal * (params.annualRatePercent / 100) * params.years);
  const basePrincipal = roundMoney(params.principal / n);
  const baseInterest = roundMoney(totalInterest / n);
  const rows: GeneratedScheduleRow[] = [];
  let opening = roundMoney(params.principal);
  let principalAllocated = 0;
  let interestAllocated = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const principalDue = isLast ? roundMoney(params.principal - principalAllocated) : basePrincipal;
    const interestDue = isLast ? roundMoney(totalInterest - interestAllocated) : baseInterest;
    const closingPrincipal = roundMoney(Math.max(0, opening - principalDue));
    rows.push({
      scheduleVersion: params.scheduleVersion,
      installmentNumber: i + 1,
      dueDate: params.dueDates[i]!,
      openingPrincipal: opening,
      principalDue,
      openingInterest: 0,
      interestDue,
      totalDue: roundMoney(principalDue + interestDue),
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
    interestAllocated = roundMoney(interestAllocated + interestDue);
    opening = closingPrincipal;
  }
  return rows;
}

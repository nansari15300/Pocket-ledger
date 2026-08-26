import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import type { DayBasis } from "../types/loanTypes";
import { daysBetween } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";

export function dailyInterest(principal: number, annualRatePercent: number, days: number, dayBasis: DayBasis): number {
  const basis = dayBasis === 360 || dayBasis === 366 || dayBasis === 365 ? dayBasis : 365;
  return roundMoney(principal * (annualRatePercent / 100) * (Math.max(0, days) / basis));
}

export function buildDailyReducingSchedule(params: {
  principal: number;
  emi: number;
  annualRatePercent: number;
  dayBasis: DayBasis;
  disbursementDate: string;
  dueDates: string[];
  scheduleVersion: number;
}): GeneratedScheduleRow[] {
  const rows: GeneratedScheduleRow[] = [];
  let opening = roundMoney(params.principal);
  let prevDate = params.disbursementDate;
  const n = params.dueDates.length;
  for (let i = 0; i < n; i++) {
    const dueDate = params.dueDates[i]!;
    const days = Math.max(1, daysBetween(prevDate, dueDate));
    const interestDue = dailyInterest(opening, params.annualRatePercent, days, params.dayBasis);
    const isLast = i === n - 1;
    let principalDue = isLast ? opening : roundMoney(params.emi - interestDue);
    if (principalDue < 0) principalDue = 0;
    if (principalDue > opening) principalDue = opening;
    const closingPrincipal = roundMoney(Math.max(0, opening - principalDue));
    const totalDue = roundMoney(principalDue + interestDue);
    rows.push({
      scheduleVersion: params.scheduleVersion,
      installmentNumber: i + 1,
      dueDate,
      openingPrincipal: opening,
      principalDue,
      openingInterest: 0,
      interestDue,
      totalDue,
      principalPaid: 0,
      interestPaid: 0,
      lateFee: 0,
      otherCharges: 0,
      totalPaid: 0,
      closingPrincipal: isLast ? 0 : closingPrincipal,
      status: "upcoming",
      isHistorical: false,
    });
    opening = isLast ? 0 : closingPrincipal;
    prevDate = dueDate;
  }
  return rows;
}

import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import { roundMoney } from "../utils/loanRounding";

/** Interest is added to outstanding, then the installment is applied. */
export function buildCompoundInterestSchedule(params: {
  principal: number;
  emi: number;
  periodicRate: number;
  dueDates: string[];
  scheduleVersion: number;
}): GeneratedScheduleRow[] {
  const rows: GeneratedScheduleRow[] = [];
  let opening = roundMoney(params.principal);
  const n = params.dueDates.length;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const compounded = roundMoney(opening * (1 + params.periodicRate));
    const interestDue = roundMoney(compounded - opening);
    const payment = isLast ? compounded : Math.min(params.emi, compounded);
    const principalDue = roundMoney(Math.max(0, payment - interestDue));
    const closingPrincipal = roundMoney(Math.max(0, compounded - payment));
    rows.push({
      scheduleVersion: params.scheduleVersion,
      installmentNumber: i + 1,
      dueDate: params.dueDates[i]!,
      openingPrincipal: opening,
      principalDue,
      openingInterest: 0,
      interestDue,
      totalDue: roundMoney(payment),
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
  }
  return rows;
}

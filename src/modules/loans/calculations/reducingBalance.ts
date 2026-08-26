import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import { roundMoney } from "../utils/loanRounding";

export function reducingBalanceInstallment(params: {
  openingPrincipal: number;
  emi: number;
  periodicRate: number;
  isLast: boolean;
}): { principalDue: number; interestDue: number; closingPrincipal: number; totalDue: number } {
  const interestDue = roundMoney(params.openingPrincipal * params.periodicRate);
  if (params.isLast) {
    const principalDue = roundMoney(Math.max(0, params.openingPrincipal));
    const totalDue = roundMoney(principalDue + interestDue);
    return { principalDue, interestDue, closingPrincipal: 0, totalDue };
  }
  let principalDue = roundMoney(params.emi - interestDue);
  if (principalDue < 0) principalDue = 0;
  if (principalDue > params.openingPrincipal) principalDue = roundMoney(params.openingPrincipal);
  const closingPrincipal = roundMoney(Math.max(0, params.openingPrincipal - principalDue));
  const totalDue = roundMoney(principalDue + interestDue);
  return { principalDue, interestDue, closingPrincipal, totalDue };
}

export function buildReducingBalanceSchedule(params: {
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
    const split = reducingBalanceInstallment({
      openingPrincipal: opening,
      emi: params.emi,
      periodicRate: params.periodicRate,
      isLast,
    });
    rows.push({
      scheduleVersion: params.scheduleVersion,
      installmentNumber: i + 1,
      dueDate: params.dueDates[i]!,
      openingPrincipal: opening,
      principalDue: split.principalDue,
      openingInterest: 0,
      interestDue: split.interestDue,
      totalDue: split.totalDue,
      principalPaid: 0,
      interestPaid: 0,
      lateFee: 0,
      otherCharges: 0,
      totalPaid: 0,
      closingPrincipal: split.closingPrincipal,
      status: "upcoming",
      isHistorical: false,
    });
    opening = split.closingPrincipal;
  }
  return rows;
}

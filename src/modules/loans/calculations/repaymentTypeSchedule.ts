import type { InterestMethod, PaymentFrequency, RepaymentType } from "../types/loanTypes";
import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import type { ScheduleGenerateInput } from "./scheduleGenerator";
import { generateDueDates, daysBetween, frequencyMonths } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";
import { installmentCount, periodicRate } from "./emiCalculator";
import { dailyInterest } from "./dailyReducingBalance";

function yearsFromTenure(tenure: number, tenureUnit: "months" | "years"): number {
  return tenureUnit === "years" ? tenure : tenure / 12;
}

function installmentCountFor(input: ScheduleGenerateInput): number {
  return installmentCount(input.tenure, input.tenureUnit, input.paymentFrequency, input.customIntervalMonths);
}

function periodInterest(params: {
  interestMethod: InterestMethod;
  opening: number;
  originalPrincipal: number;
  annualRatePercent: number;
  periodicRate: number;
  prevDate: string;
  dueDate: string;
  dayBasis: number;
  frequency: PaymentFrequency;
  customIntervalMonths?: number;
  installmentCount: number;
  tenureYears: number;
}): number {
  switch (params.interestMethod) {
    case "daily_reducing_balance": {
      const days = Math.max(1, daysBetween(params.prevDate, params.dueDate));
      return dailyInterest(params.opening, params.annualRatePercent, days, params.dayBasis as 365);
    }
    case "simple_interest": {
      const months = frequencyMonths(params.frequency, params.customIntervalMonths);
      return roundMoney(params.originalPrincipal * (params.annualRatePercent / 100) * (months / 12));
    }
    case "flat_rate": {
      const totalInterest = roundMoney(params.originalPrincipal * (params.annualRatePercent / 100) * params.tenureYears);
      return roundMoney(totalInterest / params.installmentCount);
    }
    case "compound_interest":
    case "reducing_balance":
    default:
      return roundMoney(params.opening * params.periodicRate);
  }
}

/** Interest-only and bullet schedules — principal via prepayment or final bullet installment. */
export function buildRepaymentTypeSchedule(
  input: ScheduleGenerateInput & { repaymentType: Exclude<RepaymentType, "emi"> }
): GeneratedScheduleRow[] {
  const n = installmentCountFor(input);
  const dueDates = generateDueDates({
    firstPaymentDate: input.firstPaymentDate,
    installmentCount: n,
    frequency: input.paymentFrequency,
    customIntervalMonths: input.customIntervalMonths,
    paymentDayMode: input.paymentDayMode,
    paymentDay: input.paymentDay,
  });
  const version = input.scheduleVersion ?? 1;
  const r = periodicRate(input.interestRate, input.compoundingFrequency || input.paymentFrequency);
  const tenureYears = yearsFromTenure(input.tenure, input.tenureUnit);
  const rows: GeneratedScheduleRow[] = [];
  let opening = roundMoney(input.principal);
  let prevDate = input.disbursementDate;

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const dueDate = dueDates[i]!;
    const interestDue = periodInterest({
      interestMethod: input.interestMethod,
      opening,
      originalPrincipal: roundMoney(input.principal),
      annualRatePercent: input.interestRate,
      periodicRate: r,
      prevDate,
      dueDate,
      dayBasis: input.dayBasis ?? 365,
      frequency: input.paymentFrequency,
      customIntervalMonths: input.customIntervalMonths,
      installmentCount: n,
      tenureYears,
    });

    let principalDue = 0;
    if (input.repaymentType === "bullet" && isLast) {
      principalDue = opening;
    }

    const closingPrincipal =
      input.repaymentType === "bullet" && isLast ? 0 : roundMoney(opening);
    const totalDue = roundMoney(principalDue + interestDue);

    rows.push({
      scheduleVersion: version,
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
      closingPrincipal,
      status: "upcoming",
      isHistorical: false,
    });

    prevDate = dueDate;
    opening = closingPrincipal;
  }

  return rows;
}

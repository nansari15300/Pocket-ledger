import type { InterestMethod, LoanDraftInput, LoanPreview, PaymentFrequency, RepaymentType } from "../types/loanTypes";
import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";
import { generateDueDates } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";
import { effectiveRepaymentType } from "../utils/loanRepaymentType";
import { calculateFlatEmi, calculateReducingEmi, installmentCount, periodicRate } from "./emiCalculator";
import { buildReducingBalanceSchedule } from "./reducingBalance";
import { buildFlatRateSchedule } from "./flatRate";
import { buildSimpleInterestSchedule } from "./simpleInterest";
import { buildCompoundInterestSchedule } from "./compoundInterest";
import { buildDailyReducingSchedule } from "./dailyReducingBalance";
import { buildRepaymentTypeSchedule } from "./repaymentTypeSchedule";

export type ScheduleGenerateInput = {
  principal: number;
  interestRate: number;
  interestMethod: InterestMethod;
  tenure: number;
  tenureUnit: "months" | "years";
  paymentFrequency: PaymentFrequency;
  customIntervalMonths?: number;
  disbursementDate: string;
  firstPaymentDate: string;
  paymentDayMode?: LoanDraftInput["paymentDayMode"];
  paymentDay?: number;
  dayBasis?: LoanDraftInput["dayBasis"];
  compoundingFrequency?: PaymentFrequency;
  emiAmount?: number;
  emiIsManual?: boolean;
  repaymentType?: RepaymentType;
  scheduleVersion?: number;
};

export function yearsFromTenure(tenure: number, tenureUnit: "months" | "years"): number {
  return tenureUnit === "years" ? tenure : tenure / 12;
}

export function resolveInstallmentCount(input: ScheduleGenerateInput): number {
  return installmentCount(input.tenure, input.tenureUnit, input.paymentFrequency, input.customIntervalMonths);
}

export function resolveEmi(input: ScheduleGenerateInput): number {
  const repaymentType = effectiveRepaymentType(input.repaymentType);
  if (repaymentType !== "emi") {
    const schedule = buildRepaymentTypeSchedule({ ...input, repaymentType });
    return schedule[0]?.totalDue ?? 0;
  }
  const n = resolveInstallmentCount(input);
  if (input.emiIsManual && Number(input.emiAmount) > 0) return roundMoney(input.emiAmount!);
  if (input.interestMethod === "flat_rate" || input.interestMethod === "simple_interest") {
    return calculateFlatEmi(input.principal, input.interestRate, yearsFromTenure(input.tenure, input.tenureUnit), n);
  }
  const r = periodicRate(input.interestRate, input.compoundingFrequency || input.paymentFrequency);
  return calculateReducingEmi(input.principal, r, n);
}

export function generateLoanSchedule(input: ScheduleGenerateInput): GeneratedScheduleRow[] {
  const repaymentType = effectiveRepaymentType(input.repaymentType);
  if (repaymentType !== "emi") {
    return buildRepaymentTypeSchedule({ ...input, repaymentType });
  }
  const n = resolveInstallmentCount(input);
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
  const emi = resolveEmi(input);

  switch (input.interestMethod) {
    case "flat_rate":
      return buildFlatRateSchedule({
        principal: input.principal,
        annualRatePercent: input.interestRate,
        years: yearsFromTenure(input.tenure, input.tenureUnit),
        dueDates,
        scheduleVersion: version,
      });
    case "simple_interest":
      return buildSimpleInterestSchedule({
        principal: input.principal,
        annualRatePercent: input.interestRate,
        dueDates,
        frequency: input.paymentFrequency,
        customIntervalMonths: input.customIntervalMonths,
        scheduleVersion: version,
      });
    case "compound_interest":
      return buildCompoundInterestSchedule({
        principal: input.principal,
        emi,
        periodicRate: r,
        dueDates,
        scheduleVersion: version,
      });
    case "daily_reducing_balance":
      return buildDailyReducingSchedule({
        principal: input.principal,
        emi,
        annualRatePercent: input.interestRate,
        dayBasis: input.dayBasis ?? 365,
        disbursementDate: input.disbursementDate,
        dueDates,
        scheduleVersion: version,
      });
    case "reducing_balance":
    default:
      return buildReducingBalanceSchedule({
        principal: input.principal,
        emi,
        periodicRate: r,
        dueDates,
        scheduleVersion: version,
      });
  }
}

export function previewFromSchedule(
  schedule: GeneratedScheduleRow[],
  emiAmount: number
): LoanPreview {
  const totalInterest = roundMoney(schedule.reduce((s, r) => s + r.interestDue, 0));
  const totalPrincipal = roundMoney(schedule.reduce((s, r) => s + r.principalDue, 0));
  return {
    emiAmount,
    installmentCount: schedule.length,
    totalInterest,
    totalRepayment: roundMoney(totalPrincipal + totalInterest),
    maturityDate: schedule[schedule.length - 1]?.dueDate || "",
    firstPaymentDate: schedule[0]?.dueDate || "",
  };
}

import { PERIODS_PER_YEAR } from "../constants/loanConstants";
import type { PaymentFrequency } from "../types/loanTypes";
import { roundMoney } from "../utils/loanRounding";

export function periodicRate(annualRatePercent: number, frequency: PaymentFrequency, customPeriodsPerYear?: number): number {
  const periods =
    frequency === "custom" ? Math.max(1, customPeriodsPerYear || 12) : PERIODS_PER_YEAR[frequency] || 12;
  return (annualRatePercent || 0) / 100 / periods;
}

export function installmentCount(tenure: number, tenureUnit: "months" | "years", frequency: PaymentFrequency, customIntervalMonths = 1): number {
  const months = tenureUnit === "years" ? tenure * 12 : tenure;
  const step = frequency === "custom" ? Math.max(1, customIntervalMonths) : frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "half_yearly" ? 6 : 12;
  return Math.max(1, Math.round(months / step));
}

/**
 * Reducing-balance EMI:
 * EMI = P × r × (1+r)^n / ((1+r)^n − 1)
 */
export function calculateReducingEmi(principal: number, periodicInterestRate: number, periods: number): number {
  const p = principal;
  const r = periodicInterestRate;
  const n = periods;
  if (!(p > 0) || !(n > 0)) return 0;
  if (r === 0) return roundMoney(p / n);
  const factor = (1 + r) ** n;
  const emi = (p * r * factor) / (factor - 1);
  return roundMoney(emi);
}

export function calculateFlatEmi(principal: number, annualRatePercent: number, years: number, periods: number): number {
  const interest = principal * (annualRatePercent / 100) * years;
  return roundMoney((principal + interest) / Math.max(1, periods));
}

export function calculateSimpleInterest(principal: number, annualRatePercent: number, years: number): number {
  return roundMoney(principal * (annualRatePercent / 100) * years);
}

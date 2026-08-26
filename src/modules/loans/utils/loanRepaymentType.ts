import { REPAYMENT_TYPE_LABELS } from "../constants/loanConstants";
import type { RepaymentType } from "../types/loanTypes";

export function effectiveRepaymentType(value?: RepaymentType | null): RepaymentType {
  return value === "interest_only" || value === "bullet" ? value : "emi";
}

export function isNonEmiRepayment(value?: RepaymentType | null): boolean {
  const type = effectiveRepaymentType(value);
  return type === "interest_only" || type === "bullet";
}

export function repaymentTypeLabel(value?: RepaymentType | null): string {
  return REPAYMENT_TYPE_LABELS[effectiveRepaymentType(value)];
}

export function installmentAmountLabel(value?: RepaymentType | null): string {
  return effectiveRepaymentType(value) === "emi" ? "EMI" : "Interest / period";
}

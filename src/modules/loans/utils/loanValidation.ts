import { INTEREST_METHODS, PAYMENT_FREQUENCIES, REPAYMENT_TYPES } from "../constants/loanConstants";
import type { LoanDraftInput } from "../types/loanTypes";
import { compareIsoDates, isValidIsoDate } from "./loanDateUtils";
import { effectiveRepaymentType } from "./loanRepaymentType";

export type LoanValidationIssue = { field: string; message: string };

export function validateLoanDraft(input: LoanDraftInput): LoanValidationIssue[] {
  const issues: LoanValidationIssue[] = [];
  if (!String(input.loanName || "").trim()) issues.push({ field: "loanName", message: "Loan name is required." });
  if (!String(input.lenderName || "").trim()) issues.push({ field: "lenderName", message: "Lender / bank name is required." });
  if (!String(input.bankAccountId || "").trim()) {
    issues.push({ field: "bankAccountId", message: "Bank / cash account is required." });
  }
  if (!(input.principalAmount > 0)) issues.push({ field: "principalAmount", message: "Principal must be greater than 0." });
  if (input.disbursedAmount < 0) issues.push({ field: "disbursedAmount", message: "Disbursed amount cannot be negative." });
  if (input.disbursedAmount > input.principalAmount) {
    issues.push({ field: "disbursedAmount", message: "Disbursed amount cannot exceed principal." });
  }
  if (input.interestRate < 0) issues.push({ field: "interestRate", message: "Interest rate cannot be negative." });
  if (!(input.tenure > 0)) issues.push({ field: "tenure", message: "Tenure must be greater than 0." });
  if (!INTEREST_METHODS.includes(input.interestMethod)) {
    issues.push({ field: "interestMethod", message: "Interest method is invalid." });
  }
  if (!PAYMENT_FREQUENCIES.includes(input.paymentFrequency)) {
    issues.push({ field: "paymentFrequency", message: "Payment frequency is invalid." });
  }
  const repaymentType = effectiveRepaymentType(input.repaymentType);
  if (!REPAYMENT_TYPES.includes(repaymentType)) {
    issues.push({ field: "repaymentType", message: "Repayment type is invalid." });
  }
  if (!isValidIsoDate(input.disbursementDate)) {
    issues.push({ field: "disbursementDate", message: "Disbursement date is invalid." });
  }
  if (!isValidIsoDate(input.firstPaymentDate)) {
    issues.push({ field: "firstPaymentDate", message: "First payment date is invalid." });
  }
  if (
    isValidIsoDate(input.disbursementDate) &&
    isValidIsoDate(input.firstPaymentDate) &&
    compareIsoDates(input.firstPaymentDate, input.disbursementDate) < 0
  ) {
    issues.push({ field: "firstPaymentDate", message: "First payment date cannot be before disbursement." });
  }
  if (repaymentType === "emi" && input.emiIsManual && !(Number(input.emiAmount) > 0)) {
    issues.push({ field: "emiAmount", message: "Manual EMI must be greater than 0." });
  }
  if (input.gracePeriodDays < 0) issues.push({ field: "gracePeriodDays", message: "Grace period cannot be negative." });
  return issues;
}

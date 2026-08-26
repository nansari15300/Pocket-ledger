import type { AUDIT_ACTIONS, CHARGE_TYPES } from "../constants/loanConstants";
import type { PrepaymentMode } from "./loanTypes";

export type LoanTransactionKind =
  | "disbursement"
  | "emi"
  | "partial_payment"
  | "prepayment"
  | "charge"
  | "late_fee"
  | "reversal"
  | "rate_change"
  | "closure"
  | "note";

export type LoanPaymentMode = "bank" | "cash" | "cheque" | "other";

export type LoanTransaction = {
  id: string;
  companyId: string;
  loanId: string;
  scheduleId: string | null;
  kind: LoanTransactionKind;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  chargeAmount: number;
  lateFeeAmount: number;
  paymentDate: string;
  journalDate: string;
  dueDate: string | null;
  bankAccountId: string;
  journalEntryId: string | null;
  reversedTransactionId: string | null;
  reversalJournalId: string | null;
  referenceNumber: string;
  chequeNumber: string;
  bankTransactionId: string;
  paymentMode: LoanPaymentMode;
  notes: string;
  createdAt: string;
  createdBy: string;
  isReversed: boolean;
};

export type LoanRateHistory = {
  id: string;
  companyId: string;
  loanId: string;
  effectiveDate: string;
  oldRate: number;
  newRate: number;
  reason: string;
  createdAt: string;
  createdBy: string;
  userName?: string;
};

export type LoanCharge = {
  id: string;
  companyId: string;
  loanId: string;
  scheduleId: string | null;
  chargeType: (typeof CHARGE_TYPES)[number];
  name: string;
  amount: number;
  date: string;
  accountId: string;
  journalEntryId: string | null;
  notes: string;
  createdAt: string;
  createdBy: string;
  isDeleted?: boolean;
};

export type LoanAuditLog = {
  id: string;
  companyId: string;
  loanId: string;
  action: (typeof AUDIT_ACTIONS)[number];
  userId: string;
  userName: string;
  timestamp: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
};

export type LoanDocument = {
  id: string;
  companyId: string;
  loanId: string;
  title: string;
  reference: string;
  notes: string;
  createdAt: string;
  createdBy: string;
};

export type LoanPaymentInput = {
  scheduleId: string;
  amount: number;
  paymentDate: string;
  journalDate: string;
  bankAccountId: string;
  voucherNumber?: string;
  referenceNumber?: string;
  chequeNumber?: string;
  bankTransactionId?: string;
  paymentMode?: LoanPaymentMode;
  notes?: string;
  includeLateFee?: boolean;
  attachmentFiles?: (File | string)[];
};

export type LoanPrepaymentInput = {
  amount: number;
  date: string;
  bankAccountId: string;
  mode: PrepaymentMode;
  referenceNumber?: string;
  chequeNumber?: string;
  notes?: string;
  attachmentFiles?: (File | string)[];
};

export type LoanRateChangeInput = {
  effectiveDate: string;
  newRate: number;
  reason: string;
};

export type LoanChargeInput = {
  chargeType: (typeof CHARGE_TYPES)[number];
  name: string;
  amount: number;
  date: string;
  accountId: string;
  bankAccountId: string;
  notes?: string;
  attachmentFiles?: (File | string)[];
};

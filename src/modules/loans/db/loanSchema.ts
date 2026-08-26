import { LOAN_COLLECTIONS } from "../constants/loanConstants";
import type { Loan, LoanSettings } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanAuditLog, LoanCharge, LoanDocument, LoanRateHistory, LoanTransaction } from "../types/loanTransactionTypes";

/** Conceptual schema — stored as company_docs JSON rows, company-scoped. */
export const LOAN_DOC_SCHEMA = {
  collections: LOAN_COLLECTIONS,
  requiredOnEveryRow: ["id", "companyId"] as const,
} as const;

export type LoanCollectionName = (typeof LOAN_COLLECTIONS)[keyof typeof LOAN_COLLECTIONS];

export type LoanDocMap = {
  loans: Loan;
  loan_schedules: LoanScheduleRow;
  loan_transactions: LoanTransaction;
  loan_rate_history: LoanRateHistory;
  loan_charges: LoanCharge;
  loan_audit_logs: LoanAuditLog;
  loan_settings: LoanSettings;
  loan_documents: LoanDocument;
};

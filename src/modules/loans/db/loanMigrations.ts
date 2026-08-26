import { LOAN_COLLECTIONS } from "../constants/loanConstants";

/**
 * Loan module uses existing `company_docs` (SQLite) via `writeLoanEntity` (always local-first).
 * Online → sync_outbox → Firestore; PL Server → authoritative dispatch; Drive → cloud delta.
 *
 * Collections created on first write:
 *   loans, loan_schedules, loan_transactions, loan_rate_history,
 *   loan_charges, loan_audit_logs, loan_settings, loan_documents
 */
export const LOAN_MIGRATION_VERSION = 1;

export function loanCollectionNames(): string[] {
  return Object.values(LOAN_COLLECTIONS);
}

export function isLoanCollection(name: string): boolean {
  return loanCollectionNames().includes(name);
}

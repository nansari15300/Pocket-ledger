import { LOAN_LIABILITY_GROUP_ID } from "../constants/loanConstants";

/** Staff rows that are loan payable ledgers, not employees. */
export function isLoanLiabilityStaff(row: {
  groupId?: string | null;
  isLoanAccount?: boolean | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.isLoanAccount === true) return true;
  return String(row.groupId || "") === LOAN_LIABILITY_GROUP_ID;
}

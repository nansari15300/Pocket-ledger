import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { isLoanLiabilityStaff } from "@/modules/loans/utils/loanLiabilityStaff";

/** System branch for salary staff groups and employees (not loan ledgers). */
export const STAFF_SYSTEM_GROUP_ID = "staff_system";

/** Legacy seed pointed at chart root `liabilities`; staff tree parent is Loan & Liabilities. */
export function normalizeStaffSystemGroupParentId(parentId?: string | null): string {
  const pid = String(parentId ?? "").trim();
  if (!pid || pid === "liabilities" || pid === STAFF_SYSTEM_GROUP_ID) {
    return LOAN_LIABILITY_GROUP_ID;
  }
  return pid;
}

export function normalizeStaffSystemGroupRow<T extends { id: string; parentId?: string | null }>(
  group: T
): T {
  if (group.id !== STAFF_SYSTEM_GROUP_ID) return group;
  const nextParent = normalizeStaffSystemGroupParentId(group.parentId);
  if (nextParent === String(group.parentId ?? "").trim()) return group;
  return { ...group, parentId: nextParent };
}

export const STAFF_SYSTEM_GROUP_OPTIONS = [
  { id: LOAN_LIABILITY_GROUP_ID, name: "Loan & Liabilities" },
  { id: STAFF_SYSTEM_GROUP_ID, name: "Staff" },
] as const;

export type StaffAccountTypeId = (typeof STAFF_SYSTEM_GROUP_OPTIONS)[number]["id"];

export const STAFF_FORM_DEFAULT_ACCOUNT_TYPE_ID: StaffAccountTypeId = STAFF_SYSTEM_GROUP_ID;

export function isStaffSystemGroupId(id: string | null | undefined): boolean {
  return id === LOAN_LIABILITY_GROUP_ID || id === STAFF_SYSTEM_GROUP_ID;
}

export function staffAccountTypeFromRow(row: {
  groupId?: string | null;
  isLoanAccount?: boolean | null;
}): StaffAccountTypeId {
  if (isLoanLiabilityStaff(row)) return LOAN_LIABILITY_GROUP_ID;
  return STAFF_SYSTEM_GROUP_ID;
}

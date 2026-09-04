import type { MasterEntityGroupFormPreset } from "@/lib/masterEntityGroupFormPresets";
import {
  BANK_ENTITY_GROUP_PRESET,
  EXPENSE_ENTITY_GROUP_PRESET,
  ITEM_ENTITY_GROUP_PRESET,
  STAFF_ENTITY_GROUP_PRESET,
  TAX_ENTITY_GROUP_PRESET,
} from "@/lib/masterEntityGroupFormPresets";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { isLoanLiabilityStaff } from "@/modules/loans/utils/loanLiabilityStaff";
import { STAFF_SYSTEM_GROUP_ID } from "@/lib/staffSystemGroups";
import type { UngroupedEntityType } from "@/lib/writeGateway/legacy/ungrouped-groups";

export const BANK_SYSTEM_BANK_BRANCH_ID = "bank_accounts_group";
export const BANK_SYSTEM_CASH_BRANCH_ID = "cash_in_hand_group";

const LEGACY_UNGROUPED_IDS: Record<UngroupedEntityType, Set<string>> = {
  party: new Set(["ungrouped", "ungrouped_party"]),
  bank: new Set(["ungrouped", "ungrouped_account"]),
  staff: new Set(["ungrouped", "ungrouped_staff"]),
  tax: new Set(["ungrouped", "ungrouped_tax"]),
  item: new Set(["ungrouped", "ungrouped_item"]),
  expense: new Set(["ungrouped", "ungrouped_expense"]),
};

export function isMasterEntityLegacyUngroupedGroupId(
  kind: UngroupedEntityType,
  id?: string | null
): boolean {
  const g = String(id ?? "").trim();
  return !g || LEGACY_UNGROUPED_IDS[kind].has(g);
}

export function isMasterEntitySystemGroupId(
  preset: MasterEntityGroupFormPreset,
  id?: string | null
): boolean {
  const g = String(id ?? "").trim();
  return (
    preset.topParentOptions.some((b) => b.id === g) ||
    (preset.nestedSystemGroupIds?.includes(g) ?? false)
  );
}

export function buildMasterEntitySystemBranchSelectionGroup(
  preset: MasterEntityGroupFormPreset,
  branchId: string,
  companyId: string,
  balance = 0
): {
  id: string;
  name: string;
  companyId: string;
  balance: number;
  debit: number;
  credit: number;
  parentId: string;
  isSystemReserved: boolean;
} {
  const branch = preset.topParentOptions.find((b) => b.id === branchId);
  return {
    id: branchId,
    name: branch?.name ?? branchId,
    companyId,
    balance,
    debit: 0,
    credit: 0,
    parentId: "",
    isSystemReserved: true,
  };
}

export function resolveMasterEntityGroupForSelection<T extends { id: string }>(
  groupId: string | null | undefined,
  processedGroups: T[],
  preset: MasterEntityGroupFormPreset,
  companyId: string
): T | ReturnType<typeof buildMasterEntitySystemBranchSelectionGroup> | null {
  const gid = String(groupId ?? "").trim();
  if (!gid) return null;
  const found = processedGroups.find((g) => g.id === gid);
  if (found) return found;
  if (isMasterEntitySystemGroupId(preset, gid)) {
    return buildMasterEntitySystemBranchSelectionGroup(preset, gid, companyId);
  }
  return null;
}

export function getDefaultSystemGroupId(
  kind: UngroupedEntityType,
  context?: {
    accountType?: string | null;
    itemType?: string | null;
  }
): string {
  switch (kind) {
    case "party":
      return "sundry_creditors";
    case "bank":
      return context?.accountType === "Cash"
        ? BANK_SYSTEM_CASH_BRANCH_ID
        : BANK_SYSTEM_BANK_BRANCH_ID;
    case "staff":
      return context?.accountType === LOAN_LIABILITY_GROUP_ID
        ? LOAN_LIABILITY_GROUP_ID
        : STAFF_SYSTEM_GROUP_ID;
    case "tax":
      return TAX_ENTITY_GROUP_PRESET.defaultBranch;
    case "item":
      return context?.itemType === "service"
        ? "services"
        : ITEM_ENTITY_GROUP_PRESET.defaultBranch;
    case "expense":
      return context?.accountType === "Income"
        ? "income"
        : EXPENSE_ENTITY_GROUP_PRESET.defaultBranch;
    default:
      return "";
  }
}

export function normalizeBankGroupIdForStorage(
  id?: string | null,
  accountType?: string | null
): string {
  if (isMasterEntityLegacyUngroupedGroupId("bank", id)) {
    return getDefaultSystemGroupId("bank", { accountType });
  }
  const gid = String(id ?? "").trim();
  return gid || getDefaultSystemGroupId("bank", { accountType });
}

export function resolveBankListGroupBucketId(account: {
  groupId?: string | null;
  accountType?: string | null;
}): string {
  const gid = String(account.groupId ?? "").trim();
  if (isMasterEntitySystemGroupId(BANK_ENTITY_GROUP_PRESET, gid)) return gid;
  if (isMasterEntityLegacyUngroupedGroupId("bank", gid)) {
    return normalizeBankGroupIdForStorage(gid, account.accountType);
  }
  return gid;
}

export function normalizeStaffGroupIdForStorage(
  id?: string | null,
  accountType?: string | null
): string {
  if (isMasterEntityLegacyUngroupedGroupId("staff", id)) {
    return getDefaultSystemGroupId("staff", { accountType });
  }
  const gid = String(id ?? "").trim();
  return gid || getDefaultSystemGroupId("staff", { accountType });
}

export function resolveStaffListGroupBucketId(staff: {
  groupId?: string | null;
  isLoanAccount?: boolean | null;
}): string {
  const gid = String(staff.groupId ?? "").trim();
  if (isLoanLiabilityStaff(staff)) {
    if (isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, gid)) return gid;
    if (isMasterEntityLegacyUngroupedGroupId("staff", gid)) return LOAN_LIABILITY_GROUP_ID;
    return gid || LOAN_LIABILITY_GROUP_ID;
  }
  if (gid && !isMasterEntityLegacyUngroupedGroupId("staff", gid)) {
    if (gid === LOAN_LIABILITY_GROUP_ID) return STAFF_SYSTEM_GROUP_ID;
    return gid;
  }
  return STAFF_SYSTEM_GROUP_ID;
}

export function normalizeTaxGroupIdForStorage(id?: string | null): string {
  if (isMasterEntityLegacyUngroupedGroupId("tax", id)) {
    return TAX_ENTITY_GROUP_PRESET.defaultBranch;
  }
  const gid = String(id ?? "").trim();
  return gid || TAX_ENTITY_GROUP_PRESET.defaultBranch;
}

export function resolveTaxListGroupBucketId(tax: { groupId?: string | null }): string {
  const gid = String(tax.groupId ?? "").trim();
  if (isMasterEntitySystemGroupId(TAX_ENTITY_GROUP_PRESET, gid)) return gid;
  if (isMasterEntityLegacyUngroupedGroupId("tax", gid)) return TAX_ENTITY_GROUP_PRESET.defaultBranch;
  return gid;
}

export function normalizeItemGroupIdForStorage(
  id?: string | null,
  itemType?: string | null
): string {
  if (isMasterEntityLegacyUngroupedGroupId("item", id)) {
    return getDefaultSystemGroupId("item", { itemType });
  }
  const gid = String(id ?? "").trim();
  return gid || getDefaultSystemGroupId("item", { itemType });
}

export function resolveItemListGroupBucketId(item: {
  groupId?: string | null;
  type?: string | null;
}): string {
  const gid = String(item.groupId ?? "").trim();
  if (isMasterEntitySystemGroupId(ITEM_ENTITY_GROUP_PRESET, gid)) return gid;
  if (isMasterEntityLegacyUngroupedGroupId("item", gid)) {
    return normalizeItemGroupIdForStorage(gid, item.type);
  }
  return gid;
}

export function normalizeExpenseGroupIdForStorage(
  id?: string | null,
  accountType?: string | null
): string {
  if (isMasterEntityLegacyUngroupedGroupId("expense", id)) {
    return getDefaultSystemGroupId("expense", { accountType });
  }
  const gid = String(id ?? "").trim();
  return gid || getDefaultSystemGroupId("expense", { accountType });
}

export function resolveExpenseListGroupBucketId(account: {
  groupId?: string | null;
  type?: string | null;
}): string {
  const gid = String(account.groupId ?? "").trim();
  if (isMasterEntitySystemGroupId(EXPENSE_ENTITY_GROUP_PRESET, gid)) return gid;
  if (isMasterEntityLegacyUngroupedGroupId("expense", gid)) {
    return normalizeExpenseGroupIdForStorage(gid, account.type);
  }
  return gid;
}

export function appendMasterEntitySystemBranchGroups<G extends { id: string }>(
  userGroups: G[],
  preset: MasterEntityGroupFormPreset,
  companyId: string
): Array<G | ReturnType<typeof buildMasterEntitySystemBranchSelectionGroup>> {
  const synthetic = preset.topParentOptions.map((branch) =>
    buildMasterEntitySystemBranchSelectionGroup(preset, branch.id, companyId, 0)
  );
  return [...userGroups, ...synthetic];
}

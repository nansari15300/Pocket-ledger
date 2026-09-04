import type { Staff, StaffGroup } from "@/components/staff/types";
import { STAFF_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import {
  isMasterEntitySystemGroupId,
  resolveStaffListGroupBucketId,
} from "@/lib/masterEntitySystemGroups";
import { STAFF_SYSTEM_GROUP_ID } from "@/lib/staffSystemGroups";
import {
  LOAN_LIABILITY_GROUP_ID,
  LOAN_UNGROUPED_UI_ID,
} from "@/modules/loans/constants/loanConstants";
import { buildLoanGroupTree, type LoanGroupTree } from "@/modules/loans/utils/loanGroupTree";
import { filterMembersByMasterGroupScope } from "@/lib/masterGroupMemberScope";
import { isLoanLiabilityStaff } from "@/modules/loans/utils/loanLiabilityStaff";

export type StaffPageLiabilityGroupTree = LoanGroupTree & {
  systemGroups: StaffGroup[];
};

function sumBalances(rows: Staff[]) {
  return rows.reduce(
    (acc, row) => {
      acc.debit += Number(row.debit) || 0;
      acc.credit += Number(row.credit) || 0;
      acc.balance += Number(row.balance) || 0;
      return acc;
    },
    { debit: 0, credit: 0, balance: 0 }
  );
}

function withBranchParent(group: StaffGroup, parentId: string): StaffGroup {
  const existingParent = String(group.parentId || "").trim();
  if (existingParent && isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, existingParent)) {
    return group;
  }
  return { ...group, parentId };
}

/** Staff page Groups tab — Loan & Liabilities system branch with nested Staff + user groups. */
export function buildStaffPageLiabilityGroupTree(params: {
  processedStaff: Staff[];
  salaryGroups: StaffGroup[];
  staffGroupsMeta: StaffGroup[];
  companyId?: string;
}): StaffPageLiabilityGroupTree {
  const { processedStaff, salaryGroups, staffGroupsMeta, companyId = "" } = params;

  const loanAccounts = processedStaff.filter((row) => isLoanLiabilityStaff(row));
  const salaryStaff = processedStaff.filter((row) => !isLoanLiabilityStaff(row));

  const loanTree = buildLoanGroupTree({
    loanAccounts,
    staffGroups: staffGroupsMeta,
    companyId,
  });

  const childMap = new Map<string, StaffGroup>();
  const membersMap: Record<string, Staff[]> = {};

  const addChild = (group: StaffGroup, members: Staff[], branchId: string) => {
    const normalized = withBranchParent(group, branchId);
    const existing = childMap.get(normalized.id);
    if (existing) {
      const mergedMembers = [...(membersMap[normalized.id] || [])];
      for (const member of members) {
        if (!mergedMembers.some((row) => row.id === member.id)) mergedMembers.push(member);
      }
      membersMap[normalized.id] = mergedMembers;
      childMap.set(normalized.id, { ...existing, ...sumBalances(mergedMembers) });
      return;
    }
    childMap.set(normalized.id, { ...normalized, ...sumBalances(members) });
    membersMap[normalized.id] = [...members];
  };

  for (const group of loanTree.childGroups) {
    const loanMembers = loanTree.groupMembersByGroupId[group.id] || [];
    addChild(group, loanMembers, LOAN_LIABILITY_GROUP_ID);
  }

  for (const group of salaryGroups) {
    if (group.id === "ungrouped") continue;
    if (isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, group.id)) continue;
    const members = salaryStaff.filter(
      (row) => resolveStaffListGroupBucketId(row) === group.id
    );
    addChild(group, members, STAFF_SYSTEM_GROUP_ID);
  }

  const directLoanMembers = loanAccounts.filter(
    (row) => resolveStaffListGroupBucketId(row) === LOAN_LIABILITY_GROUP_ID
  );
  if (directLoanMembers.length > 0) {
    membersMap[LOAN_LIABILITY_GROUP_ID] = directLoanMembers;
  }

  const directSalaryMembers = salaryStaff.filter(
    (row) => resolveStaffListGroupBucketId(row) === STAFF_SYSTEM_GROUP_ID
  );
  if (directSalaryMembers.length > 0) {
    membersMap[STAFF_SYSTEM_GROUP_ID] = directSalaryMembers;
  }

  const childGroups = Array.from(childMap.values());

  for (const group of childGroups) {
    if (!membersMap[group.id]) membersMap[group.id] = [];
  }

  const loanBranchMeta = staffGroupsMeta.find((g) => g.id === LOAN_LIABILITY_GROUP_ID);
  const staffBranchMeta = staffGroupsMeta.find((g) => g.id === STAFF_SYSTEM_GROUP_ID);
  const loanBranchTotals = sumBalances(loanAccounts);
  const salaryBranchTotals = sumBalances(salaryStaff);

  const loanSystemGroup: StaffGroup = {
    id: LOAN_LIABILITY_GROUP_ID,
    name: String(loanBranchMeta?.name || "Loan & Liabilities").trim() || "Loan & Liabilities",
    companyId: loanBranchMeta?.companyId || companyId,
    ...loanBranchTotals,
  };

  const staffSystemGroup: StaffGroup = {
    id: STAFF_SYSTEM_GROUP_ID,
    name: String(staffBranchMeta?.name || "Staff").trim() || "Staff",
    companyId: staffBranchMeta?.companyId || companyId,
    parentId: LOAN_LIABILITY_GROUP_ID,
    isSystemReserved: true,
    ...salaryBranchTotals,
  };

  const loanChildGroups = Array.from(childMap.values()).filter(
    (g) => g.id !== STAFF_SYSTEM_GROUP_ID
  );
  const nestedChildGroups = [staffSystemGroup, ...loanChildGroups];

  const systemGroups = [loanSystemGroup];

  return {
    systemGroup: loanSystemGroup,
    systemGroups,
    childGroups: nestedChildGroups,
    groupMembersByGroupId: membersMap,
    allGroups: [loanSystemGroup, staffSystemGroup, ...loanChildGroups],
  };
}

export function staffMembersForGroupSelection(
  selectedGroupId: string | undefined,
  processedStaff: Staff[],
  tree: StaffPageLiabilityGroupTree
): Staff[] {
  if (!selectedGroupId) return [];
  if (selectedGroupId === LOAN_LIABILITY_GROUP_ID) {
    return processedStaff.filter((row) => isLoanLiabilityStaff(row));
  }
  if (selectedGroupId === STAFF_SYSTEM_GROUP_ID) {
    return processedStaff.filter((row) => !isLoanLiabilityStaff(row));
  }
  if (selectedGroupId === LOAN_UNGROUPED_UI_ID) {
    return tree.groupMembersByGroupId[LOAN_UNGROUPED_UI_ID] || [];
  }
  const isSystemGroupId = (id: string) =>
    isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, id) || id === LOAN_LIABILITY_GROUP_ID;
  return filterMembersByMasterGroupScope<Staff>(
    selectedGroupId,
    processedStaff,
    tree.allGroups,
    resolveStaffListGroupBucketId,
    isSystemGroupId
  );
}

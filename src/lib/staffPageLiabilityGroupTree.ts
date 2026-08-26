import type { Staff, StaffGroup } from "@/components/staff/types";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { buildLoanGroupTree, type LoanGroupTree } from "@/modules/loans/utils/loanGroupTree";
import { isLoanLiabilityStaff } from "@/modules/loans/utils/loanLiabilityStaff";

export type StaffPageLiabilityGroupTree = LoanGroupTree;

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

/** Staff page Groups tab — system parent Loan & Liabilities → salary groups + loan account groups. */
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

  const addChild = (group: StaffGroup, members: Staff[]) => {
    const existing = childMap.get(group.id);
    if (existing) {
      const mergedMembers = [...(membersMap[group.id] || [])];
      for (const member of members) {
        if (!mergedMembers.some((row) => row.id === member.id)) mergedMembers.push(member);
      }
      membersMap[group.id] = mergedMembers;
      childMap.set(group.id, { ...existing, ...sumBalances(mergedMembers) });
      return;
    }
    childMap.set(group.id, { ...group, ...sumBalances(members) });
    membersMap[group.id] = [...members];
  };

  for (const group of salaryGroups) {
    const members =
      group.id === "ungrouped"
        ? salaryStaff.filter((row) => !row.groupId || row.groupId === "ungrouped_staff")
        : salaryStaff.filter((row) => row.groupId === group.id);
    addChild(group, members);
  }

  for (const group of loanTree.childGroups) {
    const loanMembers = loanTree.groupMembersByGroupId[group.id] || [];
    addChild(group, loanMembers);
  }

  const childGroups = Array.from(childMap.values()).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );

  for (const group of childGroups) {
    if (!membersMap[group.id]) membersMap[group.id] = [];
  }

  const systemGroupRaw = staffGroupsMeta.find((g) => g.id === LOAN_LIABILITY_GROUP_ID);
  const systemGroup: StaffGroup = {
    id: LOAN_LIABILITY_GROUP_ID,
    name: "Loan & Liabilities",
    companyId: systemGroupRaw?.companyId || companyId,
    ...sumBalances(processedStaff),
  };

  return {
    systemGroup,
    childGroups,
    groupMembersByGroupId: membersMap,
    allGroups: [systemGroup, ...childGroups],
  };
}

export function staffMembersForGroupSelection(
  selectedGroupId: string | undefined,
  processedStaff: Staff[],
  tree: StaffPageLiabilityGroupTree
): Staff[] {
  if (!selectedGroupId) return [];
  if (selectedGroupId === LOAN_LIABILITY_GROUP_ID) return processedStaff;
  return tree.groupMembersByGroupId[selectedGroupId] || [];
}

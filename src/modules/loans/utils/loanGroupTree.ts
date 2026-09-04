import type { Staff, StaffGroup } from "@/components/staff/types";
import { filterMembersByMasterGroupScope } from "@/lib/masterGroupMemberScope";
import { STAFF_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import { isMasterEntitySystemGroupId, resolveStaffListGroupBucketId } from "@/lib/masterEntitySystemGroups";
import {
  LOAN_LIABILITY_GROUP_ID,
  LOAN_UNGROUPED_GROUP_ID,
  LOAN_UNGROUPED_UI_ID,
} from "../constants/loanConstants";

export function isLoanUngroupedAccount(account: { groupId?: string | null }): boolean {
  const gid = String(account.groupId || "").trim();
  return (
    !gid ||
    gid === LOAN_UNGROUPED_GROUP_ID ||
    gid === LOAN_UNGROUPED_UI_ID ||
    gid === LOAN_LIABILITY_GROUP_ID
  );
}

function sumBalances(accounts: Staff[]) {
  return accounts.reduce(
    (acc, row) => {
      acc.debit += Number(row.debit) || 0;
      acc.credit += Number(row.credit) || 0;
      acc.balance += Number(row.balance) || 0;
      return acc;
    },
    { debit: 0, credit: 0, balance: 0 }
  );
}

export type LoanGroupTree = {
  systemGroup: StaffGroup;
  childGroups: StaffGroup[];
  groupMembersByGroupId: Record<string, Staff[]>;
  allGroups: StaffGroup[];
};

/** System group → user groups → loan accounts (ungrouped bucket when no user group). */
export function buildLoanGroupTree(params: {
  loanAccounts: Staff[];
  staffGroups: StaffGroup[];
  companyId?: string;
}): LoanGroupTree {
  const { loanAccounts, staffGroups, companyId = "" } = params;

  const systemGroupRaw = staffGroups.find((g) => g.id === LOAN_LIABILITY_GROUP_ID);
  const totals = sumBalances(loanAccounts);
  const systemGroup: StaffGroup = {
    id: LOAN_LIABILITY_GROUP_ID,
    name: String(systemGroupRaw?.name || "Loans & Liabilities").trim() || "Loans & Liabilities",
    companyId: systemGroupRaw?.companyId || companyId,
    debit: totals.debit,
    credit: totals.credit,
    balance: totals.balance,
  };

  const userGroups = (() => {
    const seen = new Set<string>();
    const rows: StaffGroup[] = [];
    for (const account of loanAccounts) {
      const groupId = String(account.groupId || "").trim();
      if (!groupId || isLoanUngroupedAccount(account) || seen.has(groupId)) continue;
      seen.add(groupId);
      const members = loanAccounts.filter((acc) => acc.groupId === groupId);
      if (members.length === 0) continue;
      const meta = staffGroups.find((g) => g.id === groupId) as
        | (StaffGroup & { isAutoUngrouped?: boolean; isReportOnly?: boolean })
        | undefined;
      if (meta?.isAutoUngrouped || meta?.isReportOnly) continue;
      const stats = sumBalances(members);
      rows.push({
        ...(meta || {
          id: groupId,
          name: groupId,
          companyId: members[0]?.companyId || companyId,
        }),
        ...stats,
      });
    }
    return rows;
  })();

  const ungroupedMembers = loanAccounts.filter(isLoanUngroupedAccount);
  const childGroups: StaffGroup[] = [...userGroups];
  if (ungroupedMembers.length > 0) {
    const stats = sumBalances(ungroupedMembers);
    childGroups.push({
      id: LOAN_UNGROUPED_UI_ID,
      name: "Ungrouped",
      companyId: ungroupedMembers[0]?.companyId || companyId,
      ...stats,
    });
  }

  const groupMembersByGroupId: Record<string, Staff[]> = {};
  for (const group of userGroups) {
    groupMembersByGroupId[group.id] = loanAccounts.filter((acc) => acc.groupId === group.id);
  }
  if (ungroupedMembers.length > 0) {
    groupMembersByGroupId[LOAN_UNGROUPED_UI_ID] = ungroupedMembers;
  }

  return {
    systemGroup,
    childGroups,
    groupMembersByGroupId,
    allGroups: [systemGroup, ...childGroups],
  };
}

export function loanAccountsForGroupSelection(
  selectedGroupId: string | undefined,
  loanAccounts: Staff[],
  tree: LoanGroupTree
): Staff[] {
  if (!selectedGroupId) return [];
  if (selectedGroupId === LOAN_LIABILITY_GROUP_ID) return loanAccounts;
  if (selectedGroupId === LOAN_UNGROUPED_UI_ID) {
    return tree.groupMembersByGroupId[LOAN_UNGROUPED_UI_ID] || [];
  }
  return filterMembersByMasterGroupScope<Staff>(
    selectedGroupId,
    loanAccounts,
    tree.allGroups,
    resolveStaffListGroupBucketId,
    (id) => isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, id) || id === LOAN_LIABILITY_GROUP_ID
  );
}

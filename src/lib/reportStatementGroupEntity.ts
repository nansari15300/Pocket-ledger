/**
 * Report statement pages: group ledger entity must match master GroupDetails scope
 * (system branches + nested user groups), not direct groupId === only.
 */
import type { Party, Group } from "@/components/party/types";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import type { Staff, StaffGroup } from "@/components/staff/types";
import type { Tax, TaxGroup } from "@/components/tax/types";
import type { Item, ItemGroup } from "@/components/items/types";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { filterPartiesForPartyGroupScope, collectPartyGroupScopeBucketIds } from "@/lib/partyGroupScope";
import { filterMembersByMasterGroupScope } from "@/lib/masterGroupMemberScope";
import type { MasterGroupListRow } from "@/lib/masterGroupListTree";
import { IC_COMPANY_PARTY_GROUP_ID } from "@/lib/interCompany/icPeerCompanyGroups";
import {
  isMasterEntitySystemGroupId,
  resolveBankListGroupBucketId,
  resolveExpenseListGroupBucketId,
  resolveItemListGroupBucketId,
  resolveStaffListGroupBucketId,
  resolveTaxListGroupBucketId,
} from "@/lib/masterEntitySystemGroups";
import {
  BANK_ENTITY_GROUP_PRESET,
  EXPENSE_ENTITY_GROUP_PRESET,
  ITEM_ENTITY_GROUP_PRESET,
  STAFF_ENTITY_GROUP_PRESET,
  TAX_ENTITY_GROUP_PRESET,
} from "@/lib/masterEntityGroupFormPresets";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import {
  collectExpenseGroupScopeAccounts,
  collectExpenseGroupScopeGroupIds,
} from "@/lib/expenseGroupTree";

type GroupRow = MasterGroupListRow;

export function buildPartyGroupReportEntity(
  group: Group,
  args: {
    allParties: Party[];
    allGroups: Group[];
    processedAccounts: Account[];
    processedExpenseAccounts: ExpenseAccount[];
    processedAccountGroups: AccountGroup[];
    processedExpenseGroups: ExpenseGroup[];
    processedTaxGroups: TaxGroup[];
    processedStaffGroups: StaffGroup[];
    processedTaxes: Tax[];
    processedStaff: Staff[];
  }
): Group & { items: unknown[]; expenseGroupIds: string[] } {
  const partiesInGroup =
    group.id === IC_COMPANY_PARTY_GROUP_ID
      ? args.allParties
      : filterPartiesForPartyGroupScope(group.id, args.allParties, args.allGroups);

  const childGroups = args.allGroups.filter((g) => {
    const scopeIds = collectPartyGroupScopeBucketIds(group.id, args.allGroups);
    return scopeIds.has(g.id) && g.id !== group.id;
  });

  const groupIds = new Set([group.id, ...childGroups.map((g) => g.id)]);

  const accountGroupIds = args.processedAccountGroups
    .filter((ag) => {
      const parentId = String((ag as { parentId?: string }).parentId || "").trim();
      return parentId && groupIds.has(parentId);
    })
    .map((ag) => ag.id);

  const expenseGroupIdsNested = args.processedExpenseGroups
    .filter((eg) => {
      const parentId = String((eg as { parentId?: string }).parentId || "").trim();
      return parentId && groupIds.has(parentId);
    })
    .map((eg) => eg.id);

  const taxGroupIds = args.processedTaxGroups
    .filter((tg) => {
      const parentId = String((tg as { parentId?: string }).parentId || "").trim();
      return parentId && groupIds.has(parentId);
    })
    .map((tg) => tg.id);

  const staffGroupIds = args.processedStaffGroups
    .filter((sg) => {
      const parentId = String((sg as { parentId?: string }).parentId || "").trim();
      return parentId && groupIds.has(parentId);
    })
    .map((sg) => sg.id);

  const linkedAccounts = [
    ...args.processedAccounts.filter((acc) => acc.groupId && accountGroupIds.includes(acc.groupId)),
    ...args.processedExpenseAccounts.filter((acc) => acc.groupId && expenseGroupIdsNested.includes(acc.groupId)),
    ...args.processedTaxes.filter((tax) => tax.groupId && taxGroupIds.includes(tax.groupId)),
    ...args.processedStaff.filter((staff) => staff.groupId && staffGroupIds.includes(staff.groupId)),
  ];

  const expenseGroupIds = args.processedExpenseGroups
    .filter((eg) => {
      const parentId = String((eg as { parentId?: string }).parentId || "").trim();
      return parentId && groupIds.has(parentId);
    })
    .map((eg) => eg.id);

  return {
    ...group,
    items: [...partiesInGroup, ...linkedAccounts],
    expenseGroupIds,
  };
}

export function buildBankGroupReportEntity(
  group: AccountGroup,
  accounts: Account[],
  allGroups: GroupRow[]
): AccountGroup & { items: Account[] } {
  const items = filterMembersByMasterGroupScope<Account>(
    group.id,
    accounts,
    allGroups,
    resolveBankListGroupBucketId,
    (id) => isMasterEntitySystemGroupId(BANK_ENTITY_GROUP_PRESET, id),
    (account, branchId) => resolveBankListGroupBucketId(account) === branchId
  );
  return { ...group, items };
}

export function buildStaffGroupReportEntity(
  group: StaffGroup,
  staff: Staff[],
  allGroups: GroupRow[]
): StaffGroup & { items: Staff[] } {
  const items = filterMembersByMasterGroupScope<Staff>(
    group.id,
    staff,
    allGroups,
    resolveStaffListGroupBucketId,
    (id) => isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, id) || id === LOAN_LIABILITY_GROUP_ID
  );
  return { ...group, items };
}

export function buildTaxGroupReportEntity(
  group: TaxGroup,
  taxes: Tax[],
  allGroups: GroupRow[]
): TaxGroup & { items: Tax[] } {
  const items = filterMembersByMasterGroupScope<Tax>(
    group.id,
    taxes,
    allGroups,
    resolveTaxListGroupBucketId,
    (id) => isMasterEntitySystemGroupId(TAX_ENTITY_GROUP_PRESET, id),
    (tax, branchId) => resolveTaxListGroupBucketId(tax) === branchId
  );
  return { ...group, items };
}

export function buildItemGroupReportEntity(
  group: ItemGroup,
  items: Item[],
  allGroups: GroupRow[]
): ItemGroup & { items: Item[] } {
  const scoped = filterMembersByMasterGroupScope<Item>(
    group.id,
    items,
    allGroups,
    resolveItemListGroupBucketId,
    (id) => isMasterEntitySystemGroupId(ITEM_ENTITY_GROUP_PRESET, id),
    (item, branchId) => resolveItemListGroupBucketId(item) === branchId
  );
  return { ...group, items: scoped };
}

export function buildExpenseGroupReportEntity(
  group: ExpenseGroup,
  allGroups: ExpenseGroup[],
  allAccounts: ExpenseAccount[]
): ExpenseGroup & { items: ExpenseAccount[]; expenseGroupIds: string[] } {
  const items = collectExpenseGroupScopeAccounts(group.id, allGroups, allAccounts);
  const expenseGroupIds = collectExpenseGroupScopeGroupIds(group.id, allGroups);
  return { ...group, items, expenseGroupIds };
}

import type { BalanceSheetGroupHierarchyContext } from "@/lib/reports/balanceSheetGroupHierarchy";
import {
  balanceSheetSystemBranchExpandId,
  balanceSheetSystemGroupName,
  balanceSheetUserParentGroupName,
  balanceSheetUserSubGroupName,
  groupBalanceSheetItemsBySystemBranch,
  sortBalanceSheetExpandedGroupItems,
} from "@/lib/reports/balanceSheetGroupHierarchy";
import type { BalanceSheetRow } from "@/lib/reports/balanceSheetAccounting";
import {
  balanceSheetIcSearchText,
  isBalanceSheetIcCompanyGroupRow,
} from "@/lib/reports/balanceSheetInterCompany";

export function normalizeBalanceSheetSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function balanceSheetTextMatchesQuery(text: string, query: string): boolean {
  const q = normalizeBalanceSheetSearchQuery(query);
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

/** All visible labels for one group row + nested accounts (system / parent / sub / account). */
export function balanceSheetGroupSearchHaystack(
  row: BalanceSheetRow,
  ctx: BalanceSheetGroupHierarchyContext,
  getAccountsForGroup: (row: BalanceSheetRow) => BalanceSheetRow[],
  getIcPeerGroupsForCompany?: (row: BalanceSheetRow) => BalanceSheetRow[]
): string[] {
  const parts: string[] = [
    row.accountName,
    row.group,
    balanceSheetIcSearchText(row),
    balanceSheetSystemGroupName(row, ctx),
    balanceSheetUserParentGroupName(row, ctx),
    balanceSheetUserSubGroupName(row),
  ];

  if (isBalanceSheetIcCompanyGroupRow(row) && getIcPeerGroupsForCompany) {
    for (const peer of getIcPeerGroupsForCompany(row)) {
      parts.push(...balanceSheetGroupSearchHaystack(peer, ctx, getAccountsForGroup));
    }
  }

  for (const acc of getAccountsForGroup(row)) {
    parts.push(acc.accountName, acc.group, balanceSheetIcSearchText(acc));
    if (acc.isGroup) {
      parts.push(...balanceSheetGroupSearchHaystack(acc, ctx, getAccountsForGroup, getIcPeerGroupsForCompany));
    }
  }

  return parts.filter((s) => String(s || "").trim().length > 0);
}

export function balanceSheetGroupMatchesQuery(
  row: BalanceSheetRow,
  query: string,
  ctx: BalanceSheetGroupHierarchyContext,
  getAccountsForGroup: (row: BalanceSheetRow) => BalanceSheetRow[],
  getIcPeerGroupsForCompany?: (row: BalanceSheetRow) => BalanceSheetRow[]
): boolean {
  const q = normalizeBalanceSheetSearchQuery(query);
  if (!q) return true;
  return balanceSheetGroupSearchHaystack(row, ctx, getAccountsForGroup, getIcPeerGroupsForCompany).some(
    (s) => s.toLowerCase().includes(q)
  );
}

export function balanceSheetAccountMatchesQuery(acc: BalanceSheetRow, query: string): boolean {
  const q = normalizeBalanceSheetSearchQuery(query);
  if (!q) return true;
  return (
    balanceSheetTextMatchesQuery(acc.accountName, q) ||
    balanceSheetTextMatchesQuery(acc.group, q) ||
    balanceSheetIcSearchText(acc).includes(q)
  );
}

/** Expand main → system branch → parent → IC peer so search hits are visible. */
export function collectBalanceSheetSearchExpandIds(
  query: string,
  opts: {
    mainGroupRows: BalanceSheetRow[];
    getSubGroupsForMain: (mainCategory: string) => BalanceSheetRow[];
    getAccountsForGroup: (row: BalanceSheetRow) => BalanceSheetRow[];
    getIcPeerGroupsForCompany: (row: BalanceSheetRow) => BalanceSheetRow[];
    ctx: BalanceSheetGroupHierarchyContext;
  }
): Set<string> {
  const q = normalizeBalanceSheetSearchQuery(query);
  const ids = new Set<string>();
  if (!q) return ids;

  const { mainGroupRows, getSubGroupsForMain, getAccountsForGroup, getIcPeerGroupsForCompany, ctx } =
    opts;

  for (const main of mainGroupRows) {
    let mainHit = balanceSheetTextMatchesQuery(main.accountName, q);
    const subGroups = getSubGroupsForMain(main.category);
    const sortedItems = sortBalanceSheetExpandedGroupItems(subGroups, ctx);
    const systemBranches = groupBalanceSheetItemsBySystemBranch(sortedItems);

    for (const { systemGroupLabel, items } of systemBranches) {
      const sysExpandId = balanceSheetSystemBranchExpandId(main.accountId, systemGroupLabel);
      let branchHit = balanceSheetTextMatchesQuery(systemGroupLabel, q);

      for (const item of items) {
        const { row } = item;
        if (
          !balanceSheetGroupMatchesQuery(row, q, ctx, getAccountsForGroup, getIcPeerGroupsForCompany)
        ) {
          continue;
        }

        branchHit = true;
        mainHit = true;
        ids.add(sysExpandId);

        if (isBalanceSheetIcCompanyGroupRow(row)) {
          ids.add(row.accountId);
          for (const peer of getIcPeerGroupsForCompany(row)) {
            if (balanceSheetGroupMatchesQuery(peer, q, ctx, getAccountsForGroup)) {
              ids.add(peer.accountId);
            }
          }
          continue;
        }

        const parentLabel = balanceSheetUserParentGroupName(row, ctx);
        if (parentLabel.trim()) {
          ids.add(row.accountId);
        }
      }

      if (branchHit) {
        mainHit = true;
        ids.add(sysExpandId);
      }
    }

    if (mainHit) {
      ids.add(main.accountId);
    }
  }

  return ids;
}

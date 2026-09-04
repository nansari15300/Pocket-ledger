import {
  BANK_ACCOUNT_GROUP_LIST_CONFIG,
  PARTY_GROUP_LIST_CONFIG,
  STAFF_GROUP_LIST_CONFIG,
  TAX_GROUP_LIST_CONFIG,
} from "@/lib/masterGroupListConfigs";
import {
  resolveMasterGroupBranchForGroup,
  type MasterGroupListConfig,
  type MasterGroupListRow,
} from "@/lib/masterGroupListTree";
import type { BalanceSheetGroupRecord, BalanceSheetRow } from "@/lib/reports/balanceSheetAccounting";
import {
  BS_IC_COMPANY_GROUP_NAME,
  isBalanceSheetIcCompanyGroupRow,
  isBalanceSheetIcPeerGroupRow,
} from "@/lib/reports/balanceSheetInterCompany";

export type BalanceSheetGroupHierarchyContext = {
  processedGroups: BalanceSheetGroupRecord[];
  processedAccountGroups: BalanceSheetGroupRecord[];
  processedTaxGroups: BalanceSheetGroupRecord[];
  processedStaffGroups: BalanceSheetGroupRecord[];
};

type ParsedGroupRow = {
  entityKind: "party" | "account" | "tax" | "staff";
  groupId: string;
};

function parseBalanceSheetGroupRowId(accountId: string): ParsedGroupRow | null {
  const match = accountId.match(/^group_(party|account|tax|staff)_(.+)$/);
  if (!match) return null;
  return { entityKind: match[1] as ParsedGroupRow["entityKind"], groupId: match[2] };
}

function listRowFromRecord(g: BalanceSheetGroupRecord): MasterGroupListRow {
  return {
    id: g.id,
    name: g.name ?? g.id,
    parentId: g.parentId ?? "",
  };
}

function configForEntity(entityKind: ParsedGroupRow["entityKind"]): MasterGroupListConfig | null {
  switch (entityKind) {
    case "party":
      return PARTY_GROUP_LIST_CONFIG;
    case "account":
      return BANK_ACCOUNT_GROUP_LIST_CONFIG;
    case "tax":
      return TAX_GROUP_LIST_CONFIG;
    case "staff":
      return STAFF_GROUP_LIST_CONFIG;
    default:
      return null;
  }
}

function groupsForEntity(
  entityKind: ParsedGroupRow["entityKind"],
  ctx: BalanceSheetGroupHierarchyContext
): BalanceSheetGroupRecord[] {
  switch (entityKind) {
    case "party":
      return ctx.processedGroups;
    case "account":
      return ctx.processedAccountGroups;
    case "tax":
      return ctx.processedTaxGroups;
    case "staff":
      return ctx.processedStaffGroups;
    default:
      return [];
  }
}

function branchName(config: MasterGroupListConfig, branchId: string): string {
  return config.branches.find((b) => b.id === branchId)?.name ?? branchId;
}

function isSystemBranchGroupId(config: MasterGroupListConfig, groupId: string): boolean {
  return config.branches.some((b) => b.id === groupId);
}

/** Chart system branch (Sundry Debtors, Bank Accounts, Loan & Liabilities, …). */
export function balanceSheetSystemGroupName(
  row: BalanceSheetRow,
  ctx: BalanceSheetGroupHierarchyContext
): string {
  if (!row.isGroup) return "";

  if (row.balanceSheetBranchHint) {
    const config = PARTY_GROUP_LIST_CONFIG;
    return branchName(config, row.balanceSheetBranchHint);
  }

  const parsed = parseBalanceSheetGroupRowId(row.accountId);
  if (!parsed) return row.group || row.accountName;

  if (parsed.groupId === "equity") return "Equity";

  const config = configForEntity(parsed.entityKind);
  if (!config) return row.group || row.accountName;

  const collection = groupsForEntity(parsed.entityKind, ctx);
  const group = collection.find((g) => g.id === parsed.groupId);
  if (!group) return row.group || row.accountName;

  if (isSystemBranchGroupId(config, parsed.groupId)) {
    return branchName(config, parsed.groupId);
  }

  const allRows = collection.map(listRowFromRecord);
  const branchId = resolveMasterGroupBranchForGroup(listRowFromRecord(group), allRows, config);
  return branchName(config, branchId);
}

/** User-created group under the system branch (Customer & Supplier, IC Company, …). */
export function balanceSheetUserParentGroupName(
  row: BalanceSheetRow,
  ctx: BalanceSheetGroupHierarchyContext
): string {
  if (!row.isGroup) return "";

  if (isBalanceSheetIcCompanyGroupRow(row) || isBalanceSheetIcPeerGroupRow(row)) {
    return BS_IC_COMPANY_GROUP_NAME;
  }

  const parsed = parseBalanceSheetGroupRowId(row.accountId);
  const label = (row.group || row.accountName).trim();
  if (!label) return "";

  if (!parsed) return label;
  if (parsed.groupId === "equity") return label === "Equity" ? "" : label;

  const config = configForEntity(parsed.entityKind);
  if (!config) return label;

  if (isSystemBranchGroupId(config, parsed.groupId)) return "";

  const systemName = balanceSheetSystemGroupName(row, ctx);
  if (systemName && label.localeCompare(systemName, undefined, { sensitivity: "base" }) === 0) {
    return "";
  }

  return label;
}

/** IC peer company under IC Company (Nabiullah Home Hisab Only, …). */
export function balanceSheetUserSubGroupName(row: BalanceSheetRow): string {
  if (!row.isGroup) return "";
  if (isBalanceSheetIcPeerGroupRow(row)) return (row.accountName || row.group || "").trim();
  return "";
}

export type BalanceSheetExpandedGroupItem = {
  row: BalanceSheetRow;
  systemGroupLabel: string;
  parentGroupLabel: string;
  subGroupLabel: string;
};

/** No distinct user parent — accounts list directly under the system branch row. */
export function balanceSheetFlattenUnderSystemBranch(item: BalanceSheetExpandedGroupItem): boolean {
  return item.parentGroupLabel.trim() === "";
}

/** Sort by system branch, then user parent group — for serial listing under one system column. */
export function sortBalanceSheetExpandedGroupItems(
  subGroups: BalanceSheetRow[],
  ctx: BalanceSheetGroupHierarchyContext
): BalanceSheetExpandedGroupItem[] {
  const items = subGroups.map((row) => ({
    row,
    systemGroupLabel: balanceSheetSystemGroupName(row, ctx),
    parentGroupLabel: balanceSheetUserParentGroupName(row, ctx),
    subGroupLabel: balanceSheetUserSubGroupName(row),
  }));
  items.sort((a, b) => {
    const bySystem = a.systemGroupLabel.localeCompare(b.systemGroupLabel, undefined, {
      sensitivity: "base",
    });
    if (bySystem !== 0) return bySystem;
    const byParent = a.parentGroupLabel.localeCompare(b.parentGroupLabel, undefined, {
      sensitivity: "base",
    });
    if (byParent !== 0) return byParent;
    return a.subGroupLabel.localeCompare(b.subGroupLabel, undefined, { sensitivity: "base" });
  });
  return items;
}

/** First row of each system branch shows the name; following rows leave System Group blank. */
export function balanceSheetDisplaySystemGroupCell(
  systemGroupLabel: string,
  lastRenderedSystemKey: string
): { display: string; nextKey: string } {
  const key = systemGroupLabel.trim();
  if (!key || key === lastRenderedSystemKey) {
    return { display: "", nextKey: lastRenderedSystemKey };
  }
  return { display: key, nextKey: key };
}

export function balanceSheetSystemBranchExpandId(
  mainAccountId: string,
  systemGroupLabel: string
): string {
  return `bs-sys:${mainAccountId}:${systemGroupLabel.trim()}`;
}

export type BalanceSheetExpandedColumnFlags = {
  showParentGroup: boolean;
  showSubGroup: boolean;
  showAccountName: boolean;
};

export function balanceSheetExpandedLabelColCount(flags: BalanceSheetExpandedColumnFlags): number {
  return (
    1 +
    (flags.showParentGroup ? 1 : 0) +
    (flags.showSubGroup ? 1 : 0) +
    (flags.showAccountName ? 1 : 0)
  );
}

export function groupBalanceSheetItemsBySystemBranch(
  items: BalanceSheetExpandedGroupItem[]
): { systemGroupLabel: string; items: BalanceSheetExpandedGroupItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, BalanceSheetExpandedGroupItem[]>();
  for (const item of items) {
    const key = item.systemGroupLabel.trim();
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((systemGroupLabel) => ({
    systemGroupLabel,
    items: map.get(systemGroupLabel)!,
  }));
}

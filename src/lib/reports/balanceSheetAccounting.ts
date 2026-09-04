/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computeNetProfitFromExpenseLedgerBalances,
  computeNetProfitFromExpenseLedgerBalancesAsOf,
  computeNetProfitFromExpenseLedgerBalancesWithVouchers,
  ledgerBalanceAsOf,
  ledgerBalanceFromVouchers,
} from "@/lib/reports/financialSummary";
import type { RpLedgerContext } from "@/lib/receivablesPayablesLedgerAmounts";
import { normalizePartyGroupIdForStorage } from "@/lib/partySystemGroups";
import {
  normalizeBankGroupIdForStorage,
  normalizeStaffGroupIdForStorage,
  normalizeTaxGroupIdForStorage,
} from "@/lib/masterEntitySystemGroups";
import { staffAccountTypeFromRow } from "@/lib/staffSystemGroups";
import { isStaffModuleLiabilitySystemGroupId } from "@/lib/staffModuleSystemGroups";
import { applyBalanceSheetInterCompanyHierarchy } from "@/lib/reports/balanceSheetInterCompany";
import {
  collectMasterOpeningBalanceEntities,
  computeExpectedSystemOpeningBalance,
} from "@/lib/reports/systemOpeningBalanceEquity";
import { OPENING_BALANCE_SYSTEM_LEDGER_ID } from "@/lib/reports/openingBalanceLedgerAccounts";

export type BalanceSheetCategory = "Assets" | "Liabilities" | "Equity";

export type BalanceSheetEntityType =
  | "party"
  | "account"
  | "staff"
  | "tax"
  | "opening_balance";

export type BalanceSheetRow = {
  accountId: string;
  accountName: string;
  group: string;
  category: BalanceSheetCategory;
  /** Chart-of-accounts classification (not display column) */
  ledgerClass: "Asset" | "Liability" | "Equity";
  /** Positive display amount in the assigned column */
  amount: number;
  /** Raw ledger balance (Dr positive, Cr negative in app convention) */
  signedBalance: number;
  openingBalance?: number;
  isGroup?: boolean;
  entityType?: BalanceSheetEntityType;
  transactions?: any[];
  /** IC hierarchy — sundry_debtors / sundry_creditors system branch */
  balanceSheetBranchHint?: string;
  balanceSheetIcParentGroup?: string;
  balanceSheetIcPeerGroupKey?: string;
  isBalanceSheetIcCompanyGroup?: boolean;
  isBalanceSheetIcPeerGroup?: boolean;
};

export type BalanceSheetTotals = {
  assets: number;
  liab: number;
  equity: number;
  netProfit: number;
  totalLiabEquity: number;
  difference: number;
  isBalanced: boolean;
};

export type BalanceSheetGroupRecord = {
  id: string;
  name?: string;
  type?: string;
  parentId?: string;
};

export type BalanceSheetUncategorizedAccount = {
  accountId: string;
  accountName: string;
  signedBalance: number;
  entityType: BalanceSheetEntityType;
  groupLabel: string;
  reason: string;
};

export type BalanceSheetComputeInput = {
  processedAccounts: any[];
  processedParties: any[];
  processedStaff: any[];
  processedTaxes: any[];
  processedExpenseAccounts?: any[];
  processedExpenseGroups: BalanceSheetGroupRecord[];
  processedGroups: BalanceSheetGroupRecord[];
  processedAccountGroups: BalanceSheetGroupRecord[];
  processedTaxGroups: BalanceSheetGroupRecord[];
  processedStaffGroups: BalanceSheetGroupRecord[];
  /** Full company voucher list — balances derived from opening + vouchers (not lifetime hook balance). */
  vouchers: any[];
  processedTaxesForLedger: any[];
  /** Point-in-time cutoff (end of selected range). Omit = all vouchers, no future cutoff. */
  asOfDate?: Date;
};

export type BalanceSheetComputeResult = {
  rows: BalanceSheetRow[];
  uncategorized: BalanceSheetUncategorizedAccount[];
};

export type BalanceSheetRootClassification =
  | "Asset"
  | "Liability"
  | "Equity"
  | "Nominal"
  | "Unknown";

type RootClassification = BalanceSheetRootClassification;

const NOMINAL_GROUP_IDS = new Set([
  "income",
  "expenses",
  "direct_income",
  "indirect_income",
  "direct_expense",
  "indirect_expense",
]);

/** Chart roots live in `groups` — staff/tax/bank trees reference them via parentId. */
const CHART_ROOT_GROUPS: BalanceSheetGroupRecord[] = [
  { id: "assets", name: "Assets", type: "Asset" },
  { id: "liabilities", name: "Liabilities", type: "Liability" },
  { id: "equity", name: "Equity", type: "Equity" },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function mergeChartRootGroups(groups: BalanceSheetGroupRecord[]): BalanceSheetGroupRecord[] {
  const byId = new Map<string, BalanceSheetGroupRecord>();
  for (const g of groups) byId.set(g.id, g);
  for (const root of CHART_ROOT_GROUPS) {
    if (!byId.has(root.id)) byId.set(root.id, root);
  }
  return Array.from(byId.values());
}

function effectiveGroupIdForEntity(
  entityType: BalanceSheetEntityType,
  entity: { groupId?: string | null; accountType?: string | null; isLoanAccount?: boolean | null }
): string | undefined {
  const raw = entity.groupId ?? undefined;
  switch (entityType) {
    case "party":
    case "opening_balance":
      return normalizePartyGroupIdForStorage(raw);
    case "staff":
      return normalizeStaffGroupIdForStorage(raw, staffAccountTypeFromRow(entity));
    case "account":
      return normalizeBankGroupIdForStorage(raw, entity.accountType);
    case "tax":
      return normalizeTaxGroupIdForStorage(raw);
    default:
      return raw;
  }
}

function isLoanEntity(name: string, groupName: string, groupId: string): boolean {
  const text = `${name} ${groupName} ${groupId}`.toLowerCase();
  return text.includes("loan");
}

function isSuspenseAccountName(name: string): boolean {
  return name.toLowerCase().includes("suspense");
}

function buildGroupResolver(groups: BalanceSheetGroupRecord[]) {
  const byId = new Map<string, BalanceSheetGroupRecord>();
  for (const g of groups) byId.set(g.id, g);

  function resolveRoot(groupId: string | undefined): RootClassification {
    if (!groupId) return "Unknown";
    let current: string | undefined = groupId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (NOMINAL_GROUP_IDS.has(current)) return "Nominal";
      if (isStaffModuleLiabilitySystemGroupId(current)) return "Liability";
      const g = byId.get(current);
      if (!g) break;
      const type = String(g.type || "");
      const name = String(g.name || "").toLowerCase();
      if (current === "equity" || type === "Equity") return "Equity";
      if (current === "assets" || type === "Asset" || type === "Bank" || type === "Cash") {
        return "Asset";
      }
      if (current === "liabilities" || type === "Liability" || type === "Tax") {
        return "Liability";
      }
      if (
        name.includes("income") ||
        name.includes("expense") ||
        name.includes("sales") ||
        name.includes("purchase")
      ) {
        return "Nominal";
      }
      current = g.parentId;
    }
    return "Unknown";
  }

  function getGroupName(groupId: string | undefined): string {
    if (!groupId) return "Ungrouped";
    return byId.get(groupId)?.name || "Ungrouped";
  }

  return { resolveRoot, getGroupName };
}

function classifyEntity(
  groupId: string | undefined,
  entityName: string,
  resolver: ReturnType<typeof buildGroupResolver>
): RootClassification {
  if (isSuspenseAccountName(entityName)) {
    return resolver.resolveRoot(groupId);
  }
  const groupName = resolver.getGroupName(groupId);
  if (isLoanEntity(entityName, groupName, groupId || "")) {
    return "Liability";
  }
  const root = resolver.resolveRoot(groupId);
  if (root !== "Unknown") return root;
  return "Unknown";
}

function uncategorizedReason(groupId: string | undefined, resolver: ReturnType<typeof buildGroupResolver>): string {
  if (!groupId) {
    return "Missing account group assignment";
  }
  const groupName = resolver.getGroupName(groupId);
  return `Group "${groupName}" could not be mapped to Asset, Liability, or Equity`;
}

function entitySignedBalance(
  openingBalance: number,
  entityId: string,
  context: RpLedgerContext,
  input: BalanceSheetComputeInput
): number {
  const ob = Number(openingBalance) || 0;
  if (input.asOfDate) {
    return ledgerBalanceAsOf(
      ob,
      input.vouchers,
      entityId,
      context,
      input.asOfDate,
      input.processedTaxesForLedger
    );
  }
  return ledgerBalanceFromVouchers(
    ob,
    input.vouchers,
    entityId,
    context,
    input.processedTaxesForLedger
  );
}

/** Map ledger balance + classification to display column (never re-classify by sign alone). */
function toDisplayRow(
  base: Omit<BalanceSheetRow, "category" | "amount" | "ledgerClass"> & {
    signedBalance: number;
    ledgerClass: "Asset" | "Liability" | "Equity";
  },
  classification: RootClassification
): BalanceSheetRow | null {
  const signedBalance = round2(base.signedBalance);
  if (Math.abs(signedBalance) < 0.005) {
    if (classification !== "Equity") return null;
    if (!base.openingBalance) return null;
  }

  const ledgerClass = classification as "Asset" | "Liability" | "Equity";

  switch (classification) {
    case "Asset": {
      if (signedBalance >= 0) {
        return { ...base, ledgerClass, category: "Assets", amount: signedBalance, signedBalance };
      }
      return {
        ...base,
        ledgerClass,
        category: "Liabilities",
        amount: Math.abs(signedBalance),
        signedBalance,
      };
    }
    case "Liability": {
      if (signedBalance <= 0) {
        return {
          ...base,
          ledgerClass,
          category: "Liabilities",
          amount: Math.abs(signedBalance),
          signedBalance,
        };
      }
      return { ...base, ledgerClass, category: "Assets", amount: signedBalance, signedBalance };
    }
    case "Equity": {
      return {
        ...base,
        ledgerClass,
        category: "Equity",
        amount: Math.abs(signedBalance),
        signedBalance,
      };
    }
    default:
      return null;
  }
}

function assetSideContribution(classification: RootClassification, signedBalance: number): number {
  if (classification === "Asset") return signedBalance;
  if (classification === "Liability" && signedBalance > 0) return signedBalance;
  if (classification === "Liability" && signedBalance < 0) return 0;
  if (classification === "Equity" && signedBalance > 0) return 0;
  return 0;
}

function liabEquitySideContribution(
  classification: RootClassification,
  signedBalance: number
): number {
  if (classification === "Liability") return -signedBalance;
  if (classification === "Equity") return -signedBalance;
  if (classification === "Asset" && signedBalance < 0) return Math.abs(signedBalance);
  return 0;
}

export type BalanceSheetRowGapParts = {
  assetContrib: number;
  liabContrib: number;
  equityContrib: number;
  /** Contribution to (Assets − Liabilities − Equity) before net profit. */
  gapContribution: number;
};

/** Per-ledger contribution to Balance Sheet equation gap (Dr+ Asset / Liab+Equity columns). */
export function computeBalanceSheetRowGapParts(
  ledgerClass: "Asset" | "Liability" | "Equity",
  signedBalance: number
): BalanceSheetRowGapParts {
  const assetContrib = assetSideContribution(ledgerClass, signedBalance);
  const liabEq = liabEquitySideContribution(ledgerClass, signedBalance);
  let liabContrib = 0;
  let equityContrib = 0;
  if (ledgerClass === "Equity") {
    equityContrib = liabEq;
  } else if (ledgerClass === "Liability") {
    liabContrib = liabEq;
  } else if (ledgerClass === "Asset" && signedBalance < 0) {
    liabContrib = liabEq;
  }
  return {
    assetContrib: round2(assetContrib),
    liabContrib: round2(liabContrib),
    equityContrib: round2(equityContrib),
    gapContribution: round2(assetContrib - liabContrib - equityContrib),
  };
}

function buildIndividualRow(
  input: {
    accountId: string;
    accountName: string;
    groupId?: string;
    signedBalance: number;
    openingBalance?: number;
    entityType: BalanceSheetEntityType;
  },
  resolver: ReturnType<typeof buildGroupResolver>
): { row: BalanceSheetRow | null; uncategorized: BalanceSheetUncategorizedAccount | null } {
  const classification = classifyEntity(input.groupId, input.accountName, resolver);
  if (classification === "Nominal") {
    return { row: null, uncategorized: null };
  }
  if (classification === "Unknown") {
    if (Math.abs(input.signedBalance) < 0.005 && !input.openingBalance) {
      return { row: null, uncategorized: null };
    }
    return {
      row: null,
      uncategorized: {
        accountId: input.accountId,
        accountName: input.accountName,
        signedBalance: round2(input.signedBalance),
        entityType: input.entityType,
        groupLabel: resolver.getGroupName(input.groupId),
        reason: uncategorizedReason(input.groupId, resolver),
      },
    };
  }

  const row = toDisplayRow(
    {
      accountId: input.accountId,
      accountName: input.accountName,
      group: resolver.getGroupName(input.groupId),
      signedBalance: input.signedBalance,
      openingBalance: input.openingBalance,
      isGroup: false,
      entityType: input.entityType,
      ledgerClass: classification as "Asset" | "Liability" | "Equity",
    },
    classification
  );
  return { row, uncategorized: null };
}

function buildGroupTotalRow(
  groupKey: string,
  groupName: string,
  members: BalanceSheetRow[],
  entityType: BalanceSheetEntityType,
  classification: RootClassification
): BalanceSheetRow | null {
  if (members.length === 0) return null;
  const signedBalance = round2(members.reduce((sum, row) => sum + row.signedBalance, 0));
  if (Math.abs(signedBalance) < 0.005) return null;

  const display = toDisplayRow(
    {
      accountId: groupKey,
      accountName: groupName,
      group: groupName,
      signedBalance,
      openingBalance: 0,
      isGroup: true,
      entityType,
      ledgerClass: classification as "Asset" | "Liability" | "Equity",
    },
    classification
  );

  if (!display) return null;
  if (classification === "Equity") {
    return { ...display, category: "Equity" };
  }
  return display;
}

export function computeBalanceSheetReport(input: BalanceSheetComputeInput): BalanceSheetComputeResult {
  const partyResolver = buildGroupResolver(mergeChartRootGroups(input.processedGroups));
  const accountResolver = buildGroupResolver(mergeChartRootGroups(input.processedAccountGroups));
  const staffResolver = buildGroupResolver(mergeChartRootGroups(input.processedStaffGroups));
  const taxResolver = buildGroupResolver(mergeChartRootGroups(input.processedTaxGroups));

  const expectedSystemOpeningBalance = computeExpectedSystemOpeningBalance(
    collectMasterOpeningBalanceEntities({
      processedParties: input.processedParties,
      processedAccounts: input.processedAccounts,
      processedStaff: input.processedStaff,
      processedTaxes: input.processedTaxes,
      processedExpenseAccounts: input.processedExpenseAccounts ?? [],
    })
  );

  const individuals: BalanceSheetRow[] = [];
  const uncategorized: BalanceSheetUncategorizedAccount[] = [];

  const pushResult = (result: {
    row: BalanceSheetRow | null;
    uncategorized: BalanceSheetUncategorizedAccount | null;
  }) => {
    if (result.row) individuals.push(result.row);
    if (result.uncategorized) uncategorized.push(result.uncategorized);
  };

  for (const acc of input.processedAccounts) {
    pushResult(
      buildIndividualRow(
        {
          accountId: acc.id,
          accountName: acc.accountName || acc.name,
          groupId: effectiveGroupIdForEntity("account", acc),
          signedBalance: entitySignedBalance(
            acc.openingBalance,
            acc.id,
            "account",
            input
          ),
          openingBalance: Number(acc.openingBalance) || 0,
          entityType: "account",
        },
        accountResolver
      )
    );
  }

  for (const p of input.processedParties) {
    if (p.id === "opening_balance_ledger") {
      const result = buildIndividualRow(
        {
          accountId: p.id,
          accountName: p.name || "Opening Balance",
          groupId: effectiveGroupIdForEntity("opening_balance", p) || "equity",
          signedBalance: expectedSystemOpeningBalance,
          openingBalance: expectedSystemOpeningBalance,
          entityType: "opening_balance",
        },
        partyResolver
      );
      if (result.row) {
        individuals.push({ ...result.row, category: "Equity", group: "Equity", ledgerClass: "Equity" });
      } else if (result.uncategorized) {
        uncategorized.push(result.uncategorized);
      }
      continue;
    }

    pushResult(
      buildIndividualRow(
        {
          accountId: p.id,
          accountName: p.name,
          groupId: effectiveGroupIdForEntity("party", p),
          signedBalance: entitySignedBalance(p.openingBalance, p.id, "party", input),
          openingBalance: Number(p.openingBalance) || 0,
          entityType: "party",
        },
        partyResolver
      )
    );
  }

  for (const s of input.processedStaff) {
    pushResult(
      buildIndividualRow(
        {
          accountId: s.id,
          accountName: s.name,
          groupId: effectiveGroupIdForEntity("staff", s),
          signedBalance: entitySignedBalance(s.openingBalance, s.id, "staff", input),
          openingBalance: Number(s.openingBalance) || 0,
          entityType: "staff",
        },
        staffResolver
      )
    );
  }

  for (const t of input.processedTaxes) {
    pushResult(
      buildIndividualRow(
        {
          accountId: t.id,
          accountName: t.name,
          groupId: effectiveGroupIdForEntity("tax", t),
          signedBalance: entitySignedBalance(t.openingBalance, t.id, "tax", input),
          openingBalance: Number(t.openingBalance) || 0,
          entityType: "tax",
        },
        taxResolver
      )
    );
  }

  const groupRows: BalanceSheetRow[] = [];

  for (const group of input.processedAccountGroups) {
    if (accountResolver.resolveRoot(group.id) === "Nominal") continue;
    const members = individuals.filter(
      (r) => !r.isGroup && r.entityType === "account" && r.group === group.name
    );
    const classification = classifyEntity(group.id, group.name || "", accountResolver);
    if (classification === "Nominal" || classification === "Unknown") continue;
    const row = buildGroupTotalRow(
      `group_account_${group.id}`,
      group.name || group.id,
      members,
      "account",
      classification
    );
    if (row) groupRows.push(row);
  }

  for (const group of input.processedGroups) {
    if (group.id === "equity") continue;
    if (partyResolver.resolveRoot(group.id) === "Nominal") continue;
    const members = individuals.filter(
      (r) =>
        !r.isGroup &&
        r.entityType === "party" &&
        r.group === group.name &&
        r.accountId !== "opening_balance_ledger"
    );
    const classification = classifyEntity(group.id, group.name || "", partyResolver);
    if (classification === "Nominal" || classification === "Unknown") continue;
    const row = buildGroupTotalRow(
      `group_party_${group.id}`,
      group.name || group.id,
      members,
      "party",
      classification
    );
    if (row) groupRows.push(row);
  }

  const equityGroup = input.processedGroups.find((g) => g.id === "equity");
  if (equityGroup) {
    const members = individuals.filter(
      (r) =>
        !r.isGroup &&
        (r.entityType === "party" || r.entityType === "opening_balance") &&
        (r.group === equityGroup.name || r.group === "Equity" || r.category === "Equity")
    );
    const row = buildGroupTotalRow(
      "group_party_equity",
      equityGroup.name || "Equity",
      members,
      "party",
      "Equity"
    );
    if (row) groupRows.push({ ...row, category: "Equity" });
  }

  for (const group of input.processedTaxGroups) {
    if (taxResolver.resolveRoot(group.id) === "Nominal") continue;
    const members = individuals.filter(
      (r) => !r.isGroup && r.entityType === "tax" && r.group === group.name
    );
    const classification = classifyEntity(group.id, group.name || "", taxResolver);
    if (classification === "Nominal" || classification === "Unknown") continue;
    const row = buildGroupTotalRow(
      `group_tax_${group.id}`,
      group.name || group.id,
      members,
      "tax",
      classification
    );
    if (row) groupRows.push(row);
  }

  for (const group of input.processedStaffGroups) {
    if (staffResolver.resolveRoot(group.id) === "Nominal") continue;
    const members = individuals.filter(
      (r) => !r.isGroup && r.entityType === "staff" && r.group === group.name
    );
    const classification = classifyEntity(group.id, group.name || "", staffResolver);
    if (classification === "Nominal" || classification === "Unknown") continue;
    const row = buildGroupTotalRow(
      `group_staff_${group.id}`,
      group.name || group.id,
      members,
      "staff",
      classification
    );
    if (row) groupRows.push(row);
  }

  const rows = applyBalanceSheetInterCompanyHierarchy(
    [...individuals, ...groupRows],
    input.processedParties
  );
  return { rows, uncategorized };
}

/** @deprecated Use computeBalanceSheetReport */
export function computeBalanceSheetRows(input: BalanceSheetComputeInput): BalanceSheetRow[] {
  return computeBalanceSheetReport(input).rows;
}

export function computeBalanceSheetNetProfit(
  processedExpenseAccounts: any[],
  processedExpenseGroups: BalanceSheetGroupRecord[],
  vouchers: any[],
  processedTaxesForLedger: any[],
  asOfDate?: Date
): number {
  if (asOfDate) {
    return computeNetProfitFromExpenseLedgerBalancesAsOf(
      processedExpenseAccounts,
      processedExpenseGroups,
      vouchers,
      processedTaxesForLedger,
      asOfDate
    );
  }
  if (vouchers.length > 0) {
    return computeNetProfitFromExpenseLedgerBalancesWithVouchers(
      processedExpenseAccounts,
      processedExpenseGroups,
      vouchers,
      processedTaxesForLedger
    );
  }
  return computeNetProfitFromExpenseLedgerBalances(
    processedExpenseAccounts,
    processedExpenseGroups
  );
}

export function computeBalanceSheetTotals(
  rows: BalanceSheetRow[],
  netProfit: number
): BalanceSheetTotals {
  const individuals = rows.filter((r) => !r.isGroup);

  let assets = 0;
  let liab = 0;
  let equity = 0;

  for (const row of individuals) {
    assets += assetSideContribution(row.ledgerClass, row.signedBalance);
    const liabEq = liabEquitySideContribution(row.ledgerClass, row.signedBalance);
    if (row.ledgerClass === "Equity") {
      equity += liabEq;
    } else if (row.ledgerClass === "Liability") {
      liab += liabEq;
    } else if (row.ledgerClass === "Asset" && row.signedBalance < 0) {
      liab += liabEq;
    }
  }

  assets = round2(assets);
  liab = round2(liab);
  equity = round2(equity);
  const net = round2(netProfit);
  const totalLiabEquity = round2(liab + equity + net);
  const difference = round2(assets - totalLiabEquity);

  return {
    assets,
    liab,
    equity,
    netProfit: net,
    totalLiabEquity,
    difference,
    isBalanced: Math.abs(difference) < 0.02,
  };
}

export function computeOpeningBalanceAudit(entities: Array<{ openingBalance?: number }>) {
  let totalOpeningDr = 0;
  let totalOpeningCr = 0;

  for (const entity of entities) {
    const ob = Number(entity.openingBalance) || 0;
    if (ob > 0) totalOpeningDr += ob;
    else if (ob < 0) totalOpeningCr += Math.abs(ob);
  }

  return {
    totalOpeningDr: round2(totalOpeningDr),
    totalOpeningCr: round2(totalOpeningCr),
    diff: round2(totalOpeningDr - totalOpeningCr),
    isBalanced: Math.abs(totalOpeningDr - totalOpeningCr) < 0.02,
  };
}

/** Master OB only — excludes equity `opening_balance_ledger` (auto counter-entry). */
export function computeMasterOpeningBalanceAudit(
  entities: Array<{ id?: string; openingBalance?: number }>
) {
  return computeOpeningBalanceAudit(
    entities.filter((e) => e.id !== "opening_balance_ledger")
  );
}

export function readOpeningBalanceSystemLedger(
  parties: Array<{ id?: string; openingBalance?: number; name?: string }>
): { openingBalance: number; name: string } | null {
  const row = parties.find((p) => p.id === "opening_balance_ledger");
  if (!row) return null;
  const ob = round2(Number(row.openingBalance) || 0);
  if (Math.abs(ob) < 0.005) return null;
  return { openingBalance: ob, name: String(row.name || "Opening Balance") };
}

/** Deterministic system OB from current masters — used on Balance Sheet display. */
export function readExpectedOpeningBalanceSystemLedger(input: {
  processedParties: any[];
  processedAccounts: any[];
  processedStaff: any[];
  processedTaxes: any[];
  processedExpenseAccounts?: any[];
}): { openingBalance: number; name: string } | null {
  const expected = computeExpectedSystemOpeningBalance(
    collectMasterOpeningBalanceEntities({
      processedParties: input.processedParties,
      processedAccounts: input.processedAccounts,
      processedStaff: input.processedStaff,
      processedTaxes: input.processedTaxes,
      processedExpenseAccounts: input.processedExpenseAccounts ?? [],
    })
  );
  if (Math.abs(expected) < 0.005) return null;
  const row = input.processedParties.find((p) => p.id === OPENING_BALANCE_SYSTEM_LEDGER_ID);
  return {
    openingBalance: expected,
    name: String(row?.name || "Opening Balance"),
  };
}

/** Read-only classification for Check Engine teacher diagnostics — same rules as BS report. */
export function resolveBalanceSheetEntityClassification(
  input: Pick<
    BalanceSheetComputeInput,
    "processedGroups" | "processedAccountGroups" | "processedStaffGroups" | "processedTaxGroups"
  >,
  entityType: BalanceSheetEntityType,
  entity: {
    groupId?: string | null;
    name?: string;
    accountName?: string;
    accountType?: string | null;
    isLoanAccount?: boolean | null;
  }
): {
  classification: BalanceSheetRootClassification;
  groupId: string | undefined;
  groupName: string;
} {
  const groupsForType = (() => {
    switch (entityType) {
      case "account":
        return mergeChartRootGroups(input.processedAccountGroups);
      case "staff":
        return mergeChartRootGroups(input.processedStaffGroups);
      case "tax":
        return mergeChartRootGroups(input.processedTaxGroups);
      default:
        return mergeChartRootGroups(input.processedGroups);
    }
  })();
  const resolver = buildGroupResolver(groupsForType);
  const groupId = effectiveGroupIdForEntity(entityType, entity);
  const entityName = String(entity.accountName ?? entity.name ?? "");
  return {
    classification: classifyEntity(groupId, entityName, resolver),
    groupId,
    groupName: resolver.getGroupName(groupId),
  };
}

import type { BalanceSheetEntityType } from "@/lib/reports/balanceSheetAccounting";
import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";
import { computeBalanceSheetAccountGapTrace } from "@/lib/reports/balanceSheetAccountGapTrace";
import type { BalanceSheetCheckEngineInput } from "@/lib/reports/balanceSheetCheckEngine";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type ClosingAccountSection = "Assets" | "Liabilities" | "Equity" | "Excluded";

export type ClosingEntityFilter =
  | "all"
  | "party"
  | "account"
  | "staff"
  | "tax"
  | "opening_balance"
  | "excluded";

export const CLOSING_ENTITY_FILTER_ORDER: ClosingEntityFilter[] = [
  "all",
  "party",
  "account",
  "staff",
  "tax",
  "opening_balance",
  "excluded",
];

export const CLOSING_ENTITY_FILTER_LABELS: Record<ClosingEntityFilter, string> = {
  all: "All",
  party: "Party",
  account: "Bank/Cash",
  staff: STAFF_ENTITY_LABEL,
  tax: "Tax",
  opening_balance: "Opening balance",
  excluded: "Excluded",
};

export type ClosingAccountRow = {
  accountId: string;
  accountName: string;
  group: string;
  section: ClosingAccountSection;
  entityType?: BalanceSheetEntityType;
  dr: number;
  cr: number;
  signedBalance: number;
  runningBalance: number;
};

export type ClosingAccountSectionGroup = {
  section: ClosingAccountSection;
  label: string;
  rows: ClosingAccountRow[];
  totalDr: number;
  totalCr: number;
};

const SECTION_ORDER: ClosingAccountSection[] = [
  "Assets",
  "Liabilities",
  "Equity",
  "Excluded",
];

const SECTION_LABELS: Record<ClosingAccountSection, string> = {
  Assets: "Assets",
  Liabilities: "Liabilities",
  Equity: "Equity",
  Excluded: "Excluded from Balance Sheet",
};

/** All ledgers with non-zero closing — Dr/Cr columns + cumulative running balance. */
export function buildBalanceSheetClosingAccountRows(
  input: BalanceSheetCheckEngineInput
): ClosingAccountRow[] {
  const trace = computeBalanceSheetAccountGapTrace(input);
  const raw: Array<Omit<ClosingAccountRow, "runningBalance">> = [];

  for (const account of trace.accounts) {
    const signedBalance = round2(account.signedBalance);
    if (Math.abs(signedBalance) < 0.005) continue;
    raw.push({
      accountId: account.accountId,
      accountName: account.accountName,
      group: account.group,
      entityType: account.entityType,
      section:
        account.ledgerClass === "Asset"
          ? "Assets"
          : account.ledgerClass === "Liability"
            ? "Liabilities"
            : "Equity",
      dr: signedBalance > 0.005 ? signedBalance : 0,
      cr: signedBalance < -0.005 ? Math.abs(signedBalance) : 0,
      signedBalance,
    });
  }

  for (const item of trace.uncategorized) {
    const signedBalance = round2(item.signedBalance);
    if (Math.abs(signedBalance) < 0.005) continue;
    raw.push({
      accountId: item.accountName,
      accountName: item.accountName,
      group: item.groupLabel,
      section: "Excluded",
      dr: signedBalance > 0.005 ? signedBalance : 0,
      cr: signedBalance < -0.005 ? Math.abs(signedBalance) : 0,
      signedBalance,
    });
  }

  raw.sort((a, b) => a.accountName.localeCompare(b.accountName));

  return applyClosingRunningBalance(raw);
}

export function applyClosingRunningBalance(
  rows: Array<Omit<ClosingAccountRow, "runningBalance">>
): ClosingAccountRow[] {
  let running = 0;
  return rows.map((row) => {
    running = round2(running + row.dr - row.cr);
    return { ...row, runningBalance: running };
  });
}

export function closingEntityFilterKey(row: ClosingAccountRow): ClosingEntityFilter {
  if (row.section === "Excluded") return "excluded";
  if (row.entityType === "party") return "party";
  if (row.entityType === "account") return "account";
  if (row.entityType === "staff") return "staff";
  if (row.entityType === "tax") return "tax";
  if (row.entityType === "opening_balance") return "opening_balance";
  return "excluded";
}

export function filterClosingAccountRows(
  rows: ClosingAccountRow[],
  filter: ClosingEntityFilter
): ClosingAccountRow[] {
  if (filter === "all") return rows;
  if (filter === "excluded") {
    return applyClosingRunningBalance(rows.filter((row) => row.section === "Excluded"));
  }
  return applyClosingRunningBalance(
    rows.filter((row) => row.section !== "Excluded" && row.entityType === filter)
  );
}

export function countClosingAccountRowsByEntity(
  rows: ClosingAccountRow[]
): Record<ClosingEntityFilter, number> {
  const counts: Record<ClosingEntityFilter, number> = {
    all: rows.length,
    party: 0,
    account: 0,
    staff: 0,
    tax: 0,
    opening_balance: 0,
    excluded: 0,
  };
  for (const row of rows) {
    const key = closingEntityFilterKey(row);
    counts[key] += 1;
  }
  return counts;
}

export function groupClosingAccountRows(rows: ClosingAccountRow[]): ClosingAccountSectionGroup[] {
  return SECTION_ORDER.map((section) => {
    const sectionRows = rows.filter((row) => row.section === section);
    return {
      section,
      label: SECTION_LABELS[section],
      rows: sectionRows,
      totalDr: round2(sectionRows.reduce((sum, row) => sum + row.dr, 0)),
      totalCr: round2(sectionRows.reduce((sum, row) => sum + row.cr, 0)),
    };
  }).filter((group) => group.rows.length > 0);
}

export function closingAccountGrandTotals(rows: ClosingAccountRow[]) {
  const totalDr = round2(rows.reduce((sum, row) => sum + row.dr, 0));
  const totalCr = round2(rows.reduce((sum, row) => sum + row.cr, 0));
  const finalRunning = rows.length > 0 ? rows[rows.length - 1]!.runningBalance : 0;
  return { totalDr, totalCr, finalRunning, count: rows.length };
}

import type {
  ReceivablesPayablesFinancialSummary,
  RpEntityRow,
} from "@/lib/receivablesPayablesFinancialSummary";
import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";
import {
  isInterCompanyAccountClearingPartyName,
  readInterCompanyClearingMode,
} from "@/lib/interCompany/interCompanyCounterpartyPartyName";
import {
  icPeerCompanyGroupId,
  icPeerCompanyGroupSecondaryLabel,
  interCompanyClearingAccountDisplayName,
} from "@/lib/interCompany/icPeerCompanyGroups";

export type RpCategoryFilter =
  | "all"
  | "party"
  | "bank"
  | "staff"
  | "tax";

export type RpEntityKind = "party" | "bank" | "staff" | "tax" | "income" | "expense";

export type RpDialogRow = {
  party: string;
  balance: number;
  fileUrl?: string;
  kind: RpEntityKind;
  entityId: string;
  /** IC peer company group — nested IC Account rows (party list jaisa). */
  isIcPeerCompanyGroup?: boolean;
  secondaryLabel?: string;
  icChildren?: RpDialogRow[];
  interCompanyPeerCompanyId?: string;
  interCompanyPeerCompanyName?: string;
  interCompanyPeerEntityLabel?: string;
};

export type RpDialogSection = {
  kind: RpEntityKind;
  label: string;
  rows: RpDialogRow[];
  /** Leaf account count — IC tree me company group ke andar ke accounts bhi ginne hain. */
  rowCount: number;
};

export const RP_DIALOG_FILTER_OPTIONS: { id: RpCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "party", label: "Party" },
  { id: "bank", label: "Bank/Cash" },
  { id: "staff", label: STAFF_ENTITY_LABEL },
  { id: "tax", label: "Tax" },
];

/** Outstanding dialog — Party / Bank / Staff / Tax only (Income/Expense P&L heads, len-den nahi). */
const CATEGORY_META: { kind: RpEntityKind; label: string; filter: RpCategoryFilter }[] = [
  { kind: "party", label: "Party", filter: "party" },
  { kind: "bank", label: "Bank / Cash", filter: "bank" },
  { kind: "staff", label: STAFF_ENTITY_LABEL, filter: "staff" },
  { kind: "tax", label: "Tax", filter: "tax" },
];

const notOB = (p: { party: string }) => p.party !== "Opening Balance";

function isIcAccountClearingPartyRow(row: {
  party: string;
  entityId?: string;
  interCompanyClearingMode?: string;
}): boolean {
  if (
    readInterCompanyClearingMode({
      id: row.entityId,
      name: row.party,
      interCompanyClearingMode: row.interCompanyClearingMode,
    }) === "account"
  ) {
    return true;
  }
  return isInterCompanyAccountClearingPartyName(row.party);
}

function toRpDialogRow(row: RpEntityRow, kind: RpEntityKind): RpDialogRow {
  return {
    party: row.party,
    balance: row.balance,
    fileUrl: row.fileUrl,
    kind,
    entityId: row.entityId,
    interCompanyPeerCompanyId: row.interCompanyPeerCompanyId,
    interCompanyPeerCompanyName: row.interCompanyPeerCompanyName,
    interCompanyPeerEntityLabel: row.interCompanyPeerEntityLabel,
  };
}

/** IC Account clearing parties → peer company tree (company name → account names). */
function groupIcAccountPartyRowsForRpDialog(rows: RpDialogRow[]): RpDialogRow[] {
  const regular: RpDialogRow[] = [];
  const icAccounts: RpDialogRow[] = [];
  for (const row of rows) {
    if (isIcAccountClearingPartyRow(row)) icAccounts.push(row);
    else regular.push(row);
  }
  if (icAccounts.length === 0) return rows;

  const buckets = new Map<
    string,
    { peerCompanyId: string; peerCompanyName: string; members: RpDialogRow[] }
  >();
  for (const row of icAccounts) {
    const peerCompanyId = String(row.interCompanyPeerCompanyId || "").trim();
    const peerCompanyName = String(row.interCompanyPeerCompanyName || "").trim() || "Company";
    const bucketKey = peerCompanyId || peerCompanyName.toLowerCase();
    const prev = buckets.get(bucketKey);
    if (prev) prev.members.push(row);
    else buckets.set(bucketKey, { peerCompanyId, peerCompanyName, members: [row] });
  }

  const icGroups: RpDialogRow[] = [];
  for (const bucket of buckets.values()) {
    const children = bucket.members
      .map((member) => ({
        ...member,
        party: interCompanyClearingAccountDisplayName({
          name: member.party,
          interCompanyPeerEntityLabel: member.interCompanyPeerEntityLabel,
        } as Parameters<typeof interCompanyClearingAccountDisplayName>[0]),
      }))
      .sort((a, b) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0));
    const balance = children.reduce((sum, child) => sum + (Number(child.balance) || 0), 0);
    icGroups.push({
      party: bucket.peerCompanyName,
      balance,
      kind: "party",
      entityId: icPeerCompanyGroupId(bucket.peerCompanyId, bucket.peerCompanyName),
      isIcPeerCompanyGroup: true,
      secondaryLabel: icPeerCompanyGroupSecondaryLabel(children.length),
      interCompanyPeerCompanyId: bucket.peerCompanyId,
      interCompanyPeerCompanyName: bucket.peerCompanyName,
      icChildren: children,
    });
  }

  return [...regular, ...icGroups].sort(
    (a, b) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0)
  );
}

function flattenRpDialogRows(rows: RpDialogRow[]): RpDialogRow[] {
  const out: RpDialogRow[] = [];
  for (const row of rows) {
    if (row.isIcPeerCompanyGroup && row.icChildren?.length) out.push(...row.icChildren);
    else out.push(row);
  }
  return out;
}

function rpDialogLeafCount(rows: RpDialogRow[]): number {
  return flattenRpDialogRows(rows).length;
}

function includeCategory(filter: RpCategoryFilter, kind: RpEntityKind): boolean {
  if (filter === "all") return true;
  return filter === kind;
}

function rowsForKind(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  kind: RpEntityKind
): RpDialogRow[] {
  const bucket = summary[side];
  const raw =
    kind === "party"
      ? bucket.parties
      : kind === "bank"
        ? bucket.accounts
        : kind === "staff"
          ? bucket.staff
          : kind === "tax"
            ? bucket.taxes
            : kind === "income"
              ? bucket.income
              : bucket.expenses;
  const mapped = raw.filter(notOB).map((p) => toRpDialogRow(p, kind));
  const sorted = mapped.sort(
    (a, b) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0)
  );
  if (kind === "party") return groupIcAccountPartyRowsForRpDialog(sorted);
  return sorted;
}

/** Receivables / Payables dialog: category headers + sorted rows. */
export function buildRpDialogSections(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  filter: RpCategoryFilter
): RpDialogSection[] {
  return CATEGORY_META.filter((c) => includeCategory(filter, c.kind)).map(({ kind, label }) => {
    const rows = rowsForKind(side, summary, kind);
    return {
      kind,
      label,
      rows,
      rowCount: rpDialogLeafCount(rows),
    };
  });
}

/** Flat rows (print / legacy) — category order preserved, amount desc within each group. */
export function buildRpDialogRowsFlat(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  filter: RpCategoryFilter
): RpDialogRow[] {
  return flattenRpDialogRows(buildRpDialogSections(side, summary, filter).flatMap((s) => s.rows));
}

export function sumRpDialogSide(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  filter: RpCategoryFilter
): number {
  const rows = buildRpDialogRowsFlat(side, summary, filter);
  if (side === "receivables") {
    return rows.reduce((s, p) => s + (Number(p.balance) || 0), 0);
  }
  return rows.reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0);
}

export function countRpDialogSide(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  filter: RpCategoryFilter
): number {
  return buildRpDialogRowsFlat(side, summary, filter).length;
}

function migrateLegacySideBuckets(raw: Record<string, unknown>) {
  const legacyTaxIncome = Array.isArray(raw.taxIncomeExpense)
    ? raw.taxIncomeExpense
    : Array.isArray(raw.taxes)
      ? raw.taxes
      : [];
  return {
    parties: Array.isArray(raw.parties) ? raw.parties : [],
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    staff: Array.isArray(raw.staff) ? raw.staff : [],
    taxes: Array.isArray(raw.taxes) ? raw.taxes : [],
    income: Array.isArray(raw.income) ? raw.income : [],
    expenses: Array.isArray(raw.expenses)
      ? raw.expenses
      : legacyTaxIncome.length > 0
        ? legacyTaxIncome
        : [],
  };
}

/** Server / purana payload migrate — `taxIncomeExpense` → `expenses` fallback. */
export function normalizeReceivablesPayablesSummary(
  raw: ReceivablesPayablesFinancialSummary | null | undefined
): ReceivablesPayablesFinancialSummary {
  if (!raw) {
    return {
      totalReceivable: 0,
      totalPayable: 0,
      receivables: { parties: [], accounts: [], staff: [], taxes: [], income: [], expenses: [] },
      payables: { parties: [], accounts: [], staff: [], taxes: [], income: [], expenses: [] },
      recCount: 0,
      payCount: 0,
    };
  }
  const receivables = migrateLegacySideBuckets(raw.receivables as Record<string, unknown>);
  const payables = migrateLegacySideBuckets(raw.payables as Record<string, unknown>);
  const recCount =
    receivables.parties.length +
    receivables.accounts.length +
    receivables.staff.length +
    receivables.taxes.length +
    receivables.income.length +
    receivables.expenses.length;
  const payCount =
    payables.parties.length +
    payables.accounts.length +
    payables.staff.length +
    payables.taxes.length +
    payables.income.length +
    payables.expenses.length;
  return {
    ...raw,
    receivables,
    payables,
    recCount,
    payCount,
  };
}

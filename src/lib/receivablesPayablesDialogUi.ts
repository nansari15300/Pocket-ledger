import type { ReceivablesPayablesFinancialSummary } from "@/lib/receivablesPayablesFinancialSummary";
import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";

export type RpCategoryFilter =
  | "all"
  | "party"
  | "bank"
  | "staff"
  | "tax"
  | "income"
  | "expense";

export type RpEntityKind = "party" | "bank" | "staff" | "tax" | "income" | "expense";

export type RpDialogRow = {
  party: string;
  balance: number;
  fileUrl?: string;
  kind: RpEntityKind;
  entityId: string;
};

export type RpDialogSection = {
  kind: RpEntityKind;
  label: string;
  rows: RpDialogRow[];
};

export const RP_DIALOG_FILTER_OPTIONS: { id: RpCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "party", label: "Party" },
  { id: "bank", label: "Bank/Cash" },
  { id: "staff", label: STAFF_ENTITY_LABEL },
  { id: "tax", label: "Tax" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expense" },
];

const CATEGORY_META: { kind: RpEntityKind; label: string; filter: RpCategoryFilter }[] = [
  { kind: "party", label: "Party", filter: "party" },
  { kind: "bank", label: "Bank / Cash", filter: "bank" },
  { kind: "staff", label: STAFF_ENTITY_LABEL, filter: "staff" },
  { kind: "tax", label: "Tax", filter: "tax" },
  { kind: "income", label: "Income", filter: "income" },
  { kind: "expense", label: "Expense", filter: "expense" },
];

const notOB = (p: { party: string }) => p.party !== "Opening Balance";

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
  return raw
    .filter(notOB)
    .map((p) => ({ ...p, kind, entityId: p.entityId }))
    .sort((a, b) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0));
}

/** Receivables / Payables dialog: category headers + sorted rows. */
export function buildRpDialogSections(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  filter: RpCategoryFilter
): RpDialogSection[] {
  return CATEGORY_META.filter((c) => includeCategory(filter, c.kind)).map(({ kind, label }) => ({
    kind,
    label,
    rows: rowsForKind(side, summary, kind),
  }));
}

/** Flat rows (print / legacy) — category order preserved, amount desc within each group. */
export function buildRpDialogRowsFlat(
  side: "receivables" | "payables",
  summary: ReceivablesPayablesFinancialSummary,
  filter: RpCategoryFilter
): RpDialogRow[] {
  return buildRpDialogSections(side, summary, filter).flatMap((s) => s.rows);
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

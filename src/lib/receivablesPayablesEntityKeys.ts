import type { RpEntityKind } from "@/lib/receivablesPayablesDialogUi";
import type {
  ReceivablesPayablesFinancialSummary,
  RpSideBuckets,
} from "@/lib/receivablesPayablesFinancialSummary";

/** Outstanding visibility — category tick (individual account nahi). */
export type RpVisibilityCategory = "party" | "bank" | "staff" | "tax" | "income_expense";

export const RP_VISIBILITY_CATEGORIES: { id: RpVisibilityCategory; label: string }[] = [
  { id: "party", label: "Party" },
  { id: "bank", label: "Bank / Cash" },
  { id: "staff", label: "Staff" },
  { id: "tax", label: "Tax" },
  { id: "income_expense", label: "Income / Expense" },
];

/** Naya company / saved setting nahi: Income & Expense hide (untick). */
export const DEFAULT_RP_HIDDEN_CATEGORIES: RpVisibilityCategory[] = ["income_expense"];

export function resolveRpHiddenCategories(
  saved: string[] | null | undefined
): Set<RpVisibilityCategory> {
  if (saved === undefined || saved === null) {
    return new Set(DEFAULT_RP_HIDDEN_CATEGORIES);
  }
  const valid = new Set(RpVisibilityCategory_VALUES);
  return new Set(saved.filter((c): c is RpVisibilityCategory => valid.has(c as RpVisibilityCategory)));
}

const RpVisibilityCategory_VALUES = RP_VISIBILITY_CATEGORIES.map((c) => c.id);

export function resolveRpEntityName(entity: Record<string, unknown>, kind: RpEntityKind): string {
  if (kind === "bank") {
    return String(entity.accountName || entity.name || "").trim() || "—";
  }
  return String(entity.name || entity.accountName || "").trim() || "—";
}

function filterSideByCategories(side: RpSideBuckets, hidden: Set<RpVisibilityCategory>): RpSideBuckets {
  return {
    parties: hidden.has("party") ? [] : side.parties,
    accounts: hidden.has("bank") ? [] : side.accounts,
    staff: hidden.has("staff") ? [] : side.staff,
    taxes: hidden.has("tax") ? [] : side.taxes,
    income: hidden.has("income_expense") ? [] : side.income,
    expenses: hidden.has("income_expense") ? [] : side.expenses,
  };
}

/** Company-level hidden categories — dashboard + dialog dono par apply. */
export function filterReceivablesPayablesSummaryByVisibility(
  summary: ReceivablesPayablesFinancialSummary,
  hiddenCategories: Iterable<RpVisibilityCategory> | null | undefined
): ReceivablesPayablesFinancialSummary {
  const hidden = new Set(hiddenCategories ?? []);
  if (hidden.size === 0) return summary;

  const receivables = filterSideByCategories(summary.receivables, hidden);
  const payables = filterSideByCategories(summary.payables, hidden);

  const calcSum = (arr: { balance: number }[]) => arr.reduce((sum, item) => sum + item.balance, 0);
  const calcPaySum = (arr: { balance: number }[]) =>
    arr.reduce((sum, item) => sum + Math.abs(item.balance), 0);

  const bucketSum = (side: RpSideBuckets, calc: (arr: { balance: number }[]) => number) =>
    calc(side.parties) +
    calc(side.accounts) +
    calc(side.staff) +
    calc(side.taxes) +
    calc(side.income) +
    calc(side.expenses);

  const totalReceivable = bucketSum(receivables, calcSum);
  const totalPayable = bucketSum(payables, calcPaySum);

  const bucketCount = (side: RpSideBuckets) =>
    side.parties.length +
    side.accounts.length +
    side.staff.length +
    side.taxes.length +
    side.income.length +
    side.expenses.length;

  return {
    totalReceivable,
    totalPayable,
    receivables,
    payables,
    recCount: bucketCount(receivables),
    payCount: bucketCount(payables),
  };
}

/** R/P dialog scroll areas — patla dim scrollbar (PC / mobile / Capacitor). */
export const RP_DIALOG_SCROLL_CN = "scrollbar-slim-dim-extra";

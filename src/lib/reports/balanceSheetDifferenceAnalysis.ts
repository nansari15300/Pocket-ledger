import type { BalanceSheetTotals, BalanceSheetUncategorizedAccount } from "@/lib/reports/balanceSheetAccounting";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type BalanceSheetDifferenceLineKind =
  | "opening_mismatch"
  | "uncategorized_excluded"
  | "unbalanced_vouchers"
  | "unhandled_vouchers"
  | "residual";

export type BalanceSheetDifferenceLine = {
  kind: BalanceSheetDifferenceLineKind;
  label: string;
  amount: number;
  detail?: string;
  count?: number;
  /** Scroll target id in Balance Sheet page */
  scrollTargetId?: string;
};

export type BalanceSheetUnhandledVoucher = {
  id: string;
  type: string;
  voucherNumber: string;
  amount: number;
};

export type BalanceSheetOpeningContributor = {
  accountName: string;
  openingBalance: number;
  side: "Dr" | "Cr";
};

export type BalanceSheetDifferenceBreakdown = {
  totalDifference: number;
  signedDifference: number;
  openingDifference: number;
  remainingAfterOpening: number;
  lines: BalanceSheetDifferenceLine[];
  residualDifference: number;
  uncategorizedDetails: Array<{
    accountName: string;
    signedBalance: number;
    estimatedBsImpact: number;
  }>;
  unhandledVouchers: BalanceSheetUnhandledVoucher[];
  openingTopContributors: BalanceSheetOpeningContributor[];
};

export type BalanceSheetProblematicVoucher = {
  id: string;
  type: string;
  voucherNumber: string;
  date: Date | null;
  debit: number;
  credit: number;
  difference: number;
  description: string;
};

export type BalanceSheetDoubleEntrySummary = {
  isBalanced: boolean;
  difference: number;
  totalDebit?: number;
  totalCredit?: number;
  problematicVouchers: BalanceSheetProblematicVoucher[];
};

export type BalanceSheetDifferenceAnalysisInput = {
  totals: BalanceSheetTotals;
  openingBalanceAudit: { diff: number; isBalanced: boolean };
  uncategorizedAccounts: BalanceSheetUncategorizedAccount[];
  doubleEntryCheck: BalanceSheetDoubleEntrySummary;
  vouchers: Array<Record<string, unknown>>;
  openingBalanceEntities: Array<{ accountName: string; openingBalance?: number }>;
};

const DOUBLE_ENTRY_HANDLED_TYPES = new Set([
  "sale",
  "purchase",
  "payment_in",
  "payment_out",
  "direct_income",
  "direct_expense",
  "contra",
  "journal",
  "add_salary",
  "inter_company",
  "adjustment",
]);

function voucherAmount(v: Record<string, unknown>): number {
  return Number(v.total ?? v.amount ?? 0) || 0;
}

/** Voucher types the Balance Sheet double-entry loop does not accumulate Dr/Cr for. */
export function findUnhandledDoubleEntryVouchers(
  vouchers: Array<Record<string, unknown>>
): BalanceSheetUnhandledVoucher[] {
  const out: BalanceSheetUnhandledVoucher[] = [];

  for (const v of vouchers) {
    const type = String(v.type || "");
    if (!type) continue;

    const amount = voucherAmount(v);
    const journalMissingEntries = type === "journal" && !Array.isArray(v.entries);
    const inHandledSet = DOUBLE_ENTRY_HANDLED_TYPES.has(type) && !journalMissingEntries;

    if (inHandledSet) continue;
    if (amount <= 0.005 && type !== "inter_company" && type !== "adjustment") continue;

    out.push({
      id: String(v.id || ""),
      type,
      voucherNumber: String(v.voucherNumber || ""),
      amount: round2(amount),
    });
  }

  return out.sort((a, b) => b.amount - a.amount);
}

/**
 * If an uncategorized ledger were mapped with natural Dr/Cr sign, this is the change to
 * (Assets − Liabilities − Equity − Net profit).
 */
export function uncategorizedEstimatedBsImpact(signedBalance: number): number {
  return round2(signedBalance);
}

export function computeOpeningTopContributors(
  entities: Array<{ accountName: string; openingBalance?: number }>,
  limit = 8
): BalanceSheetOpeningContributor[] {
  return entities
    .map((e) => {
      const ob = Number(e.openingBalance) || 0;
      if (Math.abs(ob) < 0.005) return null;
      return {
        accountName: e.accountName,
        openingBalance: round2(Math.abs(ob)),
        side: (ob > 0 ? "Dr" : "Cr") as "Dr" | "Cr",
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.openingBalance - a!.openingBalance)
    .slice(0, limit) as BalanceSheetOpeningContributor[];
}

export function computeBalanceSheetDifferenceBreakdown(
  input: BalanceSheetDifferenceAnalysisInput
): BalanceSheetDifferenceBreakdown {
  const signedDifference = round2(input.totals.difference);
  const totalDifference = round2(Math.abs(signedDifference));
  const openingDifference = round2(Math.abs(input.openingBalanceAudit.diff));
  const remainingAfterOpening = round2(Math.max(0, totalDifference - openingDifference));

  const uncategorizedDetails = input.uncategorizedAccounts.map((u) => ({
    accountName: u.accountName,
    signedBalance: round2(u.signedBalance),
    estimatedBsImpact: uncategorizedEstimatedBsImpact(u.signedBalance),
  }));

  const uncategorizedNetImpact = round2(
    uncategorizedDetails.reduce((s, u) => s + u.estimatedBsImpact, 0)
  );
  const uncategorizedAbsImpact = round2(
    uncategorizedDetails.reduce((s, u) => s + Math.abs(u.estimatedBsImpact), 0)
  );

  const unhandledVouchers = findUnhandledDoubleEntryVouchers(input.vouchers);
  const unhandledTotal = round2(unhandledVouchers.reduce((s, v) => s + v.amount, 0));

  const unbalancedVoucherDiff = input.doubleEntryCheck.isBalanced
    ? 0
    : round2(input.doubleEntryCheck.difference);

  const lines: BalanceSheetDifferenceLine[] = [];

  if (!input.openingBalanceAudit.isBalanced) {
    lines.push({
      kind: "opening_mismatch",
      label: "Opening balance mismatch (Dr − Cr)",
      amount: openingDifference,
      scrollTargetId: "bs-opening-balance-mismatch",
    });
  }

  if (uncategorizedDetails.length > 0) {
    lines.push({
      kind: "uncategorized_excluded",
      label: "Ledgers excluded — not on Balance Sheet",
      amount: uncategorizedAbsImpact,
      count: uncategorizedDetails.length,
      detail:
        Math.abs(uncategorizedNetImpact) >= 0.01
          ? `Net excluded balance ${uncategorizedNetImpact >= 0 ? "+" : ""}${uncategorizedNetImpact.toFixed(2)} — assign groups to include them.`
          : "Assign account groups so these ledgers appear on the Balance Sheet.",
      scrollTargetId: "bs-uncategorized-accounts",
    });
  }

  if (unbalancedVoucherDiff > 0.01) {
    lines.push({
      kind: "unbalanced_vouchers",
      label: "Unbalanced vouchers (Dr ≠ Cr)",
      amount: unbalancedVoucherDiff,
      count: input.doubleEntryCheck.problematicVouchers.length,
      scrollTargetId: "bs-double-entry-check",
    });
  }

  if (unhandledVouchers.length > 0) {
    const types = [...new Set(unhandledVouchers.map((v) => v.type))].join(", ");
    lines.push({
      kind: "unhandled_vouchers",
      label: "Voucher types not fully checked",
      amount: unhandledTotal,
      count: unhandledVouchers.length,
      detail: types,
      scrollTargetId: "bs-double-entry-check",
    });
  }

  let explainedFromRemaining = 0;
  if (uncategorizedDetails.length > 0) {
    explainedFromRemaining += Math.min(remainingAfterOpening, Math.abs(uncategorizedNetImpact));
  }
  if (unbalancedVoucherDiff > 0.01) {
    explainedFromRemaining += Math.min(
      remainingAfterOpening,
      unbalancedVoucherDiff
    );
  }
  if (unhandledVouchers.length > 0) {
    explainedFromRemaining += Math.min(remainingAfterOpening, unhandledTotal);
  }
  explainedFromRemaining = round2(Math.min(remainingAfterOpening, explainedFromRemaining));

  const residualDifference = round2(Math.max(0, remainingAfterOpening - explainedFromRemaining));

  if (residualDifference >= 0.01) {
    lines.push({
      kind: "residual",
      label: "Other / review account classification & P&L",
      amount: residualDifference,
      detail:
        "Check party/bank/staff/tax groups under Assets vs Liabilities, and that net profit matches your P&L.",
    });
  }

  return {
    totalDifference,
    signedDifference,
    openingDifference,
    remainingAfterOpening,
    lines,
    residualDifference,
    uncategorizedDetails,
    unhandledVouchers,
    openingTopContributors: computeOpeningTopContributors(input.openingBalanceEntities),
  };
}

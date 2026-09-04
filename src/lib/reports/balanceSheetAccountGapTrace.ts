import {
  computeBalanceSheetNetProfit,
  computeBalanceSheetReport,
  computeBalanceSheetRowGapParts,
  computeBalanceSheetTotals,
  computeMasterOpeningBalanceAudit,
  type BalanceSheetComputeInput,
  type BalanceSheetEntityType,
  type BalanceSheetRow,
} from "@/lib/reports/balanceSheetAccounting";
import {
  computeBalanceSheetDifferenceBreakdown,
  uncategorizedEstimatedBsImpact,
} from "@/lib/reports/balanceSheetDifferenceAnalysis";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type BalanceSheetAccountGapLine = {
  accountId: string;
  accountName: string;
  entityType: BalanceSheetEntityType | undefined;
  group: string;
  ledgerClass: "Asset" | "Liability" | "Equity";
  signedBalance: number;
  openingBalance: number;
  transactionBalance: number;
  assetContrib: number;
  liabContrib: number;
  equityContrib: number;
  fullGapContribution: number;
  openingGapContribution: number;
  transactionGapContribution: number;
  /** Opening balance field on master (Dr+ / Cr−) — for opening mismatch audit. */
  masterOpeningBalance: number;
};

export type BalanceSheetAccountGapTrace = {
  totals: {
    assets: number;
    liab: number;
    equity: number;
    netProfit: number;
    difference: number;
    sumFullGap: number;
    sumOpeningGap: number;
    sumTransactionGap: number;
    openingAuditDiff: number;
    remainingAfterOpeningHeuristic: number;
    residualAfterBreakdown: number;
  };
  accounts: BalanceSheetAccountGapLine[];
  /** Accounts sorted by |transactionGapContribution| — primary drivers after opening. */
  transactionGapAccounts: BalanceSheetAccountGapLine[];
  uncategorized: Array<{
    accountName: string;
    signedBalance: number;
    estimatedBsImpact: number;
    groupLabel: string;
    reason: string;
  }>;
  openingMismatchMasters: Array<{
    accountName: string;
    openingBalance: number;
    side: "Dr" | "Cr";
    absAmount: number;
  }>;
};

function rowToGapLine(row: BalanceSheetRow): BalanceSheetAccountGapLine {
  const openingBalance = round2(Number(row.openingBalance) || 0);
  const signedBalance = round2(row.signedBalance);
  const full = computeBalanceSheetRowGapParts(row.ledgerClass, signedBalance);
  const opening = computeBalanceSheetRowGapParts(row.ledgerClass, openingBalance);

  return {
    accountId: row.accountId,
    accountName: row.accountName,
    entityType: row.entityType,
    group: row.group,
    ledgerClass: row.ledgerClass,
    signedBalance,
    openingBalance,
    transactionBalance: round2(signedBalance - openingBalance),
    assetContrib: full.assetContrib,
    liabContrib: full.liabContrib,
    equityContrib: full.equityContrib,
    fullGapContribution: full.gapContribution,
    openingGapContribution: opening.gapContribution,
    transactionGapContribution: round2(full.gapContribution - opening.gapContribution),
    masterOpeningBalance: openingBalance,
  };
}

/**
 * Account-by-account mathematical trace for Balance Sheet difference.
 *
 * Identity (individual rows only):
 *   difference = Σ fullGapContribution − netProfit
 *   fullGap = openingGap + transactionGap (per row, same classification)
 */
export function computeBalanceSheetAccountGapTrace(
  input: BalanceSheetComputeInput,
  options?: { vouchersForDoubleEntry?: Array<Record<string, unknown>> }
): BalanceSheetAccountGapTrace {
  const report = computeBalanceSheetReport(input);
  const netProfit = computeBalanceSheetNetProfit(
    input.processedExpenseAccounts ?? [],
    input.processedExpenseGroups,
    input.vouchers,
    input.processedTaxesForLedger,
    input.asOfDate
  );
  const totals = computeBalanceSheetTotals(report.rows, netProfit);
  const individuals = report.rows.filter((r) => !r.isGroup);
  const accounts = individuals.map(rowToGapLine);

  const sumFullGap = round2(accounts.reduce((s, a) => s + a.fullGapContribution, 0));
  const sumOpeningGap = round2(accounts.reduce((s, a) => s + a.openingGapContribution, 0));
  const sumTransactionGap = round2(accounts.reduce((s, a) => s + a.transactionGapContribution, 0));

  const openingBalanceAudit = computeMasterOpeningBalanceAudit([
    ...(input.processedAccounts ?? []),
    ...(input.processedParties ?? []),
    ...(input.processedStaff ?? []),
    ...(input.processedTaxes ?? []),
    ...(input.processedExpenseAccounts ?? []),
  ]);

  const openingMismatchMasters = [
    ...(input.processedAccounts ?? []),
    ...(input.processedParties ?? []),
    ...(input.processedStaff ?? []),
    ...(input.processedTaxes ?? []),
    ...(input.processedExpenseAccounts ?? []),
  ]
    .filter((e) => e.id !== "opening_balance_ledger")
    .map((e) => {
      const ob = round2(Number(e.openingBalance) || 0);
      if (Math.abs(ob) < 0.005) return null;
      const name = String(
        (e as { accountName?: string; name?: string }).accountName ??
          (e as { name?: string }).name ??
          e.id ??
          "Unknown"
      );
      return {
        accountName: name,
        openingBalance: ob,
        side: (ob > 0 ? "Dr" : "Cr") as "Dr" | "Cr",
        absAmount: round2(Math.abs(ob)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.absAmount - a!.absAmount) as BalanceSheetAccountGapTrace["openingMismatchMasters"];

  const uncategorized = report.uncategorized.map((u) => ({
    accountName: u.accountName,
    signedBalance: round2(u.signedBalance),
    estimatedBsImpact: uncategorizedEstimatedBsImpact(u.signedBalance),
    groupLabel: u.groupLabel,
    reason: u.reason,
  }));

  const breakdown = computeBalanceSheetDifferenceBreakdown({
    totals,
    openingBalanceAudit,
    uncategorizedAccounts: report.uncategorized,
    doubleEntryCheck: { isBalanced: true, difference: 0, problematicVouchers: [] },
    vouchers: options?.vouchersForDoubleEntry ?? input.vouchers,
    openingBalanceEntities: openingMismatchMasters.map((m) => ({
      accountName: m.accountName,
      openingBalance: m.openingBalance,
    })),
  });

  const transactionGapAccounts = [...accounts]
    .filter((a) => Math.abs(a.transactionGapContribution) >= 0.01)
    .sort(
      (a, b) =>
        Math.abs(b.transactionGapContribution) - Math.abs(a.transactionGapContribution)
    );

  return {
    totals: {
      assets: totals.assets,
      liab: totals.liab,
      equity: totals.equity,
      netProfit: totals.netProfit,
      difference: totals.difference,
      sumFullGap,
      sumOpeningGap,
      sumTransactionGap,
      openingAuditDiff: openingBalanceAudit.diff,
      remainingAfterOpeningHeuristic: breakdown.remainingAfterOpening,
      residualAfterBreakdown: breakdown.residualDifference,
    },
    accounts,
    transactionGapAccounts,
    uncategorized,
    openingMismatchMasters,
  };
}

export function runBalanceSheetAccountGapTraceSelfChecks(): void {
  const assert = (label: string, actual: number, expected: number) => {
    if (Math.abs(actual - expected) >= 0.02) {
      throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const input: BalanceSheetComputeInput = {
    processedAccounts: [
      { id: "bank1", accountName: "Cash", groupId: "cash", openingBalance: 1000 },
    ],
    processedParties: [
      { id: "opening_balance_ledger", name: "Opening Balance", groupId: "equity", openingBalance: 0 },
      { id: "p1", name: "Party A", groupId: "sundry_debtors", openingBalance: -500 },
    ],
    processedStaff: [],
    processedTaxes: [],
    processedExpenseAccounts: [],
    processedExpenseGroups: [],
    processedGroups: [
      { id: "sundry_debtors", name: "Sundry Debtors" },
      { id: "equity", name: "Equity" },
      { id: "cash", name: "Cash", type: "asset" },
    ],
    processedAccountGroups: [{ id: "cash", name: "Cash", type: "asset" }],
    processedTaxGroups: [],
    processedStaffGroups: [],
    vouchers: [],
    processedTaxesForLedger: [],
  };

  const trace = computeBalanceSheetAccountGapTrace(input);
  assert("difference = sumFullGap - netProfit", trace.totals.difference, trace.totals.sumFullGap - trace.totals.netProfit);
  assert("sumFullGap = opening + txn gap", trace.totals.sumFullGap, trace.totals.sumOpeningGap + trace.totals.sumTransactionGap);
}

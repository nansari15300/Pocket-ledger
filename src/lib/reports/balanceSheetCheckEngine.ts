import {
  computeBalanceSheetNetProfit,
  computeBalanceSheetReport,
  computeBalanceSheetRowGapParts,
  computeBalanceSheetTotals,
  computeMasterOpeningBalanceAudit,
  type BalanceSheetComputeInput,
  type BalanceSheetRow,
} from "@/lib/reports/balanceSheetAccounting";
import {
  computeBalanceSheetDifferenceBreakdown,
  findUnhandledDoubleEntryVouchers,
  type BalanceSheetDoubleEntrySummary,
} from "@/lib/reports/balanceSheetDifferenceAnalysis";
import { computeBalanceSheetAccountGapTrace } from "@/lib/reports/balanceSheetAccountGapTrace";
import {
  computeExpectedSystemOpeningBalance,
  collectMasterOpeningBalanceEntities,
} from "@/lib/reports/systemOpeningBalanceEquity";
import { OPENING_BALANCE_SYSTEM_LEDGER_ID } from "@/lib/reports/openingBalanceLedgerAccounts";
import {
  computeNetProfitFromExpenseLedgerBalancesAsOf,
  computeNetProfitFromExpenseLedgerBalancesWithVouchers,
} from "@/lib/reports/financialSummary";
import {
  buildBalanceSheetTeacherDiagnostics,
  type BalanceSheetTeacherReport,
} from "@/lib/reports/balanceSheetTeacherDiagnostics";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type BalanceSheetCheckStatus = "pass" | "warn" | "fail" | "info";

export type BalanceSheetCheckLine = {
  label: string;
  amount?: number;
  side?: "Dr" | "Cr";
  detail?: string;
  accountId?: string;
  entityType?: string;
};

export type BalanceSheetCheckItem = {
  id: string;
  title: string;
  status: BalanceSheetCheckStatus;
  summary: string;
  amount?: number;
  lines?: BalanceSheetCheckLine[];
  scrollTargetId?: string;
};

export type BalanceSheetReconciliationRow = {
  source: string;
  amount: number;
};

export type BalanceSheetCheckEngineReport = {
  runAtMs: number;
  isBalanced: boolean;
  totalDifference: number;
  remainingAfterOpening: number;
  equation: {
    assets: number;
    liabilities: number;
    equityInternal: number;
    netProfit: number;
    totalLiabEquityPlusProfit: number;
    difference: number;
  };
  reconciliationTable: BalanceSheetReconciliationRow[];
  reconciliationTotal: number;
  remainingBreakdown: BalanceSheetReconciliationRow[];
  remainingTotal: number;
  checks: BalanceSheetCheckItem[];
  topTransactionDrivers: BalanceSheetCheckLine[];
  topOpeningSpread: BalanceSheetCheckLine[];
  teacher: BalanceSheetTeacherReport;
};

export type BalanceSheetCheckEngineInput = BalanceSheetComputeInput & {
  doubleEntryCheck: BalanceSheetDoubleEntrySummary;
  vouchersForAnalysis?: Array<Record<string, unknown>>;
};

function openingClassificationSpread(row: BalanceSheetRow): number {
  const opening = round2(Number(row.openingBalance) || 0);
  const openingParts = computeBalanceSheetRowGapParts(row.ledgerClass, opening);
  return round2(
    openingParts.gapContribution +
      (row.accountId === OPENING_BALANCE_SYSTEM_LEDGER_ID ? 0 : opening)
  );
}

function findOpeningExcludedFromBalanceSheet(
  input: BalanceSheetCheckEngineInput,
  onBsAccountIds: Set<string>,
  uncategorizedIds: Set<string>
): BalanceSheetCheckLine[] {
  const lines: BalanceSheetCheckLine[] = [];
  const collections: Array<{
    rows: any[];
    nameKey: "accountName" | "name";
    entityType: string;
  }> = [
    { rows: input.processedAccounts ?? [], nameKey: "accountName", entityType: "account" },
    { rows: input.processedParties ?? [], nameKey: "name", entityType: "party" },
    { rows: input.processedStaff ?? [], nameKey: "name", entityType: "staff" },
    { rows: input.processedTaxes ?? [], nameKey: "name", entityType: "tax" },
    { rows: input.processedExpenseAccounts ?? [], nameKey: "name", entityType: "expense" },
  ];

  for (const { rows, nameKey, entityType } of collections) {
    for (const row of rows) {
      if (row.isDeleted === true) continue;
      if (String(row.id) === OPENING_BALANCE_SYSTEM_LEDGER_ID) continue;
      const ob = round2(Number(row.openingBalance) || 0);
      if (Math.abs(ob) < 0.005) continue;
      const id = String(row.id ?? "");
      if (onBsAccountIds.has(id) || uncategorizedIds.has(id)) continue;
      lines.push({
        label: String(row[nameKey] ?? row.name ?? row.accountName ?? id),
        amount: ob,
        side: ob > 0 ? "Dr" : "Cr",
        detail: "Opening balance in audit but not on Balance Sheet (zero/filtered closing)",
        accountId: id,
        entityType,
      });
    }
  }

  return lines.sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));
}

/** Run all Balance Sheet diagnostic checks (read-only, no data mutation). */
export function runBalanceSheetCheckEngine(
  input: BalanceSheetCheckEngineInput
): BalanceSheetCheckEngineReport {
  const vouchersForAnalysis = input.vouchersForAnalysis ?? input.vouchers;
  const trace = computeBalanceSheetAccountGapTrace(input, {
    vouchersForDoubleEntry: vouchersForAnalysis,
  });
  const report = computeBalanceSheetReport(input);
  const openingAudit = computeMasterOpeningBalanceAudit([
    ...(input.processedAccounts ?? []),
    ...(input.processedParties ?? []),
    ...(input.processedStaff ?? []),
    ...(input.processedTaxes ?? []),
    ...(input.processedExpenseAccounts ?? []),
  ]);
  const breakdown = computeBalanceSheetDifferenceBreakdown({
    totals: {
      assets: trace.totals.assets,
      liab: trace.totals.liab,
      equity: trace.totals.equity,
      netProfit: trace.totals.netProfit,
      totalLiabEquity: round2(
        trace.totals.liab + trace.totals.equity + trace.totals.netProfit
      ),
      difference: trace.totals.difference,
      isBalanced: Math.abs(trace.totals.difference) < 0.02,
    },
    openingBalanceAudit: openingAudit,
    uncategorizedAccounts: report.uncategorized,
    doubleEntryCheck: input.doubleEntryCheck,
    vouchers: vouchersForAnalysis,
    openingBalanceEntities: trace.openingMismatchMasters.map((m) => ({
      accountName: m.accountName,
      openingBalance: m.openingBalance,
    })),
  });

  const plNetProfit = input.asOfDate
    ? computeNetProfitFromExpenseLedgerBalancesAsOf(
        input.processedExpenseAccounts ?? [],
        input.processedExpenseGroups,
        vouchersForAnalysis,
        input.processedTaxesForLedger,
        input.asOfDate
      )
    : computeNetProfitFromExpenseLedgerBalancesWithVouchers(
        input.processedExpenseAccounts ?? [],
        input.processedExpenseGroups,
        vouchersForAnalysis,
        input.processedTaxesForLedger
      );
  const bsNetProfit = trace.totals.netProfit;
  const npDelta = round2(bsNetProfit - plNetProfit);

  const onBsIds = new Set(trace.accounts.map((a) => a.accountId));
  const uncategorizedIds = new Set(report.uncategorized.map((u) => u.accountId));
  const openingExcluded = findOpeningExcludedFromBalanceSheet(input, onBsIds, uncategorizedIds);
  const openingExcludedAmount = round2(
    openingExcluded.reduce((s, line) => s + (line.amount ?? 0), 0)
  );

  const openingSpreadLines: BalanceSheetCheckLine[] = report.rows
    .filter((r) => !r.isGroup)
    .map((row) => ({
      label: row.accountName,
      amount: openingClassificationSpread(row),
    }))
    .filter((l) => Math.abs(l.amount ?? 0) >= 0.01)
    .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));

  const openingClassSpreadTotal = round2(
    openingSpreadLines.reduce((s, l) => s + (l.amount ?? 0), 0)
  );
  const openingClassOffset = round2(trace.totals.sumOpeningGap + openingAudit.diff);
  const txnLayerNet = round2(trace.totals.sumTransactionGap - bsNetProfit);
  const openingMismatchAbs = round2(Math.abs(openingAudit.diff));

  const reconciliationTable: BalanceSheetReconciliationRow[] = [
    { source: "Opening mismatch (master Dr − Cr audit)", amount: openingMismatchAbs },
    { source: "Opening on masters excluded from Balance Sheet", amount: openingExcludedAmount },
    { source: "Opening BS classification spread (on-BS accounts)", amount: openingClassSpreadTotal },
    {
      source: "Transaction equation gap (gross, all BS accounts)",
      amount: trace.totals.sumTransactionGap,
    },
    { source: "Net profit transfer (P&L → BS equation)", amount: round2(-bsNetProfit) },
    {
      source: "Uncategorized / excluded ledgers (BS impact if mapped)",
      amount: round2(
        breakdown.uncategorizedDetails.reduce((s, u) => s + u.estimatedBsImpact, 0)
      ),
    },
    { source: "BS net profit vs P&L net profit", amount: npDelta },
  ];
  const reconSum = round2(reconciliationTable.reduce((s, r) => s + r.amount, 0));
  const rounding = round2(trace.totals.difference - reconSum);
  if (Math.abs(rounding) >= 0.01) {
    reconciliationTable.push({ source: "Rounding", amount: rounding });
  }

  const remainingBreakdown: BalanceSheetReconciliationRow[] = [
    { source: "Opening excluded from Balance Sheet", amount: openingExcludedAmount },
    { source: "Opening BS classification spread", amount: openingClassSpreadTotal },
    { source: "Transaction layer net (Σ txn gap − net profit)", amount: txnLayerNet },
  ];
  const remainingSum = round2(remainingBreakdown.reduce((s, r) => s + r.amount, 0));
  const remainingRounding = round2(breakdown.remainingAfterOpening - remainingSum);
  if (Math.abs(remainingRounding) >= 0.01) {
    remainingBreakdown.push({ source: "Rounding", amount: remainingRounding });
  }

  const unexpectedSign = trace.accounts
    .filter(
      (a) =>
        (a.ledgerClass === "Asset" && a.signedBalance < -0.005) ||
        (a.ledgerClass === "Liability" && a.signedBalance > 0.005)
    )
    .map((a) => ({
      label: a.accountName,
      amount: a.fullGapContribution,
      detail: `${a.ledgerClass} chart / ${a.group} — closing ${a.signedBalance >= 0 ? "Dr" : "Cr"} ${round2(Math.abs(a.signedBalance))}`,
    }))
    .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));

  const storedSystemOb = (input.processedParties ?? []).find(
    (p) => p.id === OPENING_BALANCE_SYSTEM_LEDGER_ID
  );
  const expectedSystemOb = computeExpectedSystemOpeningBalance(
    collectMasterOpeningBalanceEntities({
      processedParties: input.processedParties,
      processedAccounts: input.processedAccounts,
      processedStaff: input.processedStaff,
      processedTaxes: input.processedTaxes,
      processedExpenseAccounts: input.processedExpenseAccounts,
    })
  );
  const storedOb = round2(Number(storedSystemOb?.openingBalance) || 0);
  const systemObDrift = round2(storedOb - expectedSystemOb);

  const unhandled = findUnhandledDoubleEntryVouchers(vouchersForAnalysis);

  const checks: BalanceSheetCheckItem[] = [];

  checks.push({
    id: "equation",
    title: "Balance Sheet equation",
    status: Math.abs(trace.totals.difference) < 0.02 ? "pass" : "fail",
    summary: Math.abs(trace.totals.difference) < 0.02
      ? "Assets = Liabilities + Equity + Net Profit"
      : `Difference ₹${round2(Math.abs(trace.totals.difference)).toLocaleString("en-IN")}`,
    amount: round2(Math.abs(trace.totals.difference)),
    lines: [
      { label: "Assets", amount: trace.totals.assets },
      { label: "Liabilities", amount: trace.totals.liab },
      { label: "Equity (internal sum)", amount: trace.totals.equity },
      { label: "Net Profit", amount: bsNetProfit },
      { label: "Assets − (Liab + Equity + P/L)", amount: trace.totals.difference },
    ],
  });

  checks.push({
    id: "gap_identity",
    title: "Account gap identity",
    status:
      Math.abs(trace.totals.difference - (trace.totals.sumFullGap - bsNetProfit)) < 0.02
        ? "pass"
        : "fail",
    summary: "Σ account equation gaps − net profit = total difference",
    lines: [
      { label: "Σ full gap", amount: trace.totals.sumFullGap },
      { label: "− Net profit", amount: -bsNetProfit },
      { label: "= Difference", amount: round2(trace.totals.sumFullGap - bsNetProfit) },
    ],
  });

  checks.push({
    id: "double_entry",
    title: "Voucher double-entry",
    status: input.doubleEntryCheck.isBalanced ? "pass" : "fail",
    summary: input.doubleEntryCheck.isBalanced
      ? "All checked vouchers: Total Dr = Total Cr"
      : `Dr − Cr mismatch ₹${round2(input.doubleEntryCheck.difference).toLocaleString("en-IN")}`,
    amount: input.doubleEntryCheck.difference,
    scrollTargetId: "bs-double-entry-check",
  });

  checks.push({
    id: "opening_mismatch",
    title: "Opening balance Dr − Cr (masters)",
    status: openingAudit.isBalanced ? "pass" : "warn",
    summary: openingAudit.isBalanced
      ? "Master opening balances net to zero"
      : `Net ${openingAudit.diff < 0 ? "Cr" : "Dr"} ₹${openingMismatchAbs.toLocaleString("en-IN")}`,
    amount: openingMismatchAbs,
    scrollTargetId: "bs-opening-balance-mismatch",
    lines: trace.openingMismatchMasters.slice(0, 15).map((m) => ({
      label: m.accountName,
      amount: m.absAmount,
      side: m.side,
    })),
  });

  checks.push({
    id: "net_profit_parity",
    title: "BS net profit vs P&L",
    status: Math.abs(npDelta) < 0.02 ? "pass" : "fail",
    summary:
      Math.abs(npDelta) < 0.02
        ? "Balance Sheet and P&L use the same net profit"
        : `Mismatch ₹${Math.abs(npDelta).toLocaleString("en-IN")}`,
    lines: [
      { label: "BS net profit", amount: bsNetProfit },
      { label: "P&L net profit", amount: plNetProfit },
      { label: "Difference", amount: npDelta },
    ],
  });

  checks.push({
    id: "system_ob",
    title: "System Opening Balance (stored vs expected)",
    status: Math.abs(systemObDrift) < 0.02 ? "pass" : "warn",
    summary:
      Math.abs(systemObDrift) < 0.02
        ? "Stored system OB matches current masters"
        : `Stored differs from expected by ₹${Math.abs(systemObDrift).toLocaleString("en-IN")} Dr`,
    lines: [
      { label: "Stored (party doc)", amount: storedOb },
      { label: "Expected (−Σ master OB)", amount: expectedSystemOb },
      { label: "Drift", amount: systemObDrift },
    ],
  });

  checks.push({
    id: "opening_excluded",
    title: "Opening on masters not on Balance Sheet",
    status: openingExcluded.length === 0 ? "pass" : "warn",
    summary:
      openingExcluded.length === 0
        ? "Every master opening appears on BS or uncategorized"
        : `${openingExcluded.length} account(s) — audit impact ₹${Math.abs(openingExcludedAmount).toLocaleString("en-IN")}`,
    amount: openingExcludedAmount,
    lines: openingExcluded,
  });

  checks.push({
    id: "opening_spread",
    title: "Opening BS classification spread",
    status: Math.abs(openingClassSpreadTotal) < 0.02 ? "pass" : "info",
    summary: `On-BS opening vs Dr−Cr audit spread: ₹${openingClassSpreadTotal.toLocaleString("en-IN")}`,
    amount: openingClassSpreadTotal,
    lines: openingSpreadLines.slice(0, 15),
  });

  checks.push({
    id: "transaction_layer",
    title: "Transaction layer (after P&L)",
    status: Math.abs(txnLayerNet) < 0.02 ? "pass" : "info",
    summary: `Net txn gap − net profit = ₹${txnLayerNet.toLocaleString("en-IN")}`,
    amount: txnLayerNet,
    lines: [
      { label: "Σ transaction gap (gross)", amount: trace.totals.sumTransactionGap },
      { label: "− Net profit", amount: -bsNetProfit },
      { label: "= Net transaction layer", amount: txnLayerNet },
    ],
  });

  checks.push({
    id: "uncategorized",
    title: "Uncategorized / excluded ledgers",
    status: report.uncategorized.length === 0 ? "pass" : "warn",
    summary:
      report.uncategorized.length === 0
        ? "All ledgers mapped to Asset / Liability / Equity"
        : `${report.uncategorized.length} ledger(s) not on Balance Sheet`,
    scrollTargetId: "bs-uncategorized-accounts",
    lines: trace.uncategorized.map((u) => ({
      label: u.accountName,
      amount: u.signedBalance,
      detail: u.reason,
    })),
  });

  checks.push({
    id: "unexpected_sign",
    title: "Unexpected balance sign vs chart class",
    status: unexpectedSign.length === 0 ? "pass" : "info",
    summary:
      unexpectedSign.length === 0
        ? "No Asset (Cr) or Liability (Dr) closing balances on BS"
        : `${unexpectedSign.length} account(s) — review group / natural balance`,
    lines: unexpectedSign.slice(0, 12),
  });

  if (unhandled.length > 0) {
    checks.push({
      id: "unhandled_vouchers",
      title: "Voucher types not in double-entry check",
      status: "info",
      summary: `${unhandled.length} voucher(s) use types outside the BS Dr/Cr loop`,
      scrollTargetId: "bs-double-entry-check",
      lines: unhandled.slice(0, 10).map((v) => ({
        label: `${v.type}${v.voucherNumber ? ` #${v.voucherNumber}` : ""}`,
        amount: v.amount,
      })),
    });
  }

  if (!input.doubleEntryCheck.isBalanced) {
    checks.push({
      id: "unbalanced_vouchers",
      title: "Unbalanced vouchers",
      status: "fail",
      summary: `${input.doubleEntryCheck.problematicVouchers.length} voucher(s) with Dr ≠ Cr`,
      amount: input.doubleEntryCheck.difference,
      scrollTargetId: "bs-double-entry-check",
    });
  }

  checks.push({
    id: "remaining_after_opening",
    title: "Remaining after opening mismatch",
    status: breakdown.remainingAfterOpening < 0.01 ? "pass" : "info",
    summary: `Total diff − opening audit = ₹${breakdown.remainingAfterOpening.toLocaleString("en-IN")}`,
    amount: breakdown.remainingAfterOpening,
    lines: remainingBreakdown.map((r) => ({ label: r.source, amount: r.amount })),
  });

  const teacher = buildBalanceSheetTeacherDiagnostics({
    input,
    vouchersForAnalysis,
    trace,
    report,
    openingAudit,
    breakdown,
    bsNetProfit,
    plNetProfit,
    npDelta,
    openingExcluded,
    openingExcludedAmount,
    openingSpreadLines,
    openingClassSpreadTotal,
    txnLayerNet,
    openingMismatchAbs,
    reconciliationTable,
    reconSum: round2(reconciliationTable.reduce((s, r) => s + r.amount, 0)),
    totalDifference: round2(Math.abs(trace.totals.difference)),
    isBalanced: Math.abs(trace.totals.difference) < 0.02,
    remainingAfterOpening: breakdown.remainingAfterOpening,
    doubleEntryCheck: input.doubleEntryCheck,
    unhandled,
    unexpectedSignAccounts: trace.accounts.filter(
      (a) =>
        (a.ledgerClass === "Asset" && a.signedBalance < -0.005) ||
        (a.ledgerClass === "Liability" && a.signedBalance > 0.005)
    ),
    systemObDrift,
    storedSystemOb: storedOb,
    expectedSystemOb,
  });

  return {
    runAtMs: Date.now(),
    isBalanced: Math.abs(trace.totals.difference) < 0.02,
    totalDifference: round2(Math.abs(trace.totals.difference)),
    remainingAfterOpening: breakdown.remainingAfterOpening,
    equation: {
      assets: trace.totals.assets,
      liabilities: trace.totals.liab,
      equityInternal: trace.totals.equity,
      netProfit: bsNetProfit,
      totalLiabEquityPlusProfit: round2(
        trace.totals.liab + trace.totals.equity + bsNetProfit
      ),
      difference: trace.totals.difference,
    },
    reconciliationTable,
    reconciliationTotal: round2(reconciliationTable.reduce((s, r) => s + r.amount, 0)),
    remainingBreakdown,
    remainingTotal: round2(remainingBreakdown.reduce((s, r) => s + r.amount, 0)),
    checks,
    topTransactionDrivers: trace.transactionGapAccounts.slice(0, 12).map((a) => ({
      label: `${a.accountName} (${a.group})`,
      amount: a.transactionGapContribution,
    })),
    topOpeningSpread: openingSpreadLines.slice(0, 10),
    teacher,
  };
}

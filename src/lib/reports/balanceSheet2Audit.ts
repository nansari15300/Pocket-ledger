/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Balance Sheet 2 — independent transaction-reconciliation audit (read-only).
 * Reuses authoritative classification + ledger helpers; separate reconciliation pipeline.
 */
import {
  computeBalanceSheetReport,
  computeBalanceSheetNetProfit,
  computeBalanceSheetTotals,
  computeBalanceSheetRowGapParts,
  computeMasterOpeningBalanceAudit,
  resolveBalanceSheetEntityClassification,
  type BalanceSheetComputeInput,
  type BalanceSheetEntityType,
  type BalanceSheetRootClassification,
} from "@/lib/reports/balanceSheetAccounting";
import {
  computeExpectedSystemOpeningBalance,
  collectMasterOpeningBalanceEntities,
} from "@/lib/reports/systemOpeningBalanceEquity";
import { OPENING_BALANCE_SYSTEM_LEDGER_ID } from "@/lib/reports/openingBalanceLedgerAccounts";
import {
  computeNetProfitFromExpenseLedgerBalancesAsOf,
  computeNetProfitFromExpenseLedgerBalancesWithVouchers,
  ledgerBalanceAsOf,
} from "@/lib/reports/financialSummary";
import { resolveInterCompanyLegsForVoucher } from "@/lib/interCompany/interCompanyPostingLegs";
import { getRpLedgerDebitCredit } from "@/lib/receivablesPayablesLedgerAmounts";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function safeToDate(date: unknown): Date | null {
  if (!date) return null;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  if (typeof date === "object" && date !== null && "toDate" in date) {
    try {
      const d = (date as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  const d = new Date(String(date));
  return Number.isNaN(d.getTime()) ? null : d;
}

function voucherOnOrBefore(v: any, asOf?: Date): boolean {
  if (!asOf) return true;
  const d = safeToDate(v?.date);
  if (!d) return true;
  return d.getTime() <= asOf.getTime();
}

export type BalanceSheet2AuditInput = BalanceSheetComputeInput;

export type BalanceSheet2AccountRow = {
  accountId: string;
  accountName: string;
  entityType: BalanceSheetEntityType | "expense";
  groupName: string;
  classification: BalanceSheetRootClassification;
  openingBalance: number;
  transactionDebit: number;
  transactionCredit: number;
  transactionNet: number;
  expectedTxnClosing: number;
  actualFullClosing: number;
  bsSide: "Assets" | "Liabilities" | "Equity" | "P&L" | "Excluded";
  bsIncluded: boolean;
  bsAmount: number;
  differenceContribution: number;
  isDeleted?: boolean;
};

export type BalanceSheet2ReconciliationRow = {
  accountId: string;
  accountName: string;
  transactionDr: number;
  transactionCr: number;
  netTransaction: number;
  bsClassification: string;
  bsIncluded: boolean;
  bsAmount: number;
  differenceContribution: number;
};

export type BalanceSheet2JournalRow = {
  voucherId: string;
  date: string;
  voucherNumber: string;
  type: string;
  debitTotal: number;
  creditTotal: number;
  balanced: boolean;
  status: "balanced" | "unbalanced" | "classification_review" | "excluded_account" | "pl_bs_review";
  statusLabel: string;
  bsAccounts: string[];
  plAccounts: string[];
  impact: string;
};

export type BalanceSheet2CrossCheck = {
  id: string;
  label: string;
  left: number;
  right: number;
  pass: boolean;
  detail: string;
};

export type BalanceSheet2BreakdownLine = {
  category: string;
  amount: number;
  hasEvidence: boolean;
};

export type BalanceSheet2AuditReport = {
  runAtMs: number;
  asOfDate?: Date;
  journalPass: boolean;
  voucherTotalDebit: number;
  voucherTotalCredit: number;
  voucherDifference: number;
  transactionOnly: {
    assets: number;
    liabilities: number;
    equity: number;
    netProfit: number;
    difference: number;
  };
  fullBalanceSheet: {
    assets: number;
    liabilities: number;
    equity: number;
    netProfit: number;
    difference: number;
  };
  opening: {
    totalDr: number;
    totalCr: number;
    difference: number;
    storedSystemOb: number;
    expectedSystemOb: number;
    systemObDrift: number;
  };
  totalDifference: number;
  openingDifference: number;
  transactionOtherDifference: number;
  transactionOnlyDifference: number;
  identifiedContribution: number;
  unexplainedContribution: number;
  explanationStatus: "exactly_explained" | "partially_explained";
  explanationMessage: string;
  accountRows: BalanceSheet2AccountRow[];
  reconciliationRows: BalanceSheet2ReconciliationRow[];
  journalRows: BalanceSheet2JournalRow[];
  transactionOnlySections: {
    assets: BalanceSheet2AccountRow[];
    liabilities: BalanceSheet2AccountRow[];
    equity: BalanceSheet2AccountRow[];
  };
  breakdownCategories: BalanceSheet2BreakdownLine[];
  crossChecks: BalanceSheet2CrossCheck[];
  duplicateAccountIds: string[];
};

function sumEntityTxn(
  entityType: BalanceSheetEntityType | "expense",
  accountId: string,
  vouchers: any[],
  asOf?: Date,
  processedTaxes: any[] = []
): { debit: number; credit: number } {
  const context =
    entityType === "party" || entityType === "opening_balance"
      ? "party"
      : entityType === "account"
        ? "account"
        : entityType === "staff"
          ? "staff"
          : entityType === "tax"
            ? "tax"
            : "expense";
  let debit = 0;
  let credit = 0;
  for (const v of vouchers) {
    if (!voucherOnOrBefore(v, asOf)) continue;
    const amounts = getRpLedgerDebitCredit(v, accountId, context, processedTaxes);
    debit += amounts.debit;
    credit += amounts.credit;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

function voucherDrCr(v: any): { debit: number; credit: number } {
  let voucherDebit = 0;
  let voucherCredit = 0;
  const amount = Number(v.total || v.amount || 0);
  const subTotal = Number(v.subTotal || amount);

  if (v.type === "sale") {
    let taxAmount = Number(v.taxAmount || v.tax || 0);
    if (taxAmount === 0 && Array.isArray(v.lineItems)) {
      taxAmount = v.lineItems.reduce((s: number, li: any) => s + Number(li.taxAmount || 0), 0);
    }
    const saleTotal = subTotal - (v.discount || 0) + taxAmount;
    voucherDebit = saleTotal;
    voucherCredit = saleTotal;
  } else if (v.type === "purchase") {
    let taxAmount = Number(v.taxAmount || v.tax || 0);
    if (taxAmount === 0 && Array.isArray(v.lineItems)) {
      taxAmount = v.lineItems.reduce((s: number, li: any) => s + Number(li.taxAmount || 0), 0);
    }
    const purchaseTotal = subTotal - (v.discount || 0) + taxAmount;
    voucherDebit = purchaseTotal;
    voucherCredit = purchaseTotal;
  } else if (
    ["payment_in", "payment_out", "direct_income", "direct_expense", "contra"].includes(v.type)
  ) {
    voucherDebit = amount;
    voucherCredit = amount;
  } else if (v.type === "journal" && Array.isArray(v.entries)) {
    for (const e of v.entries) {
      voucherDebit += Number(e.debit || 0);
      voucherCredit += Number(e.credit || 0);
    }
  } else if (v.type === "add_salary" && Array.isArray(v.entries)) {
    for (const e of v.entries) {
      voucherDebit += Number(e.debit || 0);
      voucherCredit += Number(e.credit || 0);
    }
  } else if (v.type === "inter_company") {
    for (const leg of resolveInterCompanyLegsForVoucher(v)) {
      voucherDebit += Number(leg.debit || 0);
      voucherCredit += Number(leg.credit || 0);
    }
  } else if (v.type === "adjustment" && Array.isArray(v.entries)) {
    for (const e of v.entries) {
      voucherDebit += Number(e.debit || 0);
      voucherCredit += Number(e.credit || 0);
    }
  }
  return { debit: round2(voucherDebit), credit: round2(voucherCredit) };
}

function resolveAccountName(input: BalanceSheet2AuditInput, id: string): string {
  const p = (input.processedParties ?? []).find((x) => x.id === id);
  if (p) return String(p.name ?? id);
  const a = (input.processedAccounts ?? []).find((x) => x.id === id);
  if (a) return String(a.accountName ?? id);
  const s = (input.processedStaff ?? []).find((x) => x.id === id);
  if (s) return String(s.name ?? id);
  const t = (input.processedTaxes ?? []).find((x) => x.id === id);
  if (t) return String(t.name ?? id);
  const e = (input.processedExpenseAccounts ?? []).find((x) => x.id === id);
  if (e) return String(e.name ?? id);
  return id;
}

function classifyId(
  input: BalanceSheet2AuditInput,
  id: string
): BalanceSheetRootClassification {
  if ((input.processedExpenseAccounts ?? []).some((x) => x.id === id)) return "Nominal";
  for (const [entityType, rows] of [
    ["party", input.processedParties],
    ["account", input.processedAccounts],
    ["staff", input.processedStaff],
    ["tax", input.processedTaxes],
  ] as const) {
    const row = (rows ?? []).find((x) => x.id === id);
    if (row) {
      return resolveBalanceSheetEntityClassification(
        input,
        entityType as BalanceSheetEntityType,
        row
      ).classification;
    }
  }
  return "Unknown";
}

function collectVoucherLegs(v: any, input: BalanceSheet2AuditInput): { bs: string[]; pl: string[] } {
  const bs: string[] = [];
  const pl: string[] = [];
  const bump = (id: string) => {
    const cls = classifyId(input, id);
    const name = resolveAccountName(input, id);
    if (cls === "Nominal") pl.push(name);
    else if (cls === "Unknown") pl.push(`${name} (uncategorized)`);
    else bs.push(name);
  };
  if (v.partyId) bump(String(v.partyId));
  if (v.accountId) bump(String(v.accountId));
  if (v.staffId) bump(String(v.staffId));
  if (v.taxAccountId) bump(String(v.taxAccountId));
  if (Array.isArray(v.entries)) {
    for (const e of v.entries) {
      if (e?.accountId) bump(String(e.accountId));
    }
  }
  return { bs: [...new Set(bs)], pl: [...new Set(pl)] };
}

function bsSideFromClass(
  classification: BalanceSheetRootClassification,
  txnNet: number
): BalanceSheet2AccountRow["bsSide"] {
  if (classification === "Nominal") return "P&L";
  if (classification === "Unknown") return "Excluded";
  if (classification === "Asset") return txnNet >= 0 ? "Assets" : "Liabilities";
  if (classification === "Liability") return txnNet <= 0 ? "Liabilities" : "Assets";
  return "Equity";
}

function buildMasterRows(input: BalanceSheet2AuditInput, vouchers: any[]): BalanceSheet2AccountRow[] {
  const rows: BalanceSheet2AccountRow[] = [];
  const collections: Array<{
    entityType: BalanceSheetEntityType | "expense";
    items: any[];
    nameKey: "name" | "accountName";
  }> = [
    { entityType: "party", items: input.processedParties ?? [], nameKey: "name" },
    { entityType: "account", items: input.processedAccounts ?? [], nameKey: "accountName" },
    { entityType: "staff", items: input.processedStaff ?? [], nameKey: "name" },
    { entityType: "tax", items: input.processedTaxes ?? [], nameKey: "name" },
    { entityType: "expense", items: input.processedExpenseAccounts ?? [], nameKey: "name" },
  ];

  for (const { entityType, items, nameKey } of collections) {
    for (const item of items) {
      if (item.id === "all") continue;
      const accountId = String(item.id ?? "");
      const openingBalance = round2(Number(item.openingBalance) || 0);
      const { debit, credit } = sumEntityTxn(
        entityType,
        accountId,
        vouchers,
        input.asOfDate,
        input.processedTaxesForLedger
      );
      const transactionNet = round2(debit - credit);
      let actualFullClosing = round2(openingBalance + transactionNet);
      if (entityType === "expense" && input.asOfDate) {
        actualFullClosing = ledgerBalanceAsOf(
          openingBalance,
          vouchers,
          accountId,
          "expense",
          input.asOfDate,
          input.processedTaxesForLedger
        );
      } else if (entityType !== "expense" && input.asOfDate) {
        const ctx =
          entityType === "party" || entityType === "opening_balance"
            ? "party"
            : entityType === "account"
              ? "account"
              : entityType === "staff"
                ? "staff"
                : "tax";
        actualFullClosing = ledgerBalanceAsOf(
          openingBalance,
          vouchers,
          accountId,
          ctx,
          input.asOfDate,
          input.processedTaxesForLedger
        );
      }

      const etForClass =
        accountId === OPENING_BALANCE_SYSTEM_LEDGER_ID ? "opening_balance" : entityType;
      const cls =
        entityType === "expense"
          ? ("Nominal" as BalanceSheetRootClassification)
          : resolveBalanceSheetEntityClassification(input, etForClass as BalanceSheetEntityType, item)
              .classification;

      const bsSide = bsSideFromClass(cls, transactionNet);
      const bsIncluded = cls === "Asset" || cls === "Liability" || cls === "Equity";
      let bsAmount = 0;
      let differenceContribution = 0;
      if (bsIncluded) {
        const parts = computeBalanceSheetRowGapParts(
          cls as "Asset" | "Liability" | "Equity",
          transactionNet
        );
        bsAmount = round2(Math.abs(parts.assetContrib + parts.liabContrib + parts.equityContrib));
        differenceContribution = parts.gapContribution;
      } else if (cls === "Unknown" && Math.abs(actualFullClosing) >= 0.01) {
        differenceContribution = round2(actualFullClosing);
      }

      if (
        Math.abs(transactionNet) < 0.005 &&
        Math.abs(openingBalance) < 0.005 &&
        Math.abs(actualFullClosing) < 0.005 &&
        !bsIncluded
      ) {
        continue;
      }

      const groupName =
        entityType === "expense"
          ? String(
              input.processedExpenseGroups?.find((g) => g.id === item.groupId)?.name ??
                item.groupId ??
                "Ungrouped"
            )
          : resolveBalanceSheetEntityClassification(
              input,
              etForClass as BalanceSheetEntityType,
              item
            ).groupName;

      rows.push({
        accountId,
        accountName: String(item[nameKey] ?? item.name ?? item.accountName ?? accountId),
        entityType: (entityType === "expense" ? "expense" : etForClass) as BalanceSheet2AccountRow["entityType"],
        groupName,
        classification: cls,
        openingBalance,
        transactionDebit: debit,
        transactionCredit: credit,
        transactionNet,
        expectedTxnClosing: transactionNet,
        actualFullClosing,
        bsSide,
        bsIncluded,
        bsAmount,
        differenceContribution,
        isDeleted: item.isDeleted === true,
      });
    }
  }
  return rows;
}

function computeTransactionOnlyNetProfit(input: BalanceSheet2AuditInput, vouchers: any[]): number {
  const zeroOb = (input.processedExpenseAccounts ?? []).map((a) => ({
    ...a,
    openingBalance: 0,
  }));
  if (input.asOfDate) {
    return computeNetProfitFromExpenseLedgerBalancesAsOf(
      zeroOb,
      input.processedExpenseGroups,
      vouchers,
      input.processedTaxesForLedger,
      input.asOfDate
    );
  }
  return computeNetProfitFromExpenseLedgerBalancesWithVouchers(
    zeroOb,
    input.processedExpenseGroups,
    vouchers,
    input.processedTaxesForLedger
  );
}

/** Independent Balance Sheet 2 audit — read-only. */
export function runBalanceSheet2Audit(input: BalanceSheet2AuditInput): BalanceSheet2AuditReport {
  const vouchers = input.vouchers ?? [];
  const filtered = input.asOfDate
    ? vouchers.filter((v) => voucherOnOrBefore(v, input.asOfDate))
    : vouchers;

  let voucherTotalDebit = 0;
  let voucherTotalCredit = 0;
  const journalRows: BalanceSheet2JournalRow[] = [];
  for (const v of filtered) {
    const { debit, credit } = voucherDrCr(v);
    voucherTotalDebit += debit;
    voucherTotalCredit += credit;
    const balanced = Math.abs(debit - credit) < 0.02;
    const legs = collectVoucherLegs(v, input);
    let status: BalanceSheet2JournalRow["status"] = balanced ? "balanced" : "unbalanced";
    let statusLabel = balanced ? "✓ Balanced" : "CRITICAL — Unbalanced";
    if (balanced && legs.pl.some((x) => x.includes("uncategorized"))) {
      status = "excluded_account";
      statusLabel = "⚠ Excluded Account";
    } else if (balanced && legs.bs.length > 0 && legs.pl.length > 0) {
      status = "pl_bs_review";
      statusLabel = "⚠ P&L/BS Impact Review";
    } else if (balanced && v.type === "adjustment") {
      status = "classification_review";
      statusLabel = "⚠ Adjustment — review impact";
    }
    journalRows.push({
      voucherId: String(v.id ?? ""),
      date: safeToDate(v.date)?.toISOString().slice(0, 10) ?? "",
      voucherNumber: String(v.voucherNumber ?? ""),
      type: String(v.type ?? ""),
      debitTotal: debit,
      creditTotal: credit,
      balanced,
      status,
      statusLabel,
      bsAccounts: legs.bs,
      plAccounts: legs.pl,
      impact: balanced
        ? legs.bs.length
          ? `BS: ${legs.bs.join(", ")}`
          : "No BS legs"
        : `Dr−Cr = ${round2(Math.abs(debit - credit))}`,
    });
  }
  voucherTotalDebit = round2(voucherTotalDebit);
  voucherTotalCredit = round2(voucherTotalCredit);
  const voucherDifference = round2(Math.abs(voucherTotalDebit - voucherTotalCredit));
  const journalPass = voucherDifference < 0.02;

  const accountRows = buildMasterRows(input, filtered);
  const bsAccountRows = accountRows.filter((r) => r.bsIncluded);

  let txnAssets = 0;
  let txnLiab = 0;
  let txnEquity = 0;
  for (const r of bsAccountRows) {
    if (r.classification === "Nominal" || r.classification === "Unknown") continue;
    const parts = computeBalanceSheetRowGapParts(
      r.classification as "Asset" | "Liability" | "Equity",
      r.transactionNet
    );
    txnAssets += parts.assetContrib;
    txnLiab += parts.liabContrib;
    txnEquity += parts.equityContrib;
  }
  txnAssets = round2(txnAssets);
  txnLiab = round2(txnLiab);
  txnEquity = round2(txnEquity);
  const txnNetProfit = computeTransactionOnlyNetProfit(input, filtered);
  const transactionOnlyDifference = round2(
    txnAssets - (txnLiab + txnEquity + txnNetProfit)
  );

  const fullReport = computeBalanceSheetReport(input);
  const fullNetProfit = computeBalanceSheetNetProfit(
    input.processedExpenseAccounts ?? [],
    input.processedExpenseGroups,
    vouchers,
    input.processedTaxesForLedger,
    input.asOfDate
  );
  const fullTotals = computeBalanceSheetTotals(fullReport.rows, fullNetProfit);

  const openingEntities = [
    ...(input.processedAccounts ?? []),
    ...(input.processedParties ?? []),
    ...(input.processedStaff ?? []),
    ...(input.processedTaxes ?? []),
    ...(input.processedExpenseAccounts ?? []),
  ].filter((e) => e.id !== OPENING_BALANCE_SYSTEM_LEDGER_ID);
  const openingAudit = computeMasterOpeningBalanceAudit(openingEntities);
  const expectedSystemOb = computeExpectedSystemOpeningBalance(
    collectMasterOpeningBalanceEntities({
      processedParties: input.processedParties,
      processedAccounts: input.processedAccounts,
      processedStaff: input.processedStaff,
      processedTaxes: input.processedTaxes,
      processedExpenseAccounts: input.processedExpenseAccounts,
    })
  );
  const storedParty = (input.processedParties ?? []).find(
    (p) => p.id === OPENING_BALANCE_SYSTEM_LEDGER_ID
  );
  const storedSystemOb = round2(Number(storedParty?.openingBalance) || 0);

  const reconciliationRows: BalanceSheet2ReconciliationRow[] = accountRows
    .filter(
      (r) =>
        r.bsIncluded ||
        r.classification === "Unknown" ||
        Math.abs(r.differenceContribution) >= 0.01
    )
    .map((r) => ({
      accountId: r.accountId,
      accountName: r.accountName,
      transactionDr: r.transactionDebit,
      transactionCr: r.transactionCredit,
      netTransaction: r.transactionNet,
      bsClassification: r.classification,
      bsIncluded: r.bsIncluded,
      bsAmount: r.bsAmount,
      differenceContribution: r.differenceContribution,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.differenceContribution) - Math.abs(a.differenceContribution)
    );

  const identifiedContribution = round2(
    reconciliationRows.reduce((s, r) => s + r.differenceContribution, 0) - txnNetProfit
  );
  const unexplainedContribution = round2(
    transactionOnlyDifference - identifiedContribution
  );
  const explanationStatus =
    Math.abs(unexplainedContribution) < 0.02 ? "exactly_explained" : "partially_explained";
  const explanationMessage =
    explanationStatus === "exactly_explained"
      ? "EXACTLY EXPLAINED — transaction-only difference matches sum of account contributions."
      : `PARTIALLY EXPLAINED — ${Math.abs(unexplainedContribution).toLocaleString("en-IN", { minimumFractionDigits: 2 })} remains unexplained.`;

  const totalDifference = round2(Math.abs(fullTotals.difference));
  const openingDifference = round2(Math.abs(openingAudit.diff));
  const transactionOtherDifference = round2(
    Math.max(0, totalDifference - openingDifference)
  );

  const sumAccountDr = round2(accountRows.reduce((s, r) => s + r.transactionDebit, 0));

  const duplicateAccountIds: string[] = [];
  const seen = new Map<string, number>();
  for (const row of fullReport.rows.filter((r) => !r.isGroup)) {
    seen.set(row.accountId, (seen.get(row.accountId) ?? 0) + 1);
  }
  for (const [id, count] of seen.entries()) {
    if (count > 1) duplicateAccountIds.push(id);
  }

  const uncategorizedImpact = round2(
    fullReport.uncategorized.reduce((s, u) => s + Math.abs(u.signedBalance), 0)
  );

  const breakdownCategories: BalanceSheet2BreakdownLine[] = [
    { category: "A. Opening balance mismatch", amount: openingDifference, hasEvidence: !openingAudit.isBalanced },
    {
      category: "B. Account excluded from Balance Sheet",
      amount: uncategorizedImpact,
      hasEvidence: fullReport.uncategorized.length > 0,
    },
    {
      category: "C. Transaction-only BS difference",
      amount: Math.abs(transactionOnlyDifference),
      hasEvidence: Math.abs(transactionOnlyDifference) >= 0.01,
    },
    {
      category: "D. Full BS vs transaction-only gap",
      amount: round2(Math.abs(fullTotals.difference - transactionOnlyDifference)),
      hasEvidence: Math.abs(fullTotals.difference - transactionOnlyDifference) >= 0.01,
    },
    {
      category: "E. Unexplained (transaction layer)",
      amount: Math.abs(unexplainedContribution),
      hasEvidence: Math.abs(unexplainedContribution) >= 0.01,
    },
  ].filter((b) => b.amount >= 0.01 || b.hasEvidence);

  const crossChecks: BalanceSheet2CrossCheck[] = [
    {
      id: "voucher-dr-cr",
      label: "CHECK 1 — Voucher Debit vs Credit",
      left: voucherTotalDebit,
      right: voucherTotalCredit,
      pass: journalPass,
      detail: journalPass ? "Journal double-entry PASS" : "Journal double-entry FAIL",
    },
    {
      id: "account-vs-voucher",
      label: "CHECK 2 — Account txn Dr/Cr vs voucher totals",
      left: sumAccountDr,
      right: voucherTotalDebit,
      pass: Math.abs(sumAccountDr - voucherTotalDebit) < 1,
      detail: `Account ΣDr ${sumAccountDr} vs Voucher ΣDr ${voucherTotalDebit}`,
    },
    {
      id: "txn-bs-equation",
      label: "CHECK 3 — Transaction-only BS equation",
      left: txnAssets,
      right: round2(txnLiab + txnEquity + txnNetProfit),
      pass: Math.abs(transactionOnlyDifference) < 0.02,
      detail: `Assets ${txnAssets} vs Liab+Equity+P/L ${round2(txnLiab + txnEquity + txnNetProfit)}`,
    },
  ];

  return {
    runAtMs: Date.now(),
    asOfDate: input.asOfDate,
    journalPass,
    voucherTotalDebit,
    voucherTotalCredit,
    voucherDifference,
    transactionOnly: {
      assets: txnAssets,
      liabilities: txnLiab,
      equity: txnEquity,
      netProfit: txnNetProfit,
      difference: transactionOnlyDifference,
    },
    fullBalanceSheet: {
      assets: fullTotals.assets,
      liabilities: fullTotals.liab,
      equity: fullTotals.equity,
      netProfit: fullTotals.netProfit,
      difference: fullTotals.difference,
    },
    opening: {
      totalDr: round2(
        openingEntities.reduce((s, e) => {
          const ob = Number(e.openingBalance) || 0;
          return ob > 0 ? s + ob : s;
        }, 0)
      ),
      totalCr: round2(
        openingEntities.reduce((s, e) => {
          const ob = Number(e.openingBalance) || 0;
          return ob < 0 ? s + Math.abs(ob) : s;
        }, 0)
      ),
      difference: openingAudit.diff,
      storedSystemOb,
      expectedSystemOb,
      systemObDrift: round2(storedSystemOb - expectedSystemOb),
    },
    totalDifference,
    openingDifference,
    transactionOtherDifference,
    transactionOnlyDifference,
    identifiedContribution,
    unexplainedContribution,
    explanationStatus,
    explanationMessage,
    accountRows,
    reconciliationRows,
    journalRows,
    transactionOnlySections: {
      assets: accountRows.filter((r) => r.bsSide === "Assets" && Math.abs(r.transactionNet) >= 0.005),
      liabilities: accountRows.filter(
        (r) => r.bsSide === "Liabilities" && Math.abs(r.transactionNet) >= 0.005
      ),
      equity: accountRows.filter((r) => r.bsSide === "Equity" && Math.abs(r.transactionNet) >= 0.005),
    },
    breakdownCategories,
    crossChecks,
    duplicateAccountIds,
  };
}

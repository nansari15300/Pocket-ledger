/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computeBalanceSheetReport,
  type BalanceSheetEntityType,
} from "@/lib/reports/balanceSheetAccounting";
import {
  computeNetProfitFromExpenseLedgerBalancesAsOf,
  computeNetProfitFromExpenseLedgerBalancesWithVouchers,
} from "@/lib/reports/financialSummary";
import {
  uncategorizedEstimatedBsImpact,
} from "@/lib/reports/balanceSheetDifferenceAnalysis";
import {
  computeBalanceSheetAccountGapTrace,
  type BalanceSheetAccountGapLine,
} from "@/lib/reports/balanceSheetAccountGapTrace";
import type { BalanceSheetCheckEngineInput, BalanceSheetCheckEngineReport } from "@/lib/reports/balanceSheetCheckEngine";
import { getRpLedgerDebitCredit } from "@/lib/receivablesPayablesLedgerAmounts";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function fmt(amount: number): string {
  return `₹${Math.abs(round2(amount)).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function sideLabel(signed: number): string {
  if (Math.abs(signed) < 0.005) return "—";
  return signed > 0 ? "Dr" : "Cr";
}

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

function voucherOnOrBeforeAsOf(v: any, asOf?: Date): boolean {
  if (!asOf) return true;
  const d = safeToDate(v?.date);
  if (!d) return true;
  return d.getTime() <= asOf.getTime();
}

export type RemainingExplanationConfidence = "normal" | "review" | "confirmed";

export type RemainingExplanationCategory =
  | "supplier_advance"
  | "customer_advance"
  | "supplier_payable"
  | "customer_receivable"
  | "excluded_account"
  | "opening_excluded"
  | "classification"
  | "pl_mismatch"
  | "transaction_effect"
  | "normal";

export type RemainingExplanationVoucherLine = {
  voucherId: string;
  voucherNumber: string;
  dateLabel: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
};

export type RemainingExplanationFinding = {
  id: string;
  category: RemainingExplanationCategory;
  categoryLabel: string;
  confidence: RemainingExplanationConfidence;
  title: string;
  teacherExplanation: string;
  /** Actual post-opening Balance Sheet equation contribution — NOT gross movement. */
  gapContribution: number;
  movementDebit?: number;
  movementCredit?: number;
  movementNote?: string;
  accountId?: string;
  entityType?: string;
  accountName?: string;
  currentGroup?: string;
  opening?: number;
  debit?: number;
  credit?: number;
  closing?: number;
  vouchers: RemainingExplanationVoucherLine[];
};

export type RemainingExplanationSummaryLine = {
  id: string;
  label: string;
  amount: number;
};

export type RemainingExplanationReport = {
  remainingDifference: number;
  /** Engine layers — must sum to remainingDifference. */
  layerSummary: RemainingExplanationSummaryLine[];
  /** Human buckets for the transaction / review slice. */
  categorySummary: RemainingExplanationSummaryLine[];
  totalExplained: number;
  stillUnexplained: number;
  findings: RemainingExplanationFinding[];
};

function ledgerContext(entityType?: BalanceSheetEntityType) {
  switch (entityType) {
    case "party":
    case "opening_balance":
      return "party" as const;
    case "account":
      return "account" as const;
    case "staff":
      return "staff" as const;
    case "tax":
      return "tax" as const;
    default:
      return null;
  }
}

function sumAccountVouchers(
  input: BalanceSheetCheckEngineInput,
  accountId: string,
  entityType?: BalanceSheetEntityType
): { debit: number; credit: number } {
  const ctx = ledgerContext(entityType);
  if (!ctx) return { debit: 0, credit: 0 };
  const vouchers = input.vouchersForAnalysis ?? input.vouchers;
  let debit = 0;
  let credit = 0;
  for (const v of vouchers) {
    if (!voucherOnOrBeforeAsOf(v, input.asOfDate)) continue;
    const m = getRpLedgerDebitCredit(v, accountId, ctx, input.processedTaxesForLedger);
    debit += m.debit;
    credit += m.credit;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

function listAccountVouchers(
  input: BalanceSheetCheckEngineInput,
  accountId: string,
  entityType?: BalanceSheetEntityType,
  limit = 8
): RemainingExplanationVoucherLine[] {
  const ctx = ledgerContext(entityType);
  if (!ctx) return [];
  const vouchers = input.vouchersForAnalysis ?? input.vouchers;
  const out: RemainingExplanationVoucherLine[] = [];

  for (const v of vouchers) {
    if (!voucherOnOrBeforeAsOf(v, input.asOfDate)) continue;
    const m = getRpLedgerDebitCredit(v, accountId, ctx, input.processedTaxesForLedger);
    if (m.debit < 0.005 && m.credit < 0.005) continue;
    const d = safeToDate(v.date);
    out.push({
      voucherId: String(v.id ?? ""),
      voucherNumber: String(v.voucherNumber ?? ""),
      dateLabel: d ? d.toISOString().slice(0, 10) : "—",
      type: String(v.type ?? ""),
      description: String(v.narration ?? v.description ?? v.remarks ?? "").trim() || "—",
      debit: round2(m.debit),
      credit: round2(m.credit),
    });
  }

  return out
    .sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit))
    .slice(0, limit);
}

function classifyPartyAccount(
  line: BalanceSheetAccountGapLine
): Pick<RemainingExplanationFinding, "category" | "categoryLabel" | "confidence" | "title" | "teacherExplanation"> | null {
  const closing = line.signedBalance;
  const absClosing = Math.abs(closing);
  if (absClosing < 0.005) return null;

  const groupLower = line.group.toLowerCase();
  const isCreditorGroup =
    groupLower.includes("creditor") ||
    groupLower.includes("supplier") ||
    groupLower.includes("payable") ||
    line.ledgerClass === "Liability";
  const isDebtorGroup =
    groupLower.includes("debtor") ||
    groupLower.includes("customer") ||
    groupLower.includes("receivable") ||
    (line.ledgerClass === "Asset" && !groupLower.includes("bank") && !groupLower.includes("cash"));

  if (isCreditorGroup && closing > 0.005) {
    return {
      category: "supplier_advance",
      categoryLabel: "Supplier advance (likely)",
      confidence: "review",
      title: "Advance / unusual Debit on supplier side",
      teacherExplanation: `${line.accountName} is under ${line.group} but has a ${fmt(absClosing)} Debit closing balance.

This usually means the company may have paid an advance to this supplier, or the account needs review.

A Debit balance in a creditor-type account is not automatically wrong — please verify supporting vouchers before changing the group.`,
    };
  }

  if (isDebtorGroup && closing < -0.005) {
    return {
      category: "customer_advance",
      categoryLabel: "Customer advance (likely)",
      confidence: "review",
      title: "Customer advance / overpayment (likely)",
      teacherExplanation: `${line.accountName} is under ${line.group} but has a ${fmt(absClosing)} Credit closing balance.

This can mean the customer paid in advance or overpaid.

A Credit balance in a debtor account is not automatically an error — check whether this is a customer advance.`,
    };
  }

  if (isCreditorGroup && closing < -0.005) {
    return {
      category: "supplier_payable",
      categoryLabel: "Supplier payable (normal)",
      confidence: "normal",
      title: "Normal supplier payable",
      teacherExplanation: `${line.accountName} has a normal Credit payable balance of ${fmt(absClosing)} under ${line.group}.

This does not by itself prove an error. It only contributes ${fmt(Math.abs(line.transactionGapContribution))} to the post-opening Balance Sheet equation movement.`,
    };
  }

  if (isDebtorGroup && closing > 0.005) {
    return {
      category: "customer_receivable",
      categoryLabel: "Customer receivable (normal)",
      confidence: "normal",
      title: "Normal customer receivable",
      teacherExplanation: `${line.accountName} has a normal Debit receivable balance of ${fmt(absClosing)} under ${line.group}.

This is usually a routine receivable. Its post-opening equation contribution is ${fmt(Math.abs(line.transactionGapContribution))}.`,
    };
  }

  return null;
}

function buildMovementNote(line: BalanceSheetAccountGapLine, debit: number, credit: number): string | undefined {
  const gross = round2(debit + credit);
  const gap = Math.abs(line.transactionGapContribution);
  if (gross < 1000 || gap >= gross * 0.05) return undefined;
  return `${line.accountName} had ${fmt(gross)} of transaction movement in this period, but only ${fmt(gap)} actually contributes to the remaining Balance Sheet difference after opening. Large movement alone does not mean a large error.`;
}

function buildAccountFinding(
  input: BalanceSheetCheckEngineInput,
  line: BalanceSheetAccountGapLine,
  uncategorizedIds: Set<string>
): RemainingExplanationFinding | null {
  const { debit, credit } = sumAccountVouchers(input, line.accountId, line.entityType);
  const gap = round2(line.transactionGapContribution);
  const absGap = Math.abs(gap);
  const vouchers = listAccountVouchers(input, line.accountId, line.entityType);

  if (uncategorizedIds.has(line.accountId)) {
    return {
      id: `excluded-${line.accountId}`,
      category: "excluded_account",
      categoryLabel: "Excluded from Balance Sheet",
      confidence: "confirmed",
      title: "Account excluded from Balance Sheet",
      teacherExplanation: `${fmt(Math.abs(line.signedBalance))} is sitting in ${line.accountName}, which is not currently included in Assets / Liabilities / Equity on the Balance Sheet.

This can explain part of the remaining difference. Assign the correct group so the ledger appears on the Balance Sheet.`,
      gapContribution: round2(line.fullGapContribution - line.openingGapContribution),
      movementDebit: debit,
      movementCredit: credit,
      movementNote: buildMovementNote(line, debit, credit),
      accountId: line.accountId,
      entityType: line.entityType,
      accountName: line.accountName,
      currentGroup: line.group,
      opening: line.openingBalance,
      debit,
      credit,
      closing: line.signedBalance,
      vouchers,
    };
  }

  const partyKind = line.entityType === "party" ? classifyPartyAccount(line) : null;

  if (partyKind) {
    const include =
      partyKind.confidence !== "normal" ||
      absGap >= 0.01 ||
      Math.abs(line.signedBalance) >= 0.01;
    if (!include) return null;

    return {
      id: `party-${line.accountId}`,
      category: partyKind.category,
      categoryLabel: partyKind.categoryLabel,
      confidence: partyKind.confidence,
      title: partyKind.title,
      teacherExplanation: partyKind.teacherExplanation,
      gapContribution: gap,
      movementDebit: debit,
      movementCredit: credit,
      movementNote: buildMovementNote(line, debit, credit),
      accountId: line.accountId,
      entityType: line.entityType,
      accountName: line.accountName,
      currentGroup: line.group,
      opening: line.openingBalance,
      debit,
      credit,
      closing: line.signedBalance,
      vouchers,
    };
  }

  if (
    (line.ledgerClass === "Asset" && line.signedBalance < -0.005) ||
    (line.ledgerClass === "Liability" && line.signedBalance > 0.005)
  ) {
    return {
      id: `sign-review-${line.accountId}`,
      category: "classification",
      categoryLabel: "Unusual balance vs chart class",
      confidence: "review",
      title: "Unusual balance sign — needs review",
      teacherExplanation: `${line.accountName} is mapped to ${line.ledgerClass} (${line.group}) but closing is ${sideLabel(line.signedBalance)} ${fmt(Math.abs(line.signedBalance))}.

This may be valid (advance, overdraft, settlement) — review vouchers before changing classification.`,
      gapContribution: gap,
      movementDebit: debit,
      movementCredit: credit,
      movementNote: buildMovementNote(line, debit, credit),
      accountId: line.accountId,
      entityType: line.entityType,
      accountName: line.accountName,
      currentGroup: line.group,
      opening: line.openingBalance,
      debit,
      credit,
      closing: line.signedBalance,
      vouchers,
    };
  }

  if (absGap < 0.01) return null;

  return {
    id: `txn-${line.accountId}`,
    category: "transaction_effect",
    categoryLabel: "Transaction layer effect",
    confidence: "normal",
    title: "Post-opening equation movement",
    teacherExplanation: `${line.accountName} contributes ${fmt(absGap)} to the remaining difference through post-opening Balance Sheet equation movement — not through gross voucher volume alone.`,
    gapContribution: gap,
    movementDebit: debit,
    movementCredit: credit,
    movementNote: buildMovementNote(line, debit, credit),
    accountId: line.accountId,
    entityType: line.entityType,
    accountName: line.accountName,
    currentGroup: line.group,
    opening: line.openingBalance,
    debit,
    credit,
    closing: line.signedBalance,
    vouchers,
  };
}

function buildOpeningExcludedFindings(
  input: BalanceSheetCheckEngineInput,
  checkReport: BalanceSheetCheckEngineReport
): RemainingExplanationFinding[] {
  const check = checkReport.checks.find((c) => c.id === "opening_excluded");
  if (!check?.lines?.length) return [];

  return check.lines.map((line, index) => {
    const amount = line.amount ?? 0;
    return {
      id: `opening-excluded-${index}-${line.label}`,
      category: "opening_excluded" as const,
      categoryLabel: "Opening excluded from BS",
      confidence: "confirmed" as const,
      title: line.label,
      teacherExplanation: `${line.label} has opening ${sideLabel(amount)} ${fmt(Math.abs(amount))} in the master audit, but the account is not on the Balance Sheet today (usually zero closing).

Opening is counted in the mismatch audit but not in Assets/Liabilities totals.`,
      gapContribution: amount,
      accountId: line.accountId,
      entityType: line.entityType,
      accountName: line.label,
      opening: amount,
      closing: 0,
      debit: 0,
      credit: 0,
      vouchers: [],
    };
  });
}

function buildPlFinding(
  bsNetProfit: number,
  plNetProfit: number
): RemainingExplanationFinding | null {
  const delta = round2(bsNetProfit - plNetProfit);
  if (Math.abs(delta) < 0.01) return null;
  return {
    id: "pl-mismatch",
    category: "pl_mismatch",
    categoryLabel: "P&L vs Balance Sheet",
    confidence: "confirmed",
    title: "Profit & Loss mismatch",
    teacherExplanation: `Net Profit used by Balance Sheet = ${fmt(bsNetProfit)}
Net Profit from transaction ledger (P&L) = ${fmt(plNetProfit)}
Difference = ${fmt(delta)}

This P&L parity gap can explain part of the remaining difference after opening.`,
    gapContribution: delta,
    vouchers: [],
  };
}

const CONFIDENCE_ORDER: Record<RemainingExplanationConfidence, number> = {
  confirmed: 0,
  review: 1,
  normal: 2,
};

/** Human explanation for remaining-after-opening only (ignores opening mismatch total). Read-only. */
export function buildBalanceSheetRemainingExplanation(
  input: BalanceSheetCheckEngineInput,
  checkReport: BalanceSheetCheckEngineReport
): RemainingExplanationReport {
  const vouchersForAnalysis = input.vouchersForAnalysis ?? input.vouchers;
  const trace = computeBalanceSheetAccountGapTrace(input, { vouchersForDoubleEntry: vouchersForAnalysis });
  const report = checkReport;
  const remaining = round2(report.remainingAfterOpening);

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

  const bsReport = computeBalanceSheetReport(input);
  const uncategorizedIds = new Set(bsReport.uncategorized.map((u) => u.accountId));

  const layerSummary: RemainingExplanationSummaryLine[] = report.remainingBreakdown.map((row, i) => ({
    id: `layer-${i}`,
    label: row.source,
    amount: row.amount,
  }));

  const plFinding = buildPlFinding(bsNetProfit, plNetProfit);
  if (plFinding && Math.abs(plFinding.gapContribution) >= 0.01) {
    layerSummary.push({
      id: "layer-pl",
      label: "P&L vs Balance Sheet net profit",
      amount: plFinding.gapContribution,
    });
  }

  const totalExplained = round2(layerSummary.reduce((s, line) => s + line.amount, 0));
  const stillUnexplained = round2(Math.max(0, remaining - totalExplained));

  const accountFindings: RemainingExplanationFinding[] = [];
  for (const line of trace.accounts) {
    const finding = buildAccountFinding(input, line, uncategorizedIds);
    if (finding) accountFindings.push(finding);
  }

  for (const u of bsReport.uncategorized) {
    if (accountFindings.some((f) => f.accountName === u.accountName)) continue;
    accountFindings.push({
      id: `uncat-${u.accountName}`,
      category: "excluded_account",
      categoryLabel: "Excluded from Balance Sheet",
      confidence: "confirmed",
      title: u.accountName,
      teacherExplanation: `${fmt(Math.abs(u.signedBalance))} in ${u.accountName} is excluded from the Balance Sheet (${u.reason}).`,
      gapContribution: uncategorizedEstimatedBsImpact(u.signedBalance),
      accountId: u.accountId,
      entityType: u.entityType,
      accountName: u.accountName,
      currentGroup: u.groupLabel,
      closing: u.signedBalance,
      vouchers: [],
    });
  }

  const openingExcludedFindings = buildOpeningExcludedFindings(input, checkReport);

  const findings = [...openingExcludedFindings, ...(plFinding ? [plFinding] : []), ...accountFindings].sort(
    (a, b) => {
      const ca = CONFIDENCE_ORDER[a.confidence];
      const cb = CONFIDENCE_ORDER[b.confidence];
      if (ca !== cb) return ca - cb;
      return Math.abs(b.gapContribution) - Math.abs(a.gapContribution);
    }
  );

  const sumByCategory = (cat: RemainingExplanationCategory) =>
    round2(
      findings
        .filter((f) => f.category === cat)
        .reduce((s, f) => s + f.gapContribution, 0)
    );

  const categorySummary: RemainingExplanationSummaryLine[] = [
    { id: "cat-supplier-advance", label: "Supplier advances (review)", amount: sumByCategory("supplier_advance") },
    { id: "cat-customer-advance", label: "Customer advances (review)", amount: sumByCategory("customer_advance") },
    { id: "cat-excluded", label: "Excluded accounts", amount: sumByCategory("excluded_account") },
    {
      id: "cat-opening-excluded",
      label: "Opening excluded from BS",
      amount: sumByCategory("opening_excluded"),
    },
    {
      id: "cat-classification",
      label: "Classification / unusual sign",
      amount: round2(
        layerSummary.find((l) => l.label.includes("classification spread"))?.amount ??
          sumByCategory("classification")
      ),
    },
    { id: "cat-pl", label: "P&L parity", amount: plFinding?.gapContribution ?? 0 },
    {
      id: "cat-other-txn",
      label: "Other transaction effects",
      amount: round2(
        (layerSummary.find((l) => l.label.includes("Transaction layer"))?.amount ?? 0) -
          sumByCategory("supplier_advance") -
          sumByCategory("customer_advance") -
          sumByCategory("transaction_effect")
      ),
    },
  ].filter((line) => Math.abs(line.amount) >= 0.01);

  return {
    remainingDifference: remaining,
    layerSummary,
    categorySummary,
    totalExplained,
    stillUnexplained,
    findings,
  };
}

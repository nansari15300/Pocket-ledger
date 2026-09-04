/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computeOpeningBalanceAudit,
  computeMasterOpeningBalanceAudit,
  resolveBalanceSheetEntityClassification,
  type BalanceSheetComputeInput,
  type BalanceSheetEntityType,
} from "@/lib/reports/balanceSheetAccounting";
import type { BalanceSheetAccountGapTrace } from "@/lib/reports/balanceSheetAccountGapTrace";
import type {
  BalanceSheetCheckEngineInput,
  BalanceSheetCheckLine,
  BalanceSheetReconciliationRow,
} from "@/lib/reports/balanceSheetCheckEngine";
import type {
  BalanceSheetDoubleEntrySummary,
  BalanceSheetUnhandledVoucher,
} from "@/lib/reports/balanceSheetDifferenceAnalysis";
import { OPENING_BALANCE_SYSTEM_LEDGER_ID } from "@/lib/reports/openingBalanceLedgerAccounts";
import { getRpLedgerDebitCredit } from "@/lib/receivablesPayablesLedgerAmounts";
import type { BalanceSheetComputeResult } from "@/lib/reports/balanceSheetAccounting";
import type { BalanceSheetDifferenceBreakdown } from "@/lib/reports/balanceSheetDifferenceAnalysis";
import {
  buildBalanceSheetAccountDiagnostics,
  type BalanceSheetAccountDiagnostic,
} from "@/lib/reports/balanceSheetAccountDiagnostics";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function fmt(amount: number): string {
  return `₹${Math.abs(round2(amount)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sideLabel(signed: number): string {
  return signed >= 0 ? "Dr" : "Cr";
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

export type FindingSeverity = "critical" | "warning" | "info";

export type FindingConfidence = "confirmed" | "review" | "info";

export type BalanceSheetTeacherFinding = {
  id: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  title: string;
  amountAffected?: number;
  /** WHAT I FOUND */
  problem: string;
  /** WHY IT MATTERS */
  whyItMatters: string;
  /** WHAT TO CHECK */
  whatToCheck?: string;
  /** SUGGESTED FIX / treatment */
  suggestedFix?: string;
  evidence: {
    accountId?: string;
    accountName?: string;
    entityType?: string;
    groupId?: string;
    currentGroup?: string;
    suggestedGroup?: string;
    openingBalance?: number;
    debit?: number;
    credit?: number;
    closingBalance?: number;
    voucherId?: string;
    voucherNumber?: string;
    voucherDate?: string;
    amount?: number;
    relatedAccounts?: string[];
    detail?: string;
  }[];
  /** @deprecated use suggestedFix */
  suggestedAction?: string;
  action?: {
    kind:
      | "openAccount"
      | "openVoucher"
      | "openPl"
      | "scroll"
      | "checkOpening"
      | "reviewAdjustment";
    accountId?: string;
    entityType?: string;
    voucherId?: string;
    scrollTargetId?: string;
  };
};

export type BalanceSheetHealthItem = {
  label: string;
  status: "pass" | "warn" | "fail";
};

export type ResidualComponent = {
  id: string;
  label: string;
  amount: number;
  hasEvidence: boolean;
};

export type BalanceSheetTeacherReport = {
  healthStatus: "balanced" | "needs_review" | "critical";
  whyNotBalanced: string[];
  unexplainedAmount?: number;
  residual: {
    fullyExplained: boolean;
    explained: ResidualComponent[];
    unexplained: number;
  };
  topProblems: BalanceSheetTeacherFinding[];
  findings: BalanceSheetTeacherFinding[];
  critical: BalanceSheetTeacherFinding[];
  warning: BalanceSheetTeacherFinding[];
  info: BalanceSheetTeacherFinding[];
  accountingHealth: BalanceSheetHealthItem[];
  recommendedFixOrder: string[];
  accountDiagnosticsCount: number;
};

type BuildContext = {
  input: BalanceSheetCheckEngineInput;
  vouchersForAnalysis: any[];
  trace: BalanceSheetAccountGapTrace;
  report: BalanceSheetComputeResult;
  openingAudit: ReturnType<typeof computeMasterOpeningBalanceAudit>;
  breakdown: BalanceSheetDifferenceBreakdown;
  bsNetProfit: number;
  plNetProfit: number;
  npDelta: number;
  openingExcluded: BalanceSheetCheckLine[];
  openingExcludedAmount: number;
  openingSpreadLines: BalanceSheetCheckLine[];
  openingClassSpreadTotal: number;
  txnLayerNet: number;
  openingMismatchAbs: number;
  reconciliationTable: BalanceSheetReconciliationRow[];
  reconSum: number;
  totalDifference: number;
  isBalanced: boolean;
  remainingAfterOpening: number;
  doubleEntryCheck: BalanceSheetDoubleEntrySummary;
  unhandled: BalanceSheetUnhandledVoucher[];
  unexpectedSignAccounts: BalanceSheetAccountGapTrace["accounts"];
  systemObDrift: number;
  storedSystemOb: number;
  expectedSystemOb: number;
  accountDiagnostics: BalanceSheetAccountDiagnostic[];
};

function sumEntityVoucherDebitCredit(
  entityType: BalanceSheetEntityType | undefined,
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
            : null;
  let debit = 0;
  let credit = 0;
  if (!context) return { debit: 0, credit: 0 };

  for (const v of vouchers) {
    if (!voucherOnOrBeforeAsOf(v, asOf)) continue;
    const m = getRpLedgerDebitCredit(v, accountId, context, processedTaxes);
    debit += m.debit;
    credit += m.credit;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

function inferSuggestedGroup(
  ledgerClass: "Asset" | "Liability" | "Equity",
  signedBalance: number,
  entityType?: BalanceSheetEntityType
): string | undefined {
  if (entityType !== "party" && entityType !== "account") return undefined;
  if (ledgerClass === "Asset" && signedBalance < -0.005) {
    return "Sundry Creditors / Liability (Suggested — please review)";
  }
  if (ledgerClass === "Liability" && signedBalance > 0.005) {
    return "Sundry Debtors / Asset or supplier advance (Suggested — please review)";
  }
  return undefined;
}

function collectOpeningContributors(input: BalanceSheetComputeInput) {
  const entities = [
    ...(input.processedAccounts ?? []),
    ...(input.processedParties ?? []),
    ...(input.processedStaff ?? []),
    ...(input.processedTaxes ?? []),
    ...(input.processedExpenseAccounts ?? []),
  ].filter((e) => e.id !== OPENING_BALANCE_SYSTEM_LEDGER_ID && e.isDeleted !== true);

  const dr: Array<{ accountId: string; accountName: string; entityType: string; amount: number }> = [];
  const cr: Array<{ accountId: string; accountName: string; entityType: string; amount: number }> = [];

  for (const e of entities) {
    const ob = round2(Number(e.openingBalance) || 0);
    if (Math.abs(ob) < 0.005) continue;
    const accountName = String(e.accountName ?? e.name ?? e.id ?? "Unknown");
    const accountId = String(e.id ?? "");
    const entityType = inferEntityTypeFromCollection(e, input);
    if (ob > 0) dr.push({ accountId, accountName, entityType, amount: ob });
    else cr.push({ accountId, accountName, entityType, amount: Math.abs(ob) });
  }

  dr.sort((a, b) => b.amount - a.amount);
  cr.sort((a, b) => b.amount - a.amount);
  return { dr, cr };
}

function inferEntityTypeFromCollection(
  entity: any,
  input: BalanceSheetComputeInput
): string {
  if ((input.processedParties ?? []).some((p) => p.id === entity.id)) {
    return entity.id === OPENING_BALANCE_SYSTEM_LEDGER_ID ? "opening_balance" : "party";
  }
  if ((input.processedAccounts ?? []).some((a) => a.id === entity.id)) return "account";
  if ((input.processedStaff ?? []).some((s) => s.id === entity.id)) return "staff";
  if ((input.processedTaxes ?? []).some((t) => t.id === entity.id)) return "tax";
  if ((input.processedExpenseAccounts ?? []).some((x) => x.id === entity.id)) return "expense";
  return "unknown";
}

function finalizeFinding(f: RawFinding): BalanceSheetTeacherFinding {
  const suggestedFix = f.suggestedFix ?? f.suggestedAction ?? "";
  const amountFromEvidence = f.evidence.reduce((max, e) => {
    const candidates = [
      e.amount,
      e.closingBalance,
      e.openingBalance != null ? Math.abs(e.openingBalance) : 0,
    ].filter((x): x is number => x != null && Math.abs(x) >= 0.005);
    const top = candidates.length ? Math.max(...candidates.map(Math.abs)) : 0;
    return Math.max(max, top);
  }, 0);
  return {
    ...f,
    confidence:
      f.confidence ??
      (f.severity === "critical" ? "confirmed" : f.severity === "warning" ? "review" : "info"),
    whatToCheck: f.whatToCheck ?? suggestedFix,
    suggestedFix,
    suggestedAction: f.suggestedAction ?? suggestedFix,
    amountAffected: f.amountAffected ?? (amountFromEvidence >= 0.01 ? amountFromEvidence : undefined),
  };
}

function buildResidualDecomposition(ctx: BuildContext): BalanceSheetTeacherReport["residual"] {
  const explained: ResidualComponent[] = ctx.reconciliationTable.map((row, i) => ({
    id: `recon-${i}`,
    label: row.source,
    amount: row.amount,
    hasEvidence: !row.source.toLowerCase().includes("rounding"),
  }));

  const unexplained = round2(Math.abs(ctx.totalDifference - ctx.reconSum));
  const fullyExplained = unexplained < 0.02;

  return {
    fullyExplained,
    explained,
    unexplained: fullyExplained ? 0 : unexplained,
  };
}

const PROBLEM_PRIORITY: Record<FindingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function buildTopProblems(findings: BalanceSheetTeacherFinding[]): BalanceSheetTeacherFinding[] {
  return [...findings]
    .filter((f) => f.severity !== "info" || f.id.startsWith("unbalanced-voucher"))
    .sort((a, b) => {
      const pa = PROBLEM_PRIORITY[a.severity];
      const pb = PROBLEM_PRIORITY[b.severity];
      if (pa !== pb) return pa - pb;
      return (b.amountAffected ?? 0) - (a.amountAffected ?? 0);
    })
    .slice(0, 12);
}

function buildSystemObFinding(ctx: BuildContext): BalanceSheetTeacherFinding | null {
  if (Math.abs(ctx.systemObDrift) < 0.02) return null;
  return finalizeFinding({
    id: "system-ob-drift",
    severity: "warning",
    confidence: "confirmed",
    title: "System Opening Balance counter is stale",
    amountAffected: Math.abs(ctx.systemObDrift),
    problem: `System Opening Balance ledger shows ${fmt(ctx.storedSystemOb)} but current master openings imply ${fmt(ctx.expectedSystemOb)}.`,
    whyItMatters:
      "The Balance Sheet displays expected system opening from masters, but a stored drift means the counter-entry ledger may be out of date after import, restore, sync, or manual master edits.",
    whatToCheck:
      "Open Opening Balance accounts and compare stored system ledger vs sum of master opening balances.",
    suggestedFix:
      "Reconcile system opening balance using the Opening Balance reconciliation tool — do not use Adjustment to hide drift.",
    evidence: [
      { detail: "Stored (party doc)", amount: ctx.storedSystemOb },
      { detail: "Expected (−Σ master OB)", amount: ctx.expectedSystemOb },
      { detail: "Drift", amount: ctx.systemObDrift },
    ],
    action: { kind: "checkOpening" },
  });
}

function buildWhyNotBalanced(ctx: BuildContext): { lines: string[]; unexplainedAmount?: number } {
  const lines: string[] = [];
  if (ctx.isBalanced) {
    lines.push("Your Balance Sheet is balanced. Assets equal Liabilities + Equity + Net Profit.");
    return { lines, unexplainedAmount: undefined };
  }

  lines.push(`Your Balance Sheet is not balanced by ${fmt(ctx.totalDifference)}.`);

  if (ctx.openingMismatchAbs >= 0.01) {
    const side = ctx.openingAudit.diff < 0 ? "Cr" : "Dr";
    lines.push(
      `The largest confirmed issue is an opening balance mismatch of ${fmt(ctx.openingMismatchAbs)} ${side}.`
    );
  }

  if (ctx.remainingAfterOpening >= 0.01 && ctx.doubleEntryCheck.isBalanced) {
    lines.push(
      `Approximately ${fmt(ctx.remainingAfterOpening)} remains after the opening mismatch. Specific accounts and reconciliation rows below explain this with evidence — not a generic "classification" label.`
    );
  }

  const residual = buildResidualDecomposition(ctx);
  if (residual.fullyExplained) {
    lines.push("✓ Balance Sheet difference is fully explained by the reconciliation components below.");
  } else if (residual.unexplained >= 0.01) {
    lines.push(
      `⚠ ${fmt(residual.unexplained)} remains unexplained. Review account-level findings — do not invent a cause without evidence.`
    );
  }

  if (ctx.doubleEntryCheck.isBalanced) {
    lines.push(
      "All vouchers are double-entry balanced. The Balance Sheet difference is therefore NOT from a simple Dr/Cr voucher mismatch. Continue with opening, classification, P&L, excluded accounts, and adjustment review below."
    );
  } else {
    lines.push("Unbalanced vouchers detected — fix those first.");
  }

  return {
    lines,
    unexplainedAmount:
      residual.unexplained >= 0.01
        ? residual.unexplained
        : Math.abs(round2(ctx.totalDifference - ctx.reconSum)) >= 0.01
          ? Math.abs(round2(ctx.totalDifference - ctx.reconSum))
          : undefined,
  };
}

type RawFinding = Omit<
  BalanceSheetTeacherFinding,
  "confidence" | "whatToCheck" | "suggestedFix" | "suggestedAction"
> & {
  confidence?: FindingConfidence;
  whatToCheck?: string;
  suggestedFix?: string;
  suggestedAction?: string;
  amountAffected?: number;
};

function buildOpeningFindings(ctx: BuildContext): RawFinding[] {
  const findings: RawFinding[] = [];
  const obTotals = computeOpeningBalanceAudit(
    [
      ...(ctx.input.processedAccounts ?? []),
      ...(ctx.input.processedParties ?? []),
      ...(ctx.input.processedStaff ?? []),
      ...(ctx.input.processedTaxes ?? []),
      ...(ctx.input.processedExpenseAccounts ?? []),
    ].filter((e) => e.id !== OPENING_BALANCE_SYSTEM_LEDGER_ID)
  );
  const { dr, cr } = collectOpeningContributors(ctx.input);

  if (!ctx.openingAudit.isBalanced) {
    const diffSide = ctx.openingAudit.diff < 0 ? "Cr" : "Dr";
    const contributorEvidence = [...dr, ...cr]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12)
      .map((r) => {
        const diag = ctx.accountDiagnostics.find((d) => d.accountId === r.accountId);
        const obSigned = dr.some((d) => d.accountId === r.accountId) ? r.amount : -r.amount;
        return {
          accountId: r.accountId,
          accountName: r.accountName,
          entityType: r.entityType,
          openingBalance: obSigned,
          currentGroup: diag?.groupName,
          closingBalance: diag?.closingBalance,
          debit: diag?.debit,
          credit: diag?.credit,
          detail: `${dr.some((d) => d.accountId === r.accountId) ? "Debit" : "Credit"} opening contributor`,
        };
      });

    findings.push(
      finalizeFinding({
        id: "opening-mismatch",
        severity: "warning",
        confidence: "confirmed",
        title: "Opening balances do not match",
        amountAffected: ctx.openingMismatchAbs,
        problem: `Your opening balances are not balanced. Debit openings total ${fmt(obTotals.totalOpeningDr)} while Credit openings total ${fmt(obTotals.totalOpeningCr)}. Difference = ${fmt(ctx.openingMismatchAbs)} ${diffSide}.`,
        whyItMatters:
          "Opening balances are the starting point of your books. Because Debit and Credit openings do not match, the Balance Sheet can remain unbalanced even if every voucher is perfectly balanced.",
        whatToCheck: "Review each contributor below and correct opening balance on the actual master account.",
        suggestedFix:
          "Fix opening amounts on master accounts (Party/Bank/Staff/Tax/Expense). Do not use Adjustment or Suspense to hide the mismatch.",
        evidence: [
          { detail: "Total Opening Debit", amount: obTotals.totalOpeningDr },
          { detail: "Total Opening Credit", amount: obTotals.totalOpeningCr },
          { detail: `Difference (${diffSide})`, amount: ctx.openingMismatchAbs },
          ...contributorEvidence,
        ],
        action: { kind: "checkOpening" },
      })
    );
  }

  if (ctx.openingExcluded.length > 0) {
    findings.push({
      id: "opening-excluded-from-bs",
      severity: "warning",
      title: "Opening balance excluded from Balance Sheet",
      problem: `${ctx.openingExcluded.length} account(s) have opening balance but are not currently on the Balance Sheet (zero or filtered closing).`,
      whyItMatters:
        "These accounts still affect the opening balance audit but do not appear in Assets/Liabilities/Equity totals today.",
      evidence: ctx.openingExcluded.slice(0, 12).map((line) => ({
        accountName: line.label,
        openingBalance: line.amount,
        detail: line.detail,
      })),
      suggestedAction: "Open each ledger and verify whether the opening balance is still valid or should be corrected on the master account.",
      action: { kind: "checkOpening" },
    });
  }

  return findings;
}

function buildClassificationFindings(ctx: BuildContext): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const u of ctx.report.uncategorized) {
    if (Math.abs(u.signedBalance) < 0.01) continue;
    const diag = ctx.accountDiagnostics.find((d) => d.accountId === u.accountId);
    findings.push(
      finalizeFinding({
        id: `uncategorized-${u.accountId}`,
        severity: "critical",
        confidence: "confirmed",
        title: "Uncategorized account excluded from Balance Sheet",
        amountAffected: Math.abs(u.signedBalance),
        problem: `Confirmed: ${u.accountName} has closing balance ${fmt(Math.abs(u.signedBalance))} but has no valid Balance Sheet classification.`,
        whyItMatters: `The ${fmt(Math.abs(u.signedBalance))} is not included in Assets, Liabilities or Equity, so the Balance Sheet cannot represent the full ledger position.`,
        whatToCheck: `Open ${u.accountName} and verify its real business nature and group assignment.`,
        suggestedFix:
          u.entityType === "party"
            ? "If money receivable from customer → Sundry Debtors / Asset. If payable to supplier → Sundry Creditors / Liability."
            : "Assign the correct chart-of-accounts group for this entity type.",
        evidence: [
          {
            accountId: u.accountId,
            accountName: u.accountName,
            entityType: u.entityType,
            currentGroup: u.groupLabel,
            openingBalance: diag?.openingBalance,
            debit: diag?.debit,
            credit: diag?.credit,
            closingBalance: u.signedBalance,
            detail: u.reason,
          },
        ],
        action: { kind: "openAccount", accountId: u.accountId, entityType: u.entityType },
      })
    );
  }

  for (const acc of ctx.unexpectedSignAccounts) {
    if (Math.abs(acc.signedBalance) < 0.01) continue;
    const suggested = inferSuggestedGroup(acc.ledgerClass, acc.signedBalance, acc.entityType);
    const closingSide = sideLabel(acc.signedBalance);
    const diag = ctx.accountDiagnostics.find((d) => d.accountId === acc.accountId);
    const groupPath = `${acc.ledgerClass} → ${acc.group}`;
    findings.push(
      finalizeFinding({
        id: `classification-review-${acc.accountId}`,
        severity: "warning",
        confidence: "review",
        title: "Review account classification",
        amountAffected: Math.abs(acc.signedBalance),
        problem: `Review: ${acc.accountName} is mapped to ${groupPath} and currently has a ${closingSide} balance of ${fmt(Math.abs(acc.signedBalance))}${acc.openingBalance ? ` (opening ${sideLabel(acc.openingBalance)} ${fmt(Math.abs(acc.openingBalance))})` : ""}.`,
        whyItMatters:
          acc.ledgerClass === "Asset"
            ? "A customer/debtor normally has a Debit balance, but Credit can be valid for customer advance, overpayment, or settlement. Credit balance alone does NOT automatically mean the group is wrong."
            : "A supplier/creditor normally has a Credit balance, but Debit can be valid for supplier advance/overpayment. Debit balance alone does NOT automatically mean the group is wrong.",
        whatToCheck: "Review party/bank relationship, opening balance, and recent transactions before changing the group.",
        suggestedFix: suggested
          ? `If business nature confirms it: ${suggested.replace(" (Suggested — please review)", "")}. Otherwise keep current group.`
          : "Verify business relationship before any group change.",
        evidence: [
          {
            accountId: acc.accountId,
            accountName: acc.accountName,
            entityType: acc.entityType,
            currentGroup: acc.group,
            suggestedGroup: suggested,
            openingBalance: acc.openingBalance,
            debit: diag?.debit,
            credit: diag?.credit,
            closingBalance: acc.signedBalance,
            amount: acc.fullGapContribution,
            detail: `Chart class: ${acc.ledgerClass}; BS equation contribution ${fmt(acc.fullGapContribution)}`,
          },
        ],
        action: { kind: "openAccount", accountId: acc.accountId, entityType: acc.entityType },
      })
    );
  }

  return findings;
}

function buildOpeningClosingReviewFindings(ctx: BuildContext): RawFinding[] {
  const findings: RawFinding[] = [];
  const onBsIds = new Set(ctx.trace.accounts.map((a) => a.accountId));

  const masterCollections: Array<{ rows: any[]; entityType: BalanceSheetEntityType }> = [
    { rows: ctx.input.processedParties ?? [], entityType: "party" },
    { rows: ctx.input.processedAccounts ?? [], entityType: "account" },
    { rows: ctx.input.processedStaff ?? [], entityType: "staff" },
    { rows: ctx.input.processedTaxes ?? [], entityType: "tax" },
  ];

  for (const { rows, entityType } of masterCollections) {
    for (const row of rows) {
      if (row.isDeleted === true) continue;
      const id = String(row.id ?? "");
      if (id === OPENING_BALANCE_SYSTEM_LEDGER_ID) continue;
      const ob = round2(Number(row.openingBalance) || 0);
      if (Math.abs(ob) < 0.005) continue;

      const gapLine = ctx.trace.accounts.find((a) => a.accountId === id);
      const closing = gapLine?.signedBalance ?? 0;
      const name = String(row.accountName ?? row.name ?? id);
      const diag = ctx.accountDiagnostics.find((d) => d.accountId === id);

      if (!onBsIds.has(id) && Math.abs(closing) < 0.01) {
        findings.push({
          id: `opening-zero-closing-${id}`,
          severity: "info",
          confidence: "review",
          title: "Opening balance with zero closing",
          problem: `${name} has opening ${sideLabel(ob)} ${fmt(Math.abs(ob))} but current closing balance is zero.`,
          whyItMatters:
            "This account is not currently contributing to the Balance Sheet, while the opening-balance audit still includes it.",
          whatToCheck: "Verify whether the opening balance on this master is still correct.",
          suggestedFix: "Correct opening on master if outdated; do not use Adjustment as a plug.",
          evidence: [
            {
              accountId: id,
              accountName: name,
              entityType,
              openingBalance: ob,
              debit: diag?.debit,
              credit: diag?.credit,
              closingBalance: closing,
            },
          ],
          action: { kind: "openAccount", accountId: id, entityType },
        });
        continue;
      }

      if (Math.abs(closing) >= 0.01 && ob > 0.005 && closing < -0.005) {
        findings.push({
          id: `opening-dr-closing-cr-${id}`,
          severity: "warning",
          title: "Opening Dr → closing Cr — review",
          problem: `${name} opened with Debit ${fmt(ob)} but now has Credit closing ${fmt(Math.abs(closing))}.`,
          whyItMatters:
            "Large reversal between opening and closing may be valid (settlements, corrections) or may need review.",
          evidence: [
            {
              accountId: id,
              accountName: name,
              entityType,
              openingBalance: ob,
              closingBalance: closing,
            },
          ],
          suggestedAction: "Review transactions on this ledger to confirm the reversal is correct.",
          action: { kind: "openAccount", accountId: id, entityType },
        });
      } else if (Math.abs(closing) >= 0.01 && ob < -0.005 && closing > 0.005) {
        findings.push({
          id: `opening-cr-closing-dr-${id}`,
          severity: "warning",
          title: "Opening Cr → closing Dr — review",
          problem: `${name} opened with Credit ${fmt(Math.abs(ob))} but now has Debit closing ${fmt(closing)}.`,
          whyItMatters:
            "Large reversal between opening and closing may be valid (advance settled, corrections) or may need review.",
          evidence: [
            {
              accountId: id,
              accountName: name,
              entityType,
              openingBalance: ob,
              closingBalance: closing,
            },
          ],
          suggestedAction: "Review transactions on this ledger to confirm the reversal is correct.",
          action: { kind: "openAccount", accountId: id, entityType },
        });
      }
    }
  }

  return findings.slice(0, 20);
}

function buildDoubleEntryFindings(ctx: BuildContext): RawFinding[] {
  const findings: RawFinding[] = [];

  if (ctx.doubleEntryCheck.isBalanced) {
    findings.push({
      id: "double-entry-pass",
      severity: "info",
      title: "All vouchers are balanced",
      problem: "✓ All checked vouchers have equal Debit and Credit.",
      whyItMatters:
        "Balanced vouchers confirm journal integrity only. They do not guarantee a balanced Balance Sheet — classification, opening balances, and P&L treatment are checked separately.",
      evidence: [
        {
          detail: "Total Debit",
          amount: ctx.doubleEntryCheck.totalDebit,
        },
        {
          detail: "Total Credit",
          amount: ctx.doubleEntryCheck.totalCredit,
        },
      ],
      suggestedAction: "Continue with opening balance and classification review if the Balance Sheet is still unbalanced.",
      action: { kind: "scroll", scrollTargetId: "bs-double-entry-check" },
    });
  } else {
    for (const v of ctx.doubleEntryCheck.problematicVouchers.slice(0, 10)) {
      findings.push({
        id: `unbalanced-voucher-${v.id}`,
        severity: "critical",
        title: "Unbalanced journal entry",
        problem: `Voucher ${v.voucherNumber || v.id} (${v.type}) is not balanced.`,
        whyItMatters:
          "Every accounting voucher should have equal Debit and Credit. An unbalanced entry breaks the books.",
        evidence: [
          {
            voucherId: v.id,
            voucherNumber: v.voucherNumber,
            voucherDate: v.date ? safeToDate(v.date)?.toISOString().slice(0, 10) : undefined,
            debit: v.debit,
            credit: v.credit,
            amount: v.difference,
            detail: v.description,
          },
        ],
        suggestedAction: "Open this voucher and correct the debit/credit amounts.",
        action: { kind: "openVoucher", voucherId: v.id },
      });
    }
  }

  return findings;
}

function buildNetProfitFinding(ctx: BuildContext): RawFinding | null {
  if (Math.abs(ctx.npDelta) < 0.02) {
    return {
      id: "net-profit-match",
      severity: "info",
      title: "Net Profit matches P&L",
      problem: "✓ Balance Sheet Net Profit matches the Income Statement for the same as-of date.",
      whyItMatters: "P&L and Balance Sheet use the same net profit figure — no parity issue detected.",
      evidence: [
        { detail: "BS Net Profit", amount: ctx.bsNetProfit },
        { detail: "P&L Net Profit", amount: ctx.plNetProfit },
      ],
      suggestedAction: "No P&L parity action needed.",
      action: { kind: "openPl" },
    };
  }

  return {
    id: "net-profit-mismatch",
    severity: "critical",
    title: "Balance Sheet Net Profit ≠ P&L",
    problem: `Balance Sheet uses Net Profit ${fmt(ctx.bsNetProfit)} but P&L produces ${fmt(ctx.plNetProfit)}.`,
    whyItMatters:
      "The Balance Sheet equation uses Net Profit as part of Equity. If P&L and BS net profit differ, the Balance Sheet difference may include this gap.",
    evidence: [
      { detail: "BS Net Profit", amount: ctx.bsNetProfit },
      { detail: "P&L Net Profit", amount: ctx.plNetProfit },
      { detail: "Difference", amount: ctx.npDelta },
    ],
    suggestedAction: "Open the Profit & Loss report for the same date range and compare income/expense balances.",
    action: { kind: "openPl" },
  };
}

function resolveVoucherEntryAccounts(
  v: any,
  input: BalanceSheetCheckEngineInput
): string[] {
  if (!Array.isArray(v.entries)) return [];
  const names: string[] = [];
  for (const e of v.entries) {
    const id = String(e?.accountId ?? "");
    if (!id) continue;
    const party = (input.processedParties ?? []).find((p) => p.id === id);
    const account = (input.processedAccounts ?? []).find((a) => a.id === id);
    const staff = (input.processedStaff ?? []).find((s) => s.id === id);
    const tax = (input.processedTaxes ?? []).find((t) => t.id === id);
    const expense = (input.processedExpenseAccounts ?? []).find((x) => x.id === id);
    const name =
      party?.name ??
      account?.accountName ??
      staff?.name ??
      tax?.name ??
      expense?.name ??
      id;
    const dr = Number(e?.debit ?? 0) || 0;
    const cr = Number(e?.credit ?? 0) || 0;
    if (dr >= 0.005) names.push(`Dr ${name} ${fmt(dr)}`);
    if (cr >= 0.005) names.push(`Cr ${name} ${fmt(cr)}`);
  }
  return names;
}

function buildAdjustmentFindings(ctx: BuildContext): RawFinding[] {
  const findings: RawFinding[] = [];
  const bsAdjustments = ctx.vouchersForAnalysis.filter((v) => v.type === "adjustment");
  const byTarget = new Map<string, number>();

  for (const v of bsAdjustments) {
    const target = v.adjustmentTarget as { id?: string; entityType?: string; name?: string } | undefined;
    const entryLines = resolveVoucherEntryAccounts(v, ctx.input);
    const amount = round2(Number(v.total ?? v.amount ?? 0) || 0);
    if (amount < 0.01 && entryLines.length === 0) continue;

    const affectsBs =
      target?.id && ["party", "account", "staff", "tax"].includes(String(target.entityType ?? ""));

    if (affectsBs) {
      const entityType = String(target!.entityType);
      const key = `${entityType}:${target!.id}`;
      byTarget.set(key, (byTarget.get(key) ?? 0) + 1);

      findings.push(
        finalizeFinding({
          id: `adjustment-${v.id}`,
          severity: "warning",
          confidence: "review",
          title: "Adjustment voucher affects Balance Sheet",
          amountAffected: amount,
          problem: `Review Adjustment ${v.voucherNumber || v.id}: changes ${target!.name || target!.id} and offsets through Adjustment expense (affects Net Profit).`,
          whyItMatters:
            "Adjustment can change a Balance Sheet balance while also changing profit. Never use Adjustment simply to force Assets = Liabilities + Equity.",
          whatToCheck: "Verify original supporting document and business purpose before keeping this entry.",
          suggestedFix:
            "If legitimate correction, keep with clear narration. If used only to hide a difference, reverse and fix root cause on master/vouchers.",
          evidence: [
            {
              accountId: String(target!.id),
              accountName: String(target!.name ?? target!.id),
              entityType,
              voucherId: String(v.id ?? ""),
              voucherNumber: String(v.voucherNumber ?? ""),
              voucherDate: safeToDate(v.date)?.toISOString().slice(0, 10),
              amount,
              relatedAccounts: entryLines,
              detail: String(v.narration ?? "No narration"),
            },
          ],
          action: {
            kind: "reviewAdjustment",
            voucherId: String(v.id ?? ""),
            accountId: String(target!.id),
            entityType,
          },
        })
      );
    }
  }

  for (const [key, count] of byTarget.entries()) {
    if (count < 3) continue;
    const [entityType, accountId] = key.split(":");
    findings.push(
      finalizeFinding({
        id: `repeated-adjustment-${key}`,
        severity: "warning",
        confidence: "review",
        title: "Repeated balance adjustments",
        problem: `Review: ${count} adjustment voucher(s) on the same Balance Sheet account.`,
        whyItMatters:
          "Repeated adjustments may mask an underlying error. Valid for genuine corrections only — not as a balancing plug.",
        whatToCheck: "List all ADJ vouchers on this account and verify each has supporting evidence.",
        suggestedFix: "Fix root cause on master or original vouchers; do not keep stacking adjustments.",
        evidence: [{ accountId, entityType, detail: `${count} adjustment vouchers` }],
        action: { kind: "openAccount", accountId, entityType },
      })
    );
  }

  return findings.slice(0, 15);
}

function buildJournalPatternFindings(ctx: BuildContext): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const v of ctx.vouchersForAnalysis) {
    if (!voucherOnOrBeforeAsOf(v, ctx.input.asOfDate)) continue;

    if (v.type === "direct_income" && v.partyId) {
      const party = (ctx.input.processedParties ?? []).find((p) => p.id === v.partyId);
      if (!party) continue;
      const cls = resolveBalanceSheetEntityClassification(ctx.input, "party", party);
      if (cls.classification === "Equity") {
        findings.push({
          id: `pattern-capital-income-${v.id}`,
          severity: "warning",
          title: "Direct income posted to Equity party — review",
          problem: `Direct income voucher ${v.voucherNumber || v.id} credits party ${party.name} under Equity group.`,
          whyItMatters:
            "Capital or owner-related parties should normally not receive income vouchers. This pattern may be incorrect.",
          evidence: [
            {
              voucherId: String(v.id ?? ""),
              voucherNumber: String(v.voucherNumber ?? ""),
              accountName: String(party.name),
              accountId: String(party.id),
              entityType: "party",
              currentGroup: cls.groupName,
              amount: round2(Number(v.amount ?? v.total ?? 0) || 0),
            },
          ],
          suggestedAction: "This transaction pattern may be incorrect. Please review the voucher and party group.",
          action: { kind: "openVoucher", voucherId: String(v.id ?? "") },
        });
      }
    }

    if (v.type === "direct_expense" && v.partyId) {
      const party = (ctx.input.processedParties ?? []).find((p) => p.id === v.partyId);
      if (!party) continue;
      const cls = resolveBalanceSheetEntityClassification(ctx.input, "party", party);
      if (cls.classification === "Equity") {
        findings.push({
          id: `pattern-capital-expense-${v.id}`,
          severity: "warning",
          title: "Direct expense posted to Equity party — review",
          problem: `Direct expense voucher ${v.voucherNumber || v.id} debits party ${party.name} under Equity group.`,
          whyItMatters:
            "Owner drawings or capital-related entries should use the correct voucher type and group — not a generic expense to an equity party.",
          evidence: [
            {
              voucherId: String(v.id ?? ""),
              voucherNumber: String(v.voucherNumber ?? ""),
              accountName: String(party.name),
              accountId: String(party.id),
              entityType: "party",
              currentGroup: cls.groupName,
              amount: round2(Number(v.amount ?? v.total ?? 0) || 0),
            },
          ],
          suggestedAction: "This transaction pattern may be incorrect. Please review.",
          action: { kind: "openVoucher", voucherId: String(v.id ?? "") },
        });
      }
    }
  }

  return findings.slice(0, 10);
}

function buildTransactionEvidenceFindings(ctx: BuildContext): RawFinding[] {
  const top = ctx.trace.transactionGapAccounts.slice(0, 8);
  if (top.length === 0) return [];

  return [
    {
      id: "top-transaction-drivers",
      severity: "info",
      title: "Largest transaction impact on Balance Sheet equation",
      problem: "These accounts have the largest effect on the Balance Sheet equation and should be reviewed first.",
      whyItMatters:
        "Large transaction volume is not automatically an error — but these accounts explain most of the post-opening equation movement.",
      evidence: top.map((a) => {
        const { debit, credit } = sumEntityVoucherDebitCredit(
          a.entityType,
          a.accountId,
          ctx.vouchersForAnalysis,
          ctx.input.asOfDate,
          ctx.input.processedTaxesForLedger
        );
        const expectedClosing = round2(a.openingBalance + debit - credit);
        const reconcileOk = Math.abs(expectedClosing - a.signedBalance) < 0.05;
        return {
          accountId: a.accountId,
          accountName: a.accountName,
          entityType: a.entityType,
          currentGroup: a.group,
          openingBalance: a.openingBalance,
          debit,
          credit,
          closingBalance: a.signedBalance,
          amount: a.transactionGapContribution,
          detail: reconcileOk
            ? "Opening + Dr − Cr = Closing ✓"
            : `Opening + Dr − Cr = ${fmt(expectedClosing)} vs closing ${fmt(a.signedBalance)} — review ledger`,
        };
      }),
      suggestedAction: "Open each account and verify transactions if the Balance Sheet is still unbalanced.",
      action: top[0]?.accountId
        ? {
            kind: "openAccount",
            accountId: top[0].accountId,
            entityType: top[0].entityType,
          }
        : undefined,
    },
  ];
}

function buildAccountingHealth(ctx: BuildContext, findings: BalanceSheetTeacherFinding[]): BalanceSheetHealthItem[] {
  const hasClassificationWarn = findings.some((f) => f.id.startsWith("classification-review"));
  const hasAdjustment = findings.some((f) => f.id.startsWith("adjustment-"));

  return [
    {
      label: "Double Entry",
      status: ctx.doubleEntryCheck.isBalanced ? "pass" : "fail",
    },
    {
      label: "Opening Balance",
      status: ctx.openingAudit.isBalanced ? "pass" : "warn",
    },
    {
      label: "Account Classification",
      status: ctx.report.uncategorized.length > 0 ? "fail" : hasClassificationWarn ? "warn" : "pass",
    },
    {
      label: "P&L",
      status: Math.abs(ctx.npDelta) < 0.02 ? "pass" : "fail",
    },
    {
      label: "Uncategorized Accounts",
      status: ctx.report.uncategorized.length === 0 ? "pass" : "fail",
    },
    {
      label: "Transaction Reconciliation",
      status: Math.abs(ctx.txnLayerNet) < 0.02 ? "pass" : "warn",
    },
    {
      label: "Adjustment Review",
      status: hasAdjustment ? "warn" : "pass",
    },
  ];
}

function buildRecommendedFixOrder(findings: BalanceSheetTeacherFinding[]): string[] {
  const order: string[] = [];
  const has = (prefix: string) => findings.some((f) => f.id.startsWith(prefix) || f.id === prefix);

  if (findings.some((f) => f.id.startsWith("unbalanced-voucher"))) {
    order.push("Fix unbalanced journal entries (Dr must equal Cr)");
  }
  if (findings.some((f) => f.id.startsWith("uncategorized-"))) {
    order.push("Assign correct groups to unmapped accounts with meaningful balance");
  }
  if (has("opening-mismatch")) {
    order.push("Fix opening balance mismatch on master accounts");
  }
  if (findings.some((f) => f.id === "system-ob-drift")) {
    order.push("Reconcile System Opening Balance counter with master openings");
  }
  if (findings.some((f) => f.id === "net-profit-mismatch")) {
    order.push("Review P&L vs Balance Sheet Net Profit difference");
  }
  if (findings.some((f) => f.id.startsWith("classification-review"))) {
    order.push("Review uncertain account classifications (sign vs group)");
  }
  if (findings.some((f) => f.id.startsWith("adjustment-"))) {
    order.push("Review adjustment vouchers affecting Balance Sheet accounts");
  }
  if (findings.some((f) => f.id === "top-transaction-drivers")) {
    order.push("Review accounts with largest transaction impact on the equation");
  }
  if (order.length === 0) {
    order.push("Re-run Balance Sheet Check after any corrections");
  } else {
    order.push("Re-run Balance Sheet Check to confirm the difference is resolved");
  }
  return order;
}

export function buildBalanceSheetTeacherDiagnostics(
  ctx: Omit<BuildContext, "accountDiagnostics"> & Partial<Pick<BuildContext, "accountDiagnostics">>
): BalanceSheetTeacherReport {
  const accountDiagnostics =
    ctx.accountDiagnostics ??
    buildBalanceSheetAccountDiagnostics({
      computeInput: ctx.input,
      vouchersForAnalysis: ctx.vouchersForAnalysis,
      trace: ctx.trace,
      uncategorized: ctx.report.uncategorized,
    });
  const fullCtx: BuildContext = { ...ctx, accountDiagnostics };

  const rawFindings: Array<RawFinding | null> = [
    ...buildDoubleEntryFindings(fullCtx),
    buildSystemObFinding(fullCtx),
    ...buildOpeningFindings(fullCtx),
    ...buildClassificationFindings(fullCtx),
    ...buildOpeningClosingReviewFindings(fullCtx),
    buildNetProfitFinding(fullCtx),
    ...buildAdjustmentFindings(fullCtx),
    ...buildJournalPatternFindings(fullCtx),
    ...buildTransactionEvidenceFindings(fullCtx),
  ];

  const allFindings = rawFindings
    .filter(Boolean)
    .map((f) => finalizeFinding(f as RawFinding));

  const critical = allFindings.filter((f) => f.severity === "critical");
  const warning = allFindings.filter((f) => f.severity === "warning");
  const info = allFindings.filter((f) => f.severity === "info");

  const residual = buildResidualDecomposition(fullCtx);
  const { lines: whyNotBalanced, unexplainedAmount } = buildWhyNotBalanced(fullCtx);

  let healthStatus: BalanceSheetTeacherReport["healthStatus"] = "balanced";
  if (critical.length > 0) healthStatus = "critical";
  else if (!fullCtx.isBalanced || warning.length > 0) healthStatus = "needs_review";

  return {
    healthStatus,
    whyNotBalanced,
    unexplainedAmount,
    residual,
    topProblems: buildTopProblems(allFindings),
    findings: allFindings,
    critical,
    warning,
    info,
    accountingHealth: buildAccountingHealth(fullCtx, allFindings),
    recommendedFixOrder: buildRecommendedFixOrder(allFindings),
    accountDiagnosticsCount: accountDiagnostics.length,
  };
}

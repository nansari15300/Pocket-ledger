/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Account-level Balance Sheet diagnostics — reuses gap trace + authoritative ledger Dr/Cr helpers.
 * Read-only; no second balance engine.
 */
import type { BalanceSheetAccountGapTrace } from "@/lib/reports/balanceSheetAccountGapTrace";
import type {
  BalanceSheetComputeInput,
  BalanceSheetEntityType,
} from "@/lib/reports/balanceSheetAccounting";
import {
  computeBalanceSheetRowGapParts,
  resolveBalanceSheetEntityClassification,
} from "@/lib/reports/balanceSheetAccounting";
import { ledgerBalanceAsOf } from "@/lib/reports/financialSummary";
import { getRpLedgerDebitCredit } from "@/lib/receivablesPayablesLedgerAmounts";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AccountDiagnosticConfidence = "confirmed" | "review" | "info";

export type AccountDiagnosticType =
  | "on_balance_sheet"
  | "uncategorized"
  | "unusual_sign_review"
  | "large_equation_impact"
  | "opening_closing_reversal";

export type BalanceSheetAccountDiagnostic = {
  accountId: string;
  accountName: string;
  entityType?: BalanceSheetEntityType;
  groupId?: string;
  groupName: string;
  classification: string;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
  bsContribution: number;
  ledgerReconciles: boolean;
  diagnosticType: AccountDiagnosticType;
  confidence: AccountDiagnosticConfidence;
  explanation: string;
  suggestedAction: string;
};

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

function entityLedgerContext(
  entityType: BalanceSheetEntityType | undefined
): "account" | "party" | "staff" | "tax" | null {
  if (entityType === "party" || entityType === "opening_balance") return "party";
  if (entityType === "account") return "account";
  if (entityType === "staff") return "staff";
  if (entityType === "tax") return "tax";
  return null;
}

function sumDebitCredit(
  entityType: BalanceSheetEntityType | undefined,
  accountId: string,
  vouchers: any[],
  asOf?: Date
): { debit: number; credit: number } {
  const context = entityLedgerContext(entityType);
  let debit = 0;
  let credit = 0;
  if (!context) return { debit: 0, credit: 0 };
  for (const v of vouchers) {
    if (!voucherOnOrBeforeAsOf(v, asOf)) continue;
    const m = getRpLedgerDebitCredit(v, accountId, context);
    debit += m.debit;
    credit += m.credit;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

function resolveMasterEntity(
  input: BalanceSheetComputeInput,
  accountId: string,
  entityType?: BalanceSheetEntityType
): any | null {
  switch (entityType) {
    case "party":
    case "opening_balance":
      return (input.processedParties ?? []).find((p) => p.id === accountId) ?? null;
    case "account":
      return (input.processedAccounts ?? []).find((a) => a.id === accountId) ?? null;
    case "staff":
      return (input.processedStaff ?? []).find((s) => s.id === accountId) ?? null;
    case "tax":
      return (input.processedTaxes ?? []).find((t) => t.id === accountId) ?? null;
    default:
      return null;
  }
}

/** Build per-account diagnostic rows from gap trace (same numbers as Balance Sheet). */
export function buildBalanceSheetAccountDiagnostics(input: {
  computeInput: BalanceSheetComputeInput;
  vouchersForAnalysis: any[];
  trace: BalanceSheetAccountGapTrace;
  uncategorized: Array<{
    accountId: string;
    accountName: string;
    entityType: BalanceSheetEntityType;
    groupLabel: string;
    signedBalance: number;
    reason: string;
  }>;
}): BalanceSheetAccountDiagnostic[] {
  const { computeInput, vouchersForAnalysis, trace, uncategorized } = input;
  const rows: BalanceSheetAccountDiagnostic[] = [];

  for (const line of trace.accounts) {
    const { debit, credit } = sumDebitCredit(
      line.entityType,
      line.accountId,
      vouchersForAnalysis,
      computeInput.asOfDate
    );
    const expectedFromOb = round2(line.openingBalance + debit - credit);
    const ledgerReconciles = Math.abs(expectedFromOb - line.signedBalance) < 0.05;

    let diagnosticType: AccountDiagnosticType = "on_balance_sheet";
    let confidence: AccountDiagnosticConfidence = "info";
    let explanation = "Account is on the Balance Sheet with a mapped classification.";
    let suggestedAction = "No action unless this account appears in a specific finding below.";

    const unusualSign =
      (line.ledgerClass === "Asset" && line.signedBalance < -0.005) ||
      (line.ledgerClass === "Liability" && line.signedBalance > 0.005);

    if (unusualSign) {
      diagnosticType = "unusual_sign_review";
      confidence = "review";
      explanation = `Review: ${line.accountName} is mapped to ${line.ledgerClass} (${line.group}) and has closing ${line.signedBalance >= 0 ? "Dr" : "Cr"} ${round2(Math.abs(line.signedBalance))}. A ${line.ledgerClass === "Asset" ? "Credit" : "Debit"} balance can be valid (advance, overdraft, settlement) — sign alone does not prove wrong mapping.`;
      suggestedAction = "Review party/bank relationship and transactions. Change group only if business nature confirms it.";
    }

    if (Math.abs(line.fullGapContribution) >= 1000) {
      if (diagnosticType === "on_balance_sheet") {
        diagnosticType = "large_equation_impact";
      }
      explanation += ` Equation contribution: ${round2(line.fullGapContribution)}.`;
    }

    if (
      Math.abs(line.openingBalance) >= 0.01 &&
      ((line.openingBalance > 0 && line.signedBalance < -0.005) ||
        (line.openingBalance < 0 && line.signedBalance > 0.005))
    ) {
      diagnosticType = "opening_closing_reversal";
      confidence = "review";
      explanation = `Review: Opening ${line.openingBalance >= 0 ? "Dr" : "Cr"} reversed to closing ${line.signedBalance >= 0 ? "Dr" : "Cr"}. Not automatically wrong — verify advances, refunds, or settlements.`;
      suggestedAction = "Open ledger and review transaction history.";
    }

    const master = resolveMasterEntity(computeInput, line.accountId, line.entityType);
    const cls = master && line.entityType
      ? resolveBalanceSheetEntityClassification(computeInput, line.entityType, master)
      : null;

    rows.push({
      accountId: line.accountId,
      accountName: line.accountName,
      entityType: line.entityType,
      groupId: cls?.groupId,
      groupName: line.group,
      classification: line.ledgerClass,
      openingBalance: line.openingBalance,
      debit,
      credit,
      closingBalance: line.signedBalance,
      bsContribution: line.fullGapContribution,
      ledgerReconciles,
      diagnosticType,
      confidence,
      explanation,
      suggestedAction,
    });
  }

  for (const u of uncategorized) {
    if (Math.abs(u.signedBalance) < 0.01) continue;
    const ctx = entityLedgerContext(u.entityType);
    let closing = u.signedBalance;
    let opening = 0;
    const master = resolveMasterEntity(computeInput, u.accountId, u.entityType);
    if (master) opening = round2(Number(master.openingBalance) || 0);
    if (ctx && computeInput.asOfDate) {
      closing = ledgerBalanceAsOf(
        opening,
        computeInput.vouchers,
        u.accountId,
        ctx,
        computeInput.asOfDate,
        computeInput.processedTaxesForLedger
      );
    }
    const { debit, credit } = sumDebitCredit(
      u.entityType,
      u.accountId,
      vouchersForAnalysis,
      computeInput.asOfDate
    );

    rows.push({
      accountId: u.accountId,
      accountName: u.accountName,
      entityType: u.entityType,
      groupName: u.groupLabel,
      classification: "Unknown",
      openingBalance: opening,
      debit,
      credit,
      closingBalance: closing,
      bsContribution: round2(closing),
      ledgerReconciles: Math.abs(round2(opening + debit - credit) - closing) < 0.05,
      diagnosticType: "uncategorized",
      confidence: "confirmed",
      explanation: `Confirmed: ${u.accountName} has closing ${round2(Math.abs(closing))} but no valid BS classification (${u.reason}).`,
      suggestedAction:
        "Assign the correct chart group (Debtor/Creditor/Bank/Tax/etc.) on the master account — never auto-assign.",
    });
  }

  return rows.sort((a, b) => Math.abs(b.bsContribution) - Math.abs(a.bsContribution));
}

/** Signed BS equation contribution for display. */
export function accountBsEquationContribution(
  ledgerClass: "Asset" | "Liability" | "Equity",
  signedBalance: number
): number {
  return computeBalanceSheetRowGapParts(ledgerClass, signedBalance).gapContribution;
}

/**
 * READ-ONLY exact Balance Sheet reconciliation from .plbp backup.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isPlbpZipPayload, unpackPlbpZipBackup } from "../src/lib/plbpBackupZip";
import {
  computeBalanceSheetNetProfit,
  computeBalanceSheetReport,
  computeBalanceSheetRowGapParts,
  computeBalanceSheetTotals,
  computeMasterOpeningBalanceAudit,
  type BalanceSheetEntityType,
} from "../src/lib/reports/balanceSheetAccounting";
import {
  computeFinancialSummary,
  computeNetProfitFromExpenseLedgerBalances,
  computeNetProfitFromExpenseLedgerBalancesWithVouchers,
  ledgerBalanceFromVouchers,
} from "../src/lib/reports/financialSummary";
import { getRpLedgerDebitCredit } from "../src/lib/receivablesPayablesLedgerAmounts";
import { endOfDay } from "date-fns";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const PLB2 = Buffer.from([80, 76, 66, 50]);

function decryptBackupBytes(text: string, password: string): Uint8Array {
  const buf = Buffer.from(text.trim().replace(/\s+/g, ""), "base64");
  const decryptChunk = (key: Buffer, iv: Buffer, enc: Buffer) => {
    const tag = enc.subarray(enc.length - 16);
    const ct = enc.subarray(0, enc.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  };
  if (buf.length > 36 && buf.subarray(0, 4).equals(PLB2)) {
    let ptr = 4;
    const salt = buf.subarray(ptr, ptr + 16);
    ptr += 16;
    const baseIv = buf.subarray(ptr, ptr + 12);
    ptr += 12;
    const n = buf.readUInt32BE(ptr);
    ptr += 4;
    const lens: number[] = [];
    for (let i = 0; i < n; i++) {
      lens.push(buf.readUInt32BE(ptr));
      ptr += 4;
    }
    const key = crypto.pbkdf2Sync(password, salt, 250_000, 32, "sha256");
    const chunks: Buffer[] = [];
    for (let i = 0; i < n; i++) {
      const enc = buf.subarray(ptr, ptr + lens[i]);
      ptr += lens[i];
      const iv = Buffer.from(baseIv);
      iv.writeUInt32BE((iv.readUInt32BE(8) + i) >>> 0, 8);
      chunks.push(decryptChunk(key, iv, enc));
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const data = buf.subarray(28);
  const key = crypto.pbkdf2Sync(password, salt, 250_000, 32, "sha256");
  return new Uint8Array(decryptChunk(key, iv, data));
}

function loadManifest(filePath: string, password: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath);
  if (raw[0] === 0x7b) return JSON.parse(raw.toString("utf8"));
  if (isPlbpZipPayload(raw)) return unpackPlbpZipBackup(raw).manifest;
  const plain = decryptBackupBytes(raw.toString("utf8"), password);
  if (isPlbpZipPayload(plain)) return unpackPlbpZipBackup(plain).manifest;
  return JSON.parse(Buffer.from(plain).toString("utf8"));
}

function alive<T extends { isDeleted?: boolean }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => !r.isDeleted);
}

function entityContext(t: BalanceSheetEntityType | undefined): "account" | "party" | "staff" | "tax" | "expense" {
  if (t === "account") return "account";
  if (t === "staff") return "staff";
  if (t === "tax") return "tax";
  if (t === "opening_balance" || t === "party") return "party";
  return "party";
}

function sumVoucherDrCr(
  vouchers: any[],
  entityId: string,
  context: ReturnType<typeof entityContext>,
  taxes: any[]
) {
  let debit = 0;
  let credit = 0;
  for (const v of vouchers) {
    const { debit: d, credit: c } = getRpLedgerDebitCredit(v, entityId, context, taxes);
    debit += d;
    credit += c;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let password = "";
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--password" && args[i + 1]) password = args[++i];
    else positional.push(args[i]);
  }
  return { filePath: positional[0], password, outJson: positional[1] };
}

function main() {
  const { filePath, password, outJson } = parseArgs();
  if (!filePath) throw new Error("Usage: npx tsx scripts/reconcile-balance-sheet-exact.ts <file.plbp> [--password pwd] [out.json]");

  const manifest = loadManifest(path.resolve(filePath), password);
  const parties = alive(manifest.parties as any[]);
  const accounts = alive(manifest.bank_accounts as any[]);
  const staff = alive(manifest.staff as any[]);
  const taxes = alive(manifest.taxes as any[]);
  const expenseAccounts = alive(manifest.expense_accounts as any[]);
  const vouchers = alive(manifest.vouchers as any[]);
  const groups = alive(manifest.groups as any[]);
  const accountGroups = alive(manifest.account_groups as any[]);
  const taxGroups = alive(manifest.tax_groups as any[]);
  const staffGroups = alive(manifest.staff_groups as any[]);
  const expenseGroups = alive(manifest.expense_groups as any[]);

  const bsInput = {
    processedAccounts: accounts,
    processedParties: parties,
    processedStaff: staff,
    processedTaxes: taxes,
    processedExpenseAccounts: expenseAccounts,
    processedExpenseGroups: expenseGroups,
    processedGroups: groups,
    processedAccountGroups: accountGroups,
    processedTaxGroups: taxGroups,
    processedStaffGroups: staffGroups,
    vouchers,
    processedTaxesForLedger: taxes,
  };

  const report = computeBalanceSheetReport(bsInput);
  const bsNetProfit = computeBalanceSheetNetProfit(
    expenseAccounts,
    expenseGroups,
    vouchers,
    taxes
  );
  const totals = computeBalanceSheetTotals(report.rows, bsNetProfit);
  const openingAudit = computeMasterOpeningBalanceAudit([
    ...accounts,
    ...parties,
    ...staff,
    ...taxes,
    ...expenseAccounts,
  ]);

  const plNetFromBalances = computeNetProfitFromExpenseLedgerBalances(expenseAccounts, expenseGroups);
  const plNetFromVouchers = computeNetProfitFromExpenseLedgerBalancesWithVouchers(
    expenseAccounts,
    expenseGroups,
    vouchers,
    taxes
  );

  const allTimeEnd = endOfDay(new Date(2099, 11, 31));
  const fsSummary = computeFinancialSummary({
    vouchers,
    processedParties: parties,
    processedStaff: staff,
    processedTaxes: taxes,
    processedAccounts: accounts,
    processedExpenseAccounts: expenseAccounts,
    processedExpenseGroups: expenseGroups,
    processedItems: [],
    period: { from: new Date(2000, 0, 1), to: allTimeEnd },
  });

  const individuals = report.rows.filter((r) => !r.isGroup);
  const accountRows = individuals.map((row) => {
    const ctx = entityContext(row.entityType);
    const opening = round2(Number(row.openingBalance) || 0);
    const { debit, credit } = sumVoucherDrCr(vouchers, row.accountId, ctx, taxes);
    const full = computeBalanceSheetRowGapParts(row.ledgerClass, row.signedBalance);
    const openingParts = computeBalanceSheetRowGapParts(row.ledgerClass, opening);
    const txnGap = round2(full.gapContribution - openingParts.gapContribution);
    const openingClassSpread = round2(
      openingParts.gapContribution +
        (row.accountId === "opening_balance_ledger" ? 0 : opening)
    );

    let bsSide = "—";
    if (full.assetContrib > 0.005) bsSide = "Asset";
    else if (full.liabContrib > 0.005 || full.equityContrib > 0.005) {
      bsSide = row.ledgerClass === "Equity" ? "Equity" : "Liability";
    } else if (Math.abs(row.signedBalance) >= 0.005) {
      bsSide = row.category === "Assets" ? "Asset" : row.category === "Equity" ? "Equity" : "Liability";
    }

    const unexpectedSign =
      (row.ledgerClass === "Asset" && row.signedBalance < -0.005) ||
      (row.ledgerClass === "Liability" && row.signedBalance > 0.005);

    return {
      accountName: row.accountName,
      accountId: row.accountId,
      entityType: row.entityType ?? "party",
      group: row.group,
      chartClass: row.ledgerClass,
      openingBalance: opening,
      voucherDebit: debit,
      voucherCredit: credit,
      finalBalance: row.signedBalance,
      bsSide,
      assetContrib: full.assetContrib,
      liabContrib: full.liabContrib,
      equityContrib: full.equityContrib,
      equationContribution: full.gapContribution,
      openingEquationContribution: openingParts.gapContribution,
      transactionEquationContribution: txnGap,
      openingClassificationSpread: openingClassSpread,
      unexpectedSign,
    };
  });

  const sumFullGap = round2(accountRows.reduce((s, r) => s + r.equationContribution, 0));
  const sumOpeningGap = round2(accountRows.reduce((s, r) => s + r.openingEquationContribution, 0));
  const sumTxnGap = round2(accountRows.reduce((s, r) => s + r.transactionEquationContribution, 0));
  const sumOpeningClassSpread = round2(accountRows.reduce((s, r) => s + r.openingClassificationSpread, 0));

  const openingMismatchAbs = round2(Math.abs(openingAudit.diff));
  const openingClassOffset = round2(sumOpeningGap + openingAudit.diff);
  const txnLayerNet = round2(sumTxnGap - bsNetProfit);
  const remaining142 = round2(totals.difference - openingMismatchAbs);

  const uncategorized = report.uncategorized.map((u) => ({
    accountName: u.accountName,
    entityType: u.entityType,
    groupLabel: u.groupLabel,
    signedBalance: u.signedBalance,
    reason: u.reason,
  }));

  const unexpectedSignAccounts = accountRows.filter((r) => r.unexpectedSign);
  const nominalOnBs = accountRows.filter((r) => r.entityType === "expense");

  const reconciliation = [
    { source: "Opening mismatch (master Dr − Cr audit)", amount: openingMismatchAbs },
    { source: "Opening BS classification offset", amount: openingClassOffset },
    { source: "Transaction layer net (Σ txn equation gap − BS net profit)", amount: txnLayerNet },
    {
      source: "Excluded / uncategorized (not in BS totals today)",
      amount: 0,
    },
    {
      source: "BS net profit vs P&L net profit",
      amount: round2(bsNetProfit - plNetFromVouchers),
    },
  ];
  const reconSum = round2(
    openingMismatchAbs + openingClassOffset + txnLayerNet + round2(bsNetProfit - plNetFromVouchers)
  );
  const rounding = round2(totals.difference - reconSum);
  reconciliation.push({ source: "Rounding", amount: rounding });

  const remainingBreakdown = [
    { source: "Opening BS classification offset", amount: openingClassOffset },
    { source: "Transaction layer net (Σ txn gap − net profit)", amount: txnLayerNet },
    {
      source: "Rounding",
      amount: round2(remaining142 - (openingClassOffset + txnLayerNet)),
    },
  ];
  const remainingTotal = round2(remainingBreakdown.reduce((s, r) => s + r.amount, 0));

  const doubleEntry = { totalDebit: 0, totalCredit: 0 };
  for (const v of vouchers) {
    if (v.type === "journal" && Array.isArray(v.entries)) {
      for (const e of v.entries) {
        doubleEntry.totalDebit += Number(e.debit) || 0;
        doubleEntry.totalCredit += Number(e.credit) || 0;
      }
    } else {
      const amt = Number(v.total ?? v.amount ?? 0);
      doubleEntry.totalDebit += amt;
      doubleEntry.totalCredit += amt;
    }
  }
  doubleEntry.totalDebit = round2(doubleEntry.totalDebit);
  doubleEntry.totalCredit = round2(doubleEntry.totalCredit);

  const result = {
    companyName: (manifest.companyDetails as any[])?.[0]?.name ?? "Company",
    equation: {
      assets: totals.assets,
      liabilities: totals.liab,
      equity: totals.equity,
      netProfit: bsNetProfit,
      totalLiabEquityPlusProfit: totals.totalLiabEquity,
      difference: totals.difference,
      check: round2(totals.assets - totals.totalLiabEquity),
      sumEquationContributions: sumFullGap,
      identityCheck: round2(sumFullGap - bsNetProfit),
    },
    openingAudit: {
      totalOpeningDr: openingAudit.totalOpeningDr,
      totalOpeningCr: openingAudit.totalOpeningCr,
      diff: openingAudit.diff,
      absDiff: openingMismatchAbs,
    },
    netProfitCompare: {
      bsNetProfit,
      plNetFromVouchers,
      plNetFromStoredBalances: plNetFromBalances,
      financialSummaryNetProfit: fsSummary.netProfit.total,
      bsMinusPl: round2(bsNetProfit - plNetFromVouchers),
    },
    sums: {
      sumFullGap,
      sumOpeningGap,
      sumTxnGap,
      sumOpeningClassSpread,
      openingClassOffset,
      txnLayerNet,
      remainingAfterOpening: remaining142,
    },
    reconciliationTable: reconciliation,
    reconciliationTotal: round2(reconciliation.reduce((s, r) => s + r.amount, 0)),
    remaining142091Breakdown: remainingBreakdown,
    remaining142091Total: remainingTotal,
    uncategorized,
    unexpectedSignAccounts,
    nominalOnBalanceSheet: nominalOnBs,
    doubleEntryApprox: doubleEntry,
    accounts: accountRows.sort(
      (a, b) => Math.abs(b.equationContribution) - Math.abs(a.equationContribution)
    ),
    txnDrivers142: accountRows
      .filter((r) => Math.abs(r.transactionEquationContribution) >= 0.01)
      .sort(
        (a, b) =>
          Math.abs(b.transactionEquationContribution) - Math.abs(a.transactionEquationContribution)
      ),
    openingClassSpreadAccounts: accountRows
      .filter((r) => Math.abs(r.openingClassificationSpread) >= 0.01)
      .sort(
        (a, b) =>
          Math.abs(b.openingClassificationSpread) - Math.abs(a.openingClassificationSpread)
      ),
  };

  const text = JSON.stringify(result, null, 2);
  if (outJson) fs.writeFileSync(outJson, text, "utf8");
  else console.log(text);
}

main();

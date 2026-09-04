/**
 * Receivables/Payables dashboard — same Dr/Cr rules as detail ledgers (bank, party, staff, tax, income/expense).
 * Duplicate voucher-type rules yahan mat rakho; ledger helpers reuse karo.
 */
import { getAccountLedgerTransactionAmounts, voucherLedgerAmount } from "@/lib/accountLedgerDaySummary";
import { getPartyLedgerTransactionAmounts } from "@/lib/partyListLedgerBalance";
import {
  getInterCompanyLedgerAmounts,
  hideUnapprovedTargetInterCompanyEntityLedger,
} from "@/lib/interCompany/interCompanyLedgerAmounts";
import { sumJournalAmountsForAccount } from "@/lib/journalLedgerAmounts";

export type RpLedgerContext = "account" | "party" | "staff" | "tax" | "expense";

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isJournalLike(v: any): boolean {
  return v?.type === "journal" || v?.type === "adjustment";
}

function paymentOutPayeeAmount(v: any): number {
  const amount = voucherLedgerAmount(v);
  return v?.type === "payment_out" && toNum(v?.payeeAmount) > 0 ? toNum(v.payeeAmount) : amount;
}

function getStaffRpLedgerDebitCredit(v: any, staffId: string, processedTaxes: any[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const amount = voucherLedgerAmount(v);
  const payee = paymentOutPayeeAmount(v);
  const otherCharge = v?.type === "payment_out" ? toNum(v?.otherChargeAmount) : 0;

  if (v?.type === "inter_company" && String(v?.staffId ?? "") === staffId) {
    const ic = getInterCompanyLedgerAmounts(v, "staff", staffId, amount);
    if (ic.touched) return { debit: ic.debit, credit: ic.credit };
  }

  if (v?.type === "payment_out" && String(v?.staffId ?? "") === staffId) debit = payee;
  else if (v?.type === "payment_out" && String(v?.otherChargeAccountId ?? "") === staffId) debit = otherCharge;
  else if (v?.type === "pay_salary" && String(v?.staffId ?? "") === staffId) debit = amount;
  else if (v?.type === "payment_in" && String(v?.staffId ?? "") === staffId) credit = amount;
  else if (v?.type === "add_salary") {
    if (Array.isArray(v.entries)) {
      const staffEntry = v.entries.find((e: any) => {
        const isStaff = String(e?.accountId ?? "") === staffId;
        const hasCredit = toNum(e?.credit) > 0;
        const isNotTax = !processedTaxes.some((pt) => pt.id === e?.accountId);
        return isStaff && hasCredit && isNotTax;
      });
      if (staffEntry) credit = toNum(staffEntry.credit);
    } else if (String(v?.staffId ?? "") === staffId) credit = amount;
  } else if (v?.type === "journal" && v?.subType === "add_salary" && Array.isArray(v.entries)) {
    const staffEntry = v.entries.find((e: any) => {
      const isStaff = String(e?.accountId ?? "") === staffId;
      const hasCredit = toNum(e?.credit) > 0;
      const isNotTax = !processedTaxes.some((pt) => pt.id === e?.accountId);
      return isStaff && hasCredit && isNotTax;
    });
    if (staffEntry) credit = toNum(staffEntry.credit);
  } else if (isJournalLike(v) && v?.subType !== "add_salary" && Array.isArray(v.entries)) {
    for (const e of v.entries) {
      const isStaff = String(e?.accountId ?? "") === staffId;
      const isNotTax = !processedTaxes.some((pt) => pt.id === e?.accountId);
      if (isStaff && isNotTax) {
        debit += toNum(e?.debit);
        credit += toNum(e?.credit);
      }
    }
  }

  return { debit, credit };
}

function getTaxRpLedgerDebitCredit(v: any, taxId: string): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const amount = voucherLedgerAmount(v);

  if (v?.type === "inter_company") {
    const ic = getInterCompanyLedgerAmounts(v, "tax", taxId, amount);
    if (ic.touched) return { debit: ic.debit, credit: ic.credit };
  }

  if (v?.type === "payment_out" && String(v?.taxAccountId ?? "") === taxId) {
    debit += paymentOutPayeeAmount(v);
  } else if (v?.type === "payment_in" && String(v?.taxAccountId ?? "") === taxId) {
    credit += amount;
  } else if (Array.isArray(v?.lineItems)) {
    for (const line of v.lineItems) {
      if (String(line?.taxAccountId ?? "") !== taxId) continue;
      const taxAmt = toNum(line?.taxAmount);
      if (v?.type === "purchase") debit += taxAmt;
      else if (v?.type === "sale") credit += taxAmt;
    }
  } else if (Array.isArray(v?.entries)) {
    const journalAmt = sumJournalAmountsForAccount(v.entries, taxId);
    debit += journalAmt.debit;
    credit += journalAmt.credit;
  } else if (v?.subType === "pay_salary" && String(v?.taxAccountId ?? "") === taxId) {
    debit += amount;
  }

  return { debit, credit };
}

function getIncomeExpenseRpLedgerDebitCredit(v: any, entityId: string): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const amount = voucherLedgerAmount(v);
  const payee = paymentOutPayeeAmount(v);
  const otherCharge = v?.type === "payment_out" ? toNum(v?.otherChargeAmount) : 0;

  const taxableAmount =
    ["sale", "purchase"].includes(String(v?.type ?? "")) && toNum(v?.subTotal) > 0
      ? toNum(v.subTotal) - toNum(v?.discount)
      : amount;

  if (v?.type === "direct_expense" && (String(v?.toAccountId ?? "") === entityId || String(v?.expenseAccountId ?? "") === entityId)) {
    debit += amount;
  }
  if (v?.type === "payment_out" && (String(v?.expenseAccountId ?? "") === entityId || String(v?.toAccountId ?? "") === entityId)) {
    debit += payee;
  }
  if (v?.type === "payment_out" && String(v?.otherChargeAccountId ?? "") === entityId) {
    debit += otherCharge;
  }
  if (v?.type === "journal" && v?.subType === "add_salary" && Array.isArray(v?.entries)) {
    const debitEntry = v.entries.find((e: any) => String(e?.accountId ?? "") === entityId && toNum(e?.debit) > 0);
    if (debitEntry) debit += toNum(debitEntry.debit);
  }
  if (v?.type === "direct_income" && String(v?.incomeAccountId ?? "") === entityId) {
    credit += amount;
  }
  if (v?.type === "payment_in" && (String(v?.incomeAccountId ?? "") === entityId || String(v?.toAccountId ?? "") === entityId)) {
    credit += amount;
  }
  if (v?.type === "sale") {
    const salesId = String(v?.salesAccountId ?? v?.incomeAccountId ?? "sales_account");
    if (salesId === entityId) credit += taxableAmount;
  }
  if (v?.type === "purchase") {
    const purchaseId = String(v?.purchaseAccountId ?? v?.expenseAccountId ?? "purchase_account");
    if (purchaseId === entityId) debit += taxableAmount;
  }
  if (isJournalLike(v) && v?.subType !== "add_salary" && Array.isArray(v?.entries)) {
    const journalAmt = sumJournalAmountsForAccount(v.entries, entityId);
    debit += journalAmt.debit;
    credit += journalAmt.credit;
  }

  const ic = getInterCompanyLedgerAmounts(v, "expense", entityId, amount);
  if (ic.touched) return { debit: ic.debit, credit: ic.credit };

  return { debit, credit };
}

export function getRpLedgerDebitCredit(
  v: any,
  entityId: string,
  context: RpLedgerContext,
  processedTaxes: any[] = []
): { debit: number; credit: number } {
  const id = String(entityId || "").trim();
  if (!id || !v) return { debit: 0, credit: 0 };

  if (hideUnapprovedTargetInterCompanyEntityLedger(v, context, id)) {
    return { debit: 0, credit: 0 };
  }

  switch (context) {
    case "account":
      return getAccountLedgerTransactionAmounts(v, id);
    case "party":
      return getPartyLedgerTransactionAmounts(v, id);
    case "staff":
      return getStaffRpLedgerDebitCredit(v, id, processedTaxes);
    case "tax":
      return getTaxRpLedgerDebitCredit(v, id);
    case "expense":
      return getIncomeExpenseRpLedgerDebitCredit(v, id);
    default:
      return { debit: 0, credit: 0 };
  }
}

/** Opening balance + Σ(debit − credit) — ledger closing balance jaisa. */
export function computeRpLedgerAlignedBalance(
  openingBalance: number,
  vouchers: any[],
  entityId: string,
  context: RpLedgerContext,
  processedTaxes: any[] = []
): number {
  let balance = toNum(openingBalance);
  for (const v of vouchers) {
    const { debit, credit } = getRpLedgerDebitCredit(v, entityId, context, processedTaxes);
    balance += debit - credit;
  }
  return balance;
}

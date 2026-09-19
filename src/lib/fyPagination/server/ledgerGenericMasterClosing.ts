/**
 * Server-safe single-entity ledger amounts for staff / tax / expense / item closing snapshots.
 */
import { getInterCompanyLedgerAmounts } from "@/lib/interCompany/interCompanyLedgerAmounts";
import {
  getOutflowBillWiseLinkAmount,
  getPaymentOutPartyLinkAmount,
} from "@/lib/payment-allocation-utils";
import { sumJournalAmountsForAccount } from "@/lib/journalLedgerAmounts";

function isJournalLikeVoucher(transaction: any): boolean {
  const type = String(transaction?.type || "");
  return type === "journal" || type === "adjustment";
}

function isRegularJournalLikeVoucher(transaction: any): boolean {
  return isJournalLikeVoucher(transaction) && transaction?.subType !== "add_salary";
}

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type GenericMasterClosingContext = "staff" | "tax" | "expense" | "item";

export type GenericMasterClosingRow = {
  id: string;
  context: GenericMasterClosingContext;
  purchasePrice?: number;
  unitConversions?: unknown[];
};

function staffAmounts(transaction: any, staffId: string, processedTaxes: any[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const amount = toNum(transaction.amount || transaction.total || 0);
  const paymentOutPayeeAmount =
    transaction.type === "payment_out" && toNum(transaction.payeeAmount) > 0
      ? toNum(transaction.payeeAmount)
      : amount;
  const paymentOutOtherChargeAmount =
    transaction.type === "payment_out" ? toNum(transaction.otherChargeAmount) : 0;

  if (transaction.type === "note") return { debit, credit };

  if (transaction.type === "inter_company" && transaction.staffId === staffId) {
    const ic = getInterCompanyLedgerAmounts(transaction, "staff", staffId, amount);
    if (ic.touched) return { debit: ic.debit, credit: ic.credit };
  }

  if (transaction.type === "payment_out" && transaction.staffId === staffId) {
    debit = paymentOutPayeeAmount;
  } else if (transaction.type === "payment_out" && transaction.otherChargeAccountId === staffId) {
    debit = paymentOutOtherChargeAmount;
  } else if (transaction.type === "pay_salary" && transaction.staffId === staffId) {
    debit = amount;
  } else if (transaction.type === "payment_in" && transaction.staffId === staffId) {
    credit = amount;
  } else if (transaction.type === "add_salary" && transaction.staffId === staffId) {
    credit = amount;
  } else if (transaction.type === "journal" && transaction.subType === "add_salary" && Array.isArray(transaction.entries)) {
    const staffEntry = transaction.entries.find((e: any) => {
      const isStaff = e.accountId === staffId;
      const hasCredit = toNum(e.credit) > 0;
      const isNotTax = !processedTaxes.some((pt) => pt.id === e.accountId);
      return isStaff && hasCredit && isNotTax;
    });
    if (staffEntry) credit = toNum(staffEntry.credit);
  } else if (
    (transaction.type === "journal" || transaction.type === "adjustment") &&
    transaction.subType !== "add_salary" &&
    Array.isArray(transaction.entries)
  ) {
    for (const e of transaction.entries) {
      if (e.accountId !== staffId) continue;
      if (processedTaxes.some((pt) => pt.id === e.accountId)) continue;
      debit += toNum(e.debit);
      credit += toNum(e.credit);
    }
  }

  return { debit, credit };
}

function taxAmounts(transaction: any, taxAccountId: string, processedTaxes: any[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const amount = toNum(transaction.amount || transaction.total || 0);

  if (transaction.type === "note") return { debit, credit };

  if (transaction.type === "inter_company") {
    const ic = getInterCompanyLedgerAmounts(transaction, "tax", taxAccountId, amount);
    if (ic.touched) return { debit: ic.debit, credit: ic.credit };
  }

  if (transaction.type === "payment_out" && transaction.taxAccountId === taxAccountId) {
    const paymentOutTaxAmount = toNum(transaction.payeeAmount) > 0 ? toNum(transaction.payeeAmount) : amount;
    debit += paymentOutTaxAmount;
  } else if (transaction.type === "payment_in" && transaction.taxAccountId === taxAccountId) {
    credit += amount;
  } else if (Array.isArray(transaction.lineItems)) {
    for (const line of transaction.lineItems) {
      if (line.taxAccountId !== taxAccountId) continue;
      const taxAmt = toNum(line.taxAmount);
      if (transaction.type === "purchase") debit += taxAmt;
      else if (transaction.type === "sale") credit += taxAmt;
    }
  } else if (isJournalLikeVoucher(transaction) && Array.isArray(transaction.entries)) {
    const journalAmt = sumJournalAmountsForAccount(transaction.entries, taxAccountId);
    debit += journalAmt.debit;
    credit += journalAmt.credit;
  }

  return { debit, credit };
}

function expenseAmounts(transaction: any, entityId: string): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const amount = toNum(transaction.amount || transaction.total || 0);
  const paymentOutPayeeAmount =
    transaction.type === "payment_out" ? getPaymentOutPartyLinkAmount(transaction) : amount;
  const directExpenseMainAmount =
    transaction.type === "direct_expense" ? getOutflowBillWiseLinkAmount(transaction) : amount;
  const paymentOutOtherChargeAmount =
    transaction.type === "payment_out" ? toNum(transaction.otherChargeAmount) : 0;
  const directExpenseOtherChargeAmount =
    transaction.type === "direct_expense" ? toNum(transaction.otherChargeAmount) : 0;
  const subTotal = toNum(transaction.subTotal);
  const discount = toNum(transaction.discount);
  const taxableAmount = subTotal > 0 ? subTotal - discount : amount;

  if (transaction.type === "direct_expense" && (transaction.toAccountId || transaction.expenseAccountId) === entityId) {
    debit += directExpenseMainAmount;
  }
  if (transaction.type === "payment_out" && (transaction.expenseAccountId || transaction.toAccountId) === entityId) {
    debit += paymentOutPayeeAmount;
  }
  if (transaction.type === "payment_out" && transaction.otherChargeAccountId === entityId) {
    debit += paymentOutOtherChargeAmount;
  }
  if (transaction.type === "direct_expense" && transaction.otherChargeAccountId === entityId) {
    debit += directExpenseOtherChargeAmount;
  }
  if (transaction.type === "journal" && transaction.subType === "add_salary" && Array.isArray(transaction.entries)) {
    const debitEntry = transaction.entries.find((e: any) => e.accountId === entityId && toNum(e.debit) > 0);
    if (debitEntry) debit += toNum(debitEntry.debit);
  }
  if (transaction.type === "direct_income" && transaction.incomeAccountId === entityId) {
    credit += amount;
  }
  if (transaction.type === "payment_in" && (transaction.incomeAccountId || transaction.toAccountId) === entityId) {
    credit += amount;
  }
  if (transaction.type === "sale") {
    const selectedSalesAccountId = transaction.salesAccountId || transaction.incomeAccountId || "sales_account";
    if (selectedSalesAccountId === entityId) credit += taxableAmount;
  } else if (transaction.type === "purchase") {
    const selectedPurchaseAccountId = transaction.purchaseAccountId || transaction.expenseAccountId || "purchase_account";
    if (selectedPurchaseAccountId === entityId) debit += taxableAmount;
  }
  if (isRegularJournalLikeVoucher(transaction) && Array.isArray(transaction.entries)) {
    const journalAmt = sumJournalAmountsForAccount(transaction.entries, entityId);
    debit += journalAmt.debit;
    credit += journalAmt.credit;
  }

  return { debit, credit };
}

function itemAmounts(transaction: any, master: GenericMasterClosingRow): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const itemsArray = transaction.lineItems || transaction.items;
  const lineItem = itemsArray?.find((li: any) => li.itemId === master.id);
  if (!lineItem) return { debit, credit };

  const qty = toNum(lineItem.quantity);
  const rate = toNum(lineItem.rate);
  if (["purchase", "direct_income"].includes(transaction.type)) {
    debit += qty * rate;
  }
  if (["sale", "direct_expense"].includes(transaction.type)) {
    const purchasePrice =
      toNum(transaction.totalPurchasePrice) > 0
        ? toNum(transaction.totalPurchasePrice)
        : qty * (toNum(master.purchasePrice) || rate);
    credit += purchasePrice;
  }

  return { debit, credit };
}

export function getGenericMasterClosingAmounts(
  transaction: any,
  master: GenericMasterClosingRow,
  processedTaxes: any[] = []
): { debit: number; credit: number } {
  switch (master.context) {
    case "staff":
      return staffAmounts(transaction, master.id, processedTaxes);
    case "tax":
      return taxAmounts(transaction, master.id, processedTaxes);
    case "expense":
      return expenseAmounts(transaction, master.id);
    case "item":
      return itemAmounts(transaction, master);
    default:
      return { debit: 0, credit: 0 };
  }
}

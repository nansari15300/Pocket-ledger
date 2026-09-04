import { getTransactionAmounts } from "@/hooks/use-transactions";
import { sumJournalAmountsForAccount } from "@/lib/journalLedgerAmounts";
import { filterVouchersInFy } from "@/lib/reports/anusuchi13Confirmation";

export type AccountConfirmationSummary = {
  openingBalance: number;
  sales: ConfirmationActivityAmount;
  salesReturn: ConfirmationActivityAmount;
  purchases: ConfirmationActivityAmount;
  purchaseReturn: ConfirmationActivityAmount;
  payments: ConfirmationActivityAmount;
  tdsDeducted: number;
  closingBalance: number;
};

export type ConfirmationActivityAmount = {
  exVatDr: number;
  exVatCr: number;
  vatDr: number;
  vatCr: number;
  totalDr: number;
  totalCr: number;
};

function parseVoucherDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeOpeningBalanceAtFyStart(
  entity: { id: string; openingBalance?: number },
  context: "party" | "staff" | "tax",
  allVouchers: any[],
  fyStart: Date
): number {
  let running = toNum(entity.openingBalance);
  const before = allVouchers
    .map((v) => ({ v, d: parseVoucherDate(v?.date) }))
    .filter(({ d }) => d && d.getTime() < fyStart.getTime())
    .sort((a, b) => (a.d!.getTime() > b.d!.getTime() ? 1 : -1));

  for (const { v } of before) {
    const { debit, credit } = getTransactionAmounts(v, context, entity);
    running += debit - credit;
  }
  return running;
}

function emptyActivity(): ConfirmationActivityAmount {
  return { exVatDr: 0, exVatCr: 0, vatDr: 0, vatCr: 0, totalDr: 0, totalCr: 0 };
}

function addActivity(target: ConfirmationActivityAmount, values: ConfirmationActivityAmount): void {
  target.exVatDr += values.exVatDr;
  target.exVatCr += values.exVatCr;
  target.vatDr += values.vatDr;
  target.vatCr += values.vatCr;
  target.totalDr += values.totalDr;
  target.totalCr += values.totalCr;
}

function voucherActivity(v: any, debit: number, credit: number): ConfirmationActivityAmount {
  const subTotal = toNum(v.subTotal);
  const discount = toNum(v.discount);
  const tax = toNum(v.tax);
  const total = toNum(v.total || v.amount) || Math.abs(debit - credit);
  const exVat = subTotal > 0 ? Math.max(0, subTotal - discount) : Math.max(0, total - tax);
  const result = emptyActivity();
  if (debit > 0) {
    result.exVatDr += exVat;
    result.vatDr += tax;
    result.totalDr += total;
  }
  if (credit > 0) {
    result.exVatCr += exVat;
    result.vatCr += tax;
    result.totalCr += total;
  }
  return result;
}

function sumPartyActivitiesInFy(partyId: string, fyVouchers: any[]) {
  const sales = emptyActivity();
  const salesReturn = emptyActivity();
  const purchases = emptyActivity();
  const purchaseReturn = emptyActivity();
  const payments = emptyActivity();
  for (const v of fyVouchers) {
    const isPartyVoucher = String(v.partyId ?? "") === String(partyId);
    const type = String(v.type || "").toLowerCase();
    if (["sale", "sale_service", "sales"].includes(type) && isPartyVoucher) {
      addActivity(sales, voucherActivity(v, toNum(v.total || v.amount), 0));
    } else if (["sale_return", "sales_return"].includes(type) && isPartyVoucher) {
      addActivity(salesReturn, voucherActivity(v, 0, toNum(v.total || v.amount)));
    } else if (["purchase", "purchase_service", "purchases"].includes(type) && isPartyVoucher) {
      addActivity(purchases, voucherActivity(v, 0, toNum(v.total || v.amount)));
    } else if (["purchase_return", "purchases_return"].includes(type) && isPartyVoucher) {
      addActivity(purchaseReturn, voucherActivity(v, toNum(v.total || v.amount), 0));
    } else if (["payment_in", "payment_out", "direct_income", "direct_expense"].includes(type) && isPartyVoucher) {
      const amounts = getTransactionAmounts(v, "party", { id: partyId });
      addActivity(payments, voucherActivity(v, amounts.debit, amounts.credit));
    } else if (type === "journal" && Array.isArray(v.entries)) {
      const amounts = sumJournalAmountsForAccount(v.entries, partyId);
      if (amounts.debit || amounts.credit) addActivity(payments, voucherActivity(v, amounts.debit, amounts.credit));
    }
  }
  return { sales, salesReturn, purchases, purchaseReturn, payments };
}

function sumTdsForParty(partyId: string, fyVouchers: any[]): number {
  let tds = 0;
  for (const v of fyVouchers) {
    if (v.type === "payment_out" && String(v.partyId ?? "") === String(partyId)) {
      tds += toNum(v.tax);
    }
    if (v.type === "journal" && Array.isArray(v.entries)) {
      const narration = String(v.narration ?? "").toLowerCase();
      if (!narration.includes("tds")) continue;
      const amounts = sumJournalAmountsForAccount(v.entries, partyId);
      tds += amounts.credit;
    }
  }
  return tds;
}

function sumStaffActivityInFy(staffId: string, fyVouchers: any[]) {
  let activityTotal = 0;
  for (const v of fyVouchers) {
    if (v.type === "payment_out" && String(v.partyId ?? v.staffId ?? "") === String(staffId)) {
      activityTotal += toNum(v.payeeAmount || v.amount || v.total);
    }
    if (v.type === "salary" && Array.isArray(v.lineItems)) {
      for (const line of v.lineItems) {
        if (String(line.staffId ?? "") === String(staffId)) {
          activityTotal += toNum(line.afterTaxSalary || line.salary);
        }
      }
    }
  }
  return { activityExVat: activityTotal, activityVat: 0, activityTotal };
}

function sumTaxActivityInFy(taxId: string, fyVouchers: any[]) {
  let activityTotal = 0;
  for (const v of fyVouchers) {
    if (Array.isArray(v.entries)) {
      const amounts = sumJournalAmountsForAccount(v.entries, taxId);
      activityTotal += amounts.debit + amounts.credit;
    }
    if (toNum(v.taxAccountId) || String(v.taxAccountId ?? "") === String(taxId)) {
      activityTotal += toNum(v.tax);
    }
  }
  return { activityExVat: activityTotal, activityVat: 0, activityTotal };
}

export function formatAccountConfirmationFyLabel(fyKey: string): string {
  const parts = fyKey.split("-").filter(Boolean);
  if (parts.length === 2) {
    const end = parts[1]!;
    return `${parts[0]}-${end.slice(-2)}`;
  }
  return fyKey;
}

export function computeAccountConfirmationSummary(
  entity: { id: string; openingBalance?: number; balance?: number },
  context: "party" | "staff" | "tax",
  allVouchers: any[],
  fyStart: Date,
  fyEnd: Date
): AccountConfirmationSummary {
  const fyVouchers = filterVouchersInFy(allVouchers, fyStart, fyEnd);
  const openingBalance = computeOpeningBalanceAtFyStart(entity, context, allVouchers, fyStart);

  const empty = emptyActivity();
  let sales = empty;
  let salesReturn = empty;
  let purchases = empty;
  let purchaseReturn = empty;
  let payments = empty;
  let tdsDeducted = 0;

  if (context === "party") {
    ({ sales, salesReturn, purchases, purchaseReturn, payments } = sumPartyActivitiesInFy(entity.id, fyVouchers));
    tdsDeducted = sumTdsForParty(entity.id, fyVouchers);
  } else if (context === "staff") {
    const staff = sumStaffActivityInFy(entity.id, fyVouchers);
    payments = { ...empty, totalDr: staff.activityTotal };
  } else {
    const tax = sumTaxActivityInFy(entity.id, fyVouchers);
    payments = { ...empty, totalDr: tax.activityTotal };
  }

  let closingBalance = openingBalance;
  for (const v of fyVouchers) {
    const { debit, credit } = getTransactionAmounts(v, context, entity);
    closingBalance += debit - credit;
  }

  return {
    openingBalance,
    sales,
    salesReturn,
    purchases,
    purchaseReturn,
    payments,
    tdsDeducted,
    closingBalance,
  };
}

export type AccountConfirmationPrintInput = {
  recipientName: string;
  recipientPan?: string;
  recipientAddress?: string;
  fyKey: string;
  fyRangeLabel: string;
  letterDate: string;
  summary: AccountConfirmationSummary;
  auditorEmail?: string;
};

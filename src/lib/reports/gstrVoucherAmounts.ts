import { endOfDay, startOfDay } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";

function voucherJsDate(date: unknown): Date | null {
  if (!date) return null;
  const d =
    typeof date === "object" && date && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function"
      ? (date as { toDate: () => Date }).toDate()
      : new Date(date as string | number | Date);
  return d instanceof Date && !isNaN(d.getTime()) ? d : null;
}

export function gstrVoucherTime(date: unknown): number {
  return voucherJsDate(date)?.getTime() ?? 0;
}

/** First–last voucher dates for GSTR “All” pill / print header. */
export function resolveGstrVoucherDateSpan(vouchers: Array<{ date?: unknown }>): DateRange | undefined {
  let min: Date | undefined;
  let max: Date | undefined;
  for (const v of vouchers) {
    const d = voucherJsDate(v.date);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min) return undefined;
  return { from: startOfDay(min), to: endOfDay(max ?? min) };
}

/** Sale / purchase voucher amounts for GSTR reports — matches Balance Sheet tax resolution. */
export function resolveGstrSalePurchaseAmounts(v: {
  subTotal?: number | null;
  total?: number | null;
  amount?: number | null;
  discount?: number | null;
  taxAmount?: number | null;
  tax?: number | null;
  lineItems?: Array<{ taxAmount?: number | null }> | null;
}): { taxableAmount: number; taxAmount: number; totalAmount: number } {
  const amount = Number(v.total ?? v.amount ?? 0);
  const subTotal = Number(v.subTotal ?? amount);
  let taxAmount = Number(v.taxAmount ?? v.tax ?? 0);
  if (taxAmount === 0 && Array.isArray(v.lineItems)) {
    taxAmount = v.lineItems.reduce((sum, li) => sum + Number(li?.taxAmount ?? 0), 0);
  }
  const taxableAmount = Math.max(0, subTotal - Number(v.discount ?? 0));
  const totalAmount = taxableAmount + taxAmount;
  return { taxableAmount, taxAmount, totalAmount };
}

type GstrTaxIdVoucher = {
  type?: string;
  taxAccountId?: string | null;
  lineItems?: Array<{ taxAccountId?: string | null }> | null;
};

/** VAT/tax accounts selected on sale/purchase lines (and header, if any). */
export function collectGstrInvoiceTaxAccountIds(vouchers: GstrTaxIdVoucher[]): Set<string> {
  const ids = new Set<string>();
  for (const v of vouchers) {
    if (v.type !== "sale" && v.type !== "purchase") continue;
    const header = String(v.taxAccountId || "").trim();
    if (header) ids.add(header);
    if (!Array.isArray(v.lineItems)) continue;
    for (const line of v.lineItems) {
      const id = String(line?.taxAccountId || "").trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function gstrVoucherInDateRange(v: { date?: unknown }, range?: DateRange): boolean {
  if (!range?.from) return true;
  const d = voucherJsDate(v.date);
  if (!d) return false;
  const to = range.to || range.from;
  return d >= range.from && d <= to;
}

/** Payment-out to tax uses payee amount when set (same as tax ledger). */
export function gstrTaxPaymentAmount(v: {
  type?: string;
  amount?: number | null;
  total?: number | null;
  payeeAmount?: number | null;
}): number {
  const fallback = Number(v.total ?? v.amount ?? 0);
  if (v.type === "payment_out") {
    const payee = Number(v.payeeAmount || 0);
    return payee > 0 ? payee : fallback;
  }
  return fallback;
}

/** Positive → Dr suffix, negative → Cr suffix (`formatCurrency`). Zero stays 0 (Dr). */
export function gstrSignedAmount(amount: number, side: "dr" | "cr"): number {
  const abs = Math.abs(Number(amount) || 0);
  return side === "cr" ? -abs : abs;
}

/** Screen/print money: Cr rows get Cr suffix (including 0 — not Dr on a red amount). */
export function formatGstrDrCrAmount(
  formatCurrencyForPrint: (amount: number, options?: { noSuffix?: boolean }) => string,
  amount: number,
  side: "dr" | "cr",
  showDrCr: boolean
): string {
  const abs = Math.abs(Number(amount) || 0);
  if (!showDrCr) return formatCurrencyForPrint(abs, { noSuffix: true });
  if (side === "cr" && abs === 0) {
    return `${formatCurrencyForPrint(0, { noSuffix: true })} Cr`;
  }
  return formatCurrencyForPrint(gstrSignedAmount(abs, side));
}

/** Payment in/out whose payee is a VAT account used on sale/purchase. */
export function isGstrTaxAccountPayment(
  v: { type?: string; taxAccountId?: string | null },
  taxAccountIds: Set<string>
): boolean {
  if (v.type !== "payment_out" && v.type !== "payment_in") return false;
  const taxId = String(v.taxAccountId || "").trim();
  return Boolean(taxId && taxAccountIds.has(taxId));
}

export type GstrLineRow = {
  id: string;
  voucher: unknown;
  date: unknown;
  voucherNumber: string;
  partyId: string;
  partyName: string;
  partyGSTIN: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export type GstrAccountGroup = {
  key: string;
  partyId: string;
  partyName: string;
  partyGSTIN: string;
  rows: GstrLineRow[];
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export function groupGstrLinesByAccount(rows: GstrLineRow[]): GstrAccountGroup[] {
  const map = new Map<string, GstrAccountGroup>();
  for (const row of rows) {
    const key = String(row.partyId || "").trim() || `__name:${row.partyName}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        partyId: row.partyId,
        partyName: row.partyName,
        partyGSTIN: row.partyGSTIN,
        rows: [],
        taxableAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
      };
      map.set(key, group);
    }
    group.rows.push(row);
    group.taxableAmount += row.taxableAmount;
    group.taxAmount += row.taxAmount;
    group.totalAmount += row.totalAmount;
  }
  for (const group of map.values()) {
    group.rows.sort((a, b) => {
      const byDate = gstrVoucherTime(a.date) - gstrVoucherTime(b.date);
      if (byDate !== 0) return byDate;
      return String(a.voucherNumber).localeCompare(String(b.voucherNumber));
    });
  }
  return [...map.values()].sort((a, b) => a.partyName.localeCompare(b.partyName, undefined, { sensitivity: "base" }));
}

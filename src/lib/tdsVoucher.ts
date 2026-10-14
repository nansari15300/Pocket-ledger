/**
 * TDS on sale/purchase line items — taxable base (ex-VAT), party net = gross total − TDS.
 */
import { isSaleOrPurchaseBillVoucherType } from "@/lib/payment-allocation-utils";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function isTdsTaxLedgerName(name: unknown): boolean {
  return /tds/i.test(String(name ?? "").trim());
}

/** Sale: receivable (or generic TDS without "payable-only" in name). */
export function isTdsTaxForSaleSide(name: unknown): boolean {
  const n = String(name ?? "").trim();
  if (!isTdsTaxLedgerName(n)) return false;
  const lower = n.toLowerCase();
  if (lower.includes("payable") && !lower.includes("receivable")) return false;
  return true;
}

/** Purchase: payable (or generic TDS without "receivable-only" in name). */
export function isTdsTaxForPurchaseSide(name: unknown): boolean {
  const n = String(name ?? "").trim();
  if (!isTdsTaxLedgerName(n)) return false;
  const lower = n.toLowerCase();
  if (lower.includes("receivable") && !lower.includes("payable")) return false;
  return true;
}

export function filterTdsTaxLedgersForSale<T extends { id: string; name?: string }>(taxes: T[]): T[] {
  return taxes.filter((t) => isTdsTaxForSaleSide(t.name));
}

export function filterTdsTaxLedgersForPurchase<T extends { id: string; name?: string }>(taxes: T[]): T[] {
  return taxes.filter((t) => isTdsTaxForPurchaseSide(t.name));
}

export function saleTdsDefaultStorageKey(companyId: string): string {
  return `pocket-ledger:sale:tds-default:${companyId || "global"}`;
}

export function purchaseTdsDefaultStorageKey(companyId: string): string {
  return `pocket-ledger:purchase:tds-default:${companyId || "global"}`;
}

export function readStoredTdsDefault(side: "sale" | "purchase", companyId: string): string {
  try {
    const key = side === "sale" ? saleTdsDefaultStorageKey(companyId) : purchaseTdsDefaultStorageKey(companyId);
    return String(localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

export function writeStoredTdsDefault(side: "sale" | "purchase", companyId: string, taxAccountId: string): void {
  const id = String(taxAccountId || "").trim();
  if (!id) return;
  const key = side === "sale" ? saleTdsDefaultStorageKey(companyId) : purchaseTdsDefaultStorageKey(companyId);
  localStorage.setItem(key, id);
}

/** Line taxable base for TDS — same ex-VAT `amount` stored on sale/purchase lines. */
export function lineTaxableBaseForTds(line: { amount?: unknown }): number {
  return round2(Number(line?.amount) || 0);
}

export function calcLineTdsAmount(
  taxableBase: number,
  tdsAccountId: string | undefined,
  rateByTaxId: Map<string, number>
): number {
  const id = String(tdsAccountId ?? "").trim();
  if (!id || taxableBase <= 0) return 0;
  const rate = rateByTaxId.get(id) ?? 0;
  if (rate <= 0) return 0;
  return round2(taxableBase * rate);
}

export function sumVoucherLineTds(v: { lineItems?: unknown; tds?: unknown } | null | undefined): number {
  const header = Number((v as { tds?: unknown })?.tds);
  if (Number.isFinite(header) && header > 0) return round2(header);
  if (!Array.isArray(v?.lineItems)) return 0;
  let sum = 0;
  for (const li of v.lineItems as { tdsAmount?: unknown }[]) {
    sum += Number(li?.tdsAmount) || 0;
  }
  return round2(sum);
}

/** Invoice gross (VAT included in `total`). */
export function getSalePurchaseGrossTotal(v: { total?: unknown; amount?: unknown } | null | undefined): number {
  return round2(Number(v?.total ?? v?.amount ?? 0) || 0);
}

/** Party Dr/Cr and bill-wise link target. */
export function getSalePurchasePartyAmount(v: { total?: unknown; amount?: unknown; lineItems?: unknown; tds?: unknown } | null | undefined): number {
  const gross = getSalePurchaseGrossTotal(v);
  const tds = sumVoucherLineTds(v);
  if (tds <= 0) return gross;
  return Math.max(0, round2(gross - tds));
}

export function getSalePurchaseBillWiseTargetTotal(v: { type?: string; total?: unknown; amount?: unknown; lineItems?: unknown; tds?: unknown } | null | undefined): number {
  if (!v || !isSaleOrPurchaseBillVoucherType(String(v.type ?? ""))) {
    return round2(Number(v?.total ?? v?.amount ?? 0) || 0);
  }
  return getSalePurchasePartyAmount(v);
}

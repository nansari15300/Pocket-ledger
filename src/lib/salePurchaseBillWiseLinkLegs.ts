/**
 * Sale/Purchase bill-wise link legs: party (taxable + tax = total - TDS) + each TDS account (tax/expense/sales accounts excluded).
 * Same pattern as Add Salary After-tax / Tax balance tabs.
 */
import type { BillWiseEntityKind } from "@/lib/payment-allocation-utils";

export type SalePurchaseBillWiseLegKind = "party" | "tax" | "tds";

export type SalePurchaseBillWiseLeg = {
  kind: SalePurchaseBillWiseLegKind;
  accountId: string;
  label: string;
  /** Target amount for this leg (before subtracting already-linked). */
  totalAmount: number;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function taxDisplayName(taxes: any[], id: string): string {
  const t = (taxes || []).find((x: any) => String(x?.id) === String(id));
  return String((t as any)?.name || (t as any)?.label || id).trim() || id;
}

/** Build radio tabs for sale/purchase link card — one per non-expense account on the voucher. */
export function resolveSalePurchaseBillWiseLegs(args: {
  lineItems: any[] | null | undefined;
  partyId: string;
  partyName: string;
  partyAmount: number;
  taxes?: any[];
}): SalePurchaseBillWiseLeg[] {
  const partyId = String(args.partyId || "").trim();
  const legs: SalePurchaseBillWiseLeg[] = [];
  if (partyId) {
    legs.push({
      kind: "party",
      accountId: partyId,
      label: String(args.partyName || "Party").trim() || "Party",
      totalAmount: Math.max(0, round2(args.partyAmount)),
    });
  }

  const tdsById = new Map<string, number>();
  for (const li of args.lineItems || []) {
    const tdsId = String(li?.tdsAccountId || "").trim();
    const tdsAmt = round2(Number(li?.tdsAmount) || 0);
    if (tdsId && tdsAmt > 0) tdsById.set(tdsId, round2((tdsById.get(tdsId) || 0) + tdsAmt));
  }

  // Tax is counted with the taxable amount under the party leg (no separate VAT/tax link leg).
  for (const [id, amt] of tdsById) {
    legs.push({
      kind: "tds",
      accountId: id,
      label: `TDS · ${taxDisplayName(args.taxes || [], id)}`,
      totalAmount: amt,
    });
  }
  return legs;
}

export function salePurchaseLegToEntityKind(kind: SalePurchaseBillWiseLegKind): BillWiseEntityKind {
  return kind;
}

export function salePurchaseLinkSectionTitle(kind: SalePurchaseBillWiseLegKind): string {
  if (kind === "tax") return "Link for tax";
  if (kind === "tds") return "Link for TDS";
  return "Link for bill wise";
}

export function salePurchaseLinkButtonLabel(kind: SalePurchaseBillWiseLegKind, mode: "sale" | "purchase"): string {
  if (kind === "tax") return "Link payment to tax";
  if (kind === "tds") return "Link payment to TDS";
  return mode === "sale" ? "Link to Cr" : "Link to Dr";
}

export function salePurchaseLinkDialogEyebrow(kind: SalePurchaseBillWiseLegKind): string {
  if (kind === "tax") return "Link for tax";
  if (kind === "tds") return "Link for TDS";
  return "Link for bill wise";
}

export function salePurchaseLinkDialogTitle(kind: SalePurchaseBillWiseLegKind): string {
  if (kind === "tax") return "Link payment to tax";
  if (kind === "tds") return "Link payment to TDS";
  return "Link payment to party";
}

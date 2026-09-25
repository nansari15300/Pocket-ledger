import { isAdminPanelCompanyLocalId } from "@/lib/adminPanelCompany/ledgerMode";

/** Bank-side subscription receipt — hide from subscriber party ledger (sale stays on party). */
export function isAdminPanelSubscriptionReceiptVoucher(v: {
  kind?: unknown;
  voucherType?: unknown;
}): boolean {
  const kind = String(v?.kind ?? "").trim();
  if (kind === "subscription-receipt") return true;
  return (
    kind === "subscription-receipt" &&
    String(v?.voucherType ?? "").trim().toLowerCase() === "payment_in"
  );
}

export function filterVouchersForAdminSubscriberPartyLedger<T>(
  companyId: string | null | undefined,
  vouchers: readonly T[]
): T[] {
  if (!isAdminPanelCompanyLocalId(companyId)) return [...vouchers];
  return vouchers.filter((v) => !isAdminPanelSubscriptionReceiptVoucher(v as { kind?: unknown }));
}

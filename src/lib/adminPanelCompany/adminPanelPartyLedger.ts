import { isAdminPanelCompanyLocalId } from "@/lib/adminPanelCompany/ledgerMode";

/** Mirrored subscription Payment In (`kind: subscription-receipt`) — same party as sale; must show on subscriber ledger for receivable balance. */
export function isAdminPanelSubscriptionReceiptVoucher(v: {
  kind?: unknown;
  voucherType?: unknown;
}): boolean {
  const kind = String(v?.kind ?? "").trim();
  return kind === "subscription-receipt";
}

/** Admin Panel subscriber party ledger: include sale + mirrored Payment In (no bank-only hide). */
export function filterVouchersForAdminSubscriberPartyLedger<T>(
  companyId: string | null | undefined,
  vouchers: readonly T[]
): T[] {
  if (!isAdminPanelCompanyLocalId(companyId)) return [...vouchers];
  return [...vouchers];
}

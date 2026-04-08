/**
 * Ledger / statement rows kabhi synthetic `id` use karte hain (group contra split, spend-wise link,
 * opening-balance fragment). Firestore `vouchers/{id}` update approve ke liye hamesha real doc id chahiye.
 */
export function resolveLedgerRowToVoucherId(
  voucher: { id?: string; _baseVoucherId?: string } | null | undefined
): string | null {
  if (!voucher) return null;
  if (typeof voucher._baseVoucherId === "string" && voucher._baseVoucherId.length > 0) {
    return voucher._baseVoucherId;
  }
  const rawId = typeof voucher.id === "string" ? voucher.id : "";
  if (!rawId || rawId === "__opening_balance_group__") return null;
  if (rawId.startsWith("__fiscal_partition_")) return null;
  if (rawId.includes("-in-")) return rawId.substring(0, rawId.indexOf("-in-"));
  if (rawId.endsWith("-ob-link")) return rawId.substring(0, rawId.length - "-ob-link".length);
  // Group page contra: `${base}-out` / `${base}-in` (use-transactions); `_`baseVoucherId pe fallback
  if (rawId.endsWith("-out")) return rawId.slice(0, -"-out".length);
  if (rawId.endsWith("-in")) return rawId.slice(0, -"-in".length);
  return rawId;
}

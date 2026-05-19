/** Ledger row / filter: voucher approve na hua (`isApproved` strictly true nahi). */
export function isLedgerTransactionUnapproved(
  tx: { isApproved?: boolean; type?: string; id?: string } | null | undefined
): boolean {
  if (tx == null) return false;
  if (tx.type === "opening_balance" || String(tx.id || "").startsWith("opening_balance")) return false;
  return tx.isApproved !== true;
}

/** PC "Unapproved" chip: sirf pending-approval rows. */
export function filterLedgerUnapprovedOnly<T extends { isApproved?: boolean }>(
  list: T[],
  onlyUnapproved: boolean
): T[] {
  if (!onlyUnapproved) return list;
  return list.filter((tx) => isLedgerTransactionUnapproved(tx));
}

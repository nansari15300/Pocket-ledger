/** Ledger row / filter: voucher approve na hua (`isApproved` strictly true nahi). */
export function isLedgerTransactionUnapproved(
  tx: { isApproved?: boolean; type?: string; id?: string } | null | undefined
): boolean {
  if (tx == null) return false;
  if (tx.type === "opening_balance" || String(tx.id || "").startsWith("opening_balance")) return false;
  return tx.isApproved !== true;
}

/** Inter Company: peer company ne fields change kiye — apply pending (blue row). */
export function isLedgerTransactionPeerPendingChange(
  tx:
    | {
        type?: string;
        interCompanyPeerPending?: unknown;
      }
    | null
    | undefined
): boolean {
  if (tx == null) return false;
  if (String(tx.type || "") !== "inter_company") return false;
  const p = tx.interCompanyPeerPending;
  if (!p || typeof p !== "object") return false;
  const proposed = (p as { proposed?: unknown }).proposed;
  return !!proposed && typeof proposed === "object" && Object.keys(proposed as object).length > 0;
}

/** PC "Unapproved" chip: sirf pending-approval rows. */
export function filterLedgerUnapprovedOnly<T extends { isApproved?: boolean }>(
  list: T[],
  onlyUnapproved: boolean
): T[] {
  if (!onlyUnapproved) return list;
  return list.filter((tx) => isLedgerTransactionUnapproved(tx));
}

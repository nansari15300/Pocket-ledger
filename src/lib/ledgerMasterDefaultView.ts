/** Default master ledger list: tail window when no explicit date filter is set. */
export const MASTER_LEDGER_DEFAULT_TXN_COUNT = 10;

export const MASTER_LEDGER_DEFAULT_VIEW_LABEL = `Last ${MASTER_LEDGER_DEFAULT_TXN_COUNT} Txns`;

export function hasExplicitLedgerDateFilter(
  dateRange?: { from?: Date; to?: Date } | null
): boolean {
  return Boolean(dateRange?.from != null || dateRange?.to != null);
}

export function ledgerMasterDateRangeLabel(
  dateRange?: { from?: Date; to?: Date } | null,
  explicitRangeText?: string,
  txnCount = MASTER_LEDGER_DEFAULT_TXN_COUNT
): string {
  if (!hasExplicitLedgerDateFilter(dateRange)) {
    return `Last ${txnCount} Txns`;
  }
  return explicitRangeText?.trim() || MASTER_LEDGER_DEFAULT_VIEW_LABEL;
}

/** Statement / bill-wise tail paging: show only the newest N rows in default view. */
export function applyMasterLedgerDefaultTxnWindow<T>(
  transactions: readonly T[],
  dateRange?: { from?: Date; to?: Date } | null,
  limit = MASTER_LEDGER_DEFAULT_TXN_COUNT
): T[] {
  if (hasExplicitLedgerDateFilter(dateRange)) return [...transactions];
  if (transactions.length <= limit) return [...transactions];
  return transactions.slice(-limit);
}

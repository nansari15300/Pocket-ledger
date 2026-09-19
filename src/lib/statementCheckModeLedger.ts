import { statementCheckTxnId } from "@/lib/statementCheckModeStorage";
import { recomputeRunningBalanceTopToBottom } from "@/lib/transactionSort";

/** Check mode: hidden rows list + totals se bahar. */
export function filterTransactionsForStatementCheckMode<T extends { id?: string; _rowKey?: string }>(
  transactions: T[],
  hiddenIds: ReadonlySet<string>
): T[] {
  if (hiddenIds.size === 0) return transactions;
  return transactions.filter((t) => !hiddenIds.has(statementCheckTxnId(t)));
}

/**
 * Check mode: hidden rows hatao + running balance dubara (hidden Dr/Cr chain me nahi).
 */
export function applyStatementCheckModeHiddenToLedgerList<T extends { id?: string; _rowKey?: string }>(
  transactions: readonly T[],
  options: {
    checkModeActive: boolean;
    hiddenIds: ReadonlySet<string>;
    openingBalance: number;
  }
): T[] {
  const filtered = options.checkModeActive
    ? filterTransactionsForStatementCheckMode([...transactions], options.hiddenIds)
    : [...transactions];
  if (!options.checkModeActive || options.hiddenIds.size === 0) return filtered;
  return recomputeRunningBalanceTopToBottom(filtered, options.openingBalance);
}

/** Last row signed running balance from a chronological ledger list. */
export function ledgerClosingFromStatementList(
  list: ReadonlyArray<{ balance?: number; runningBalance?: number }>,
  fallbackOpening: number
): number {
  if (!list.length) return fallbackOpening;
  const last = list[list.length - 1];
  const bal = last?.balance ?? last?.runningBalance;
  return typeof bal === "number" && Number.isFinite(bal) ? bal : fallbackOpening;
}

/** Page / period totals — hidden rows ka Dr/Cr include mat karo. */
export function sumDrCrExcludingHidden<T extends { id?: string; _rowKey?: string; debit?: unknown; credit?: unknown }>(
  transactions: T[],
  hiddenIds: ReadonlySet<string>
): { dr: number; cr: number } {
  let dr = 0;
  let cr = 0;
  for (const t of transactions) {
    if (hiddenIds.has(statementCheckTxnId(t))) continue;
    dr += Number(t.debit) || 0;
    cr += Number(t.credit) || 0;
  }
  return { dr, cr };
}

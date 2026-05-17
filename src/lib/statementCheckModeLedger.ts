import { statementCheckTxnId } from "@/lib/statementCheckModeStorage";

/** Check mode: hidden rows list + totals se bahar. */
export function filterTransactionsForStatementCheckMode<T extends { id?: string; _rowKey?: string }>(
  transactions: T[],
  hiddenIds: ReadonlySet<string>
): T[] {
  if (hiddenIds.size === 0) return transactions;
  return transactions.filter((t) => !hiddenIds.has(statementCheckTxnId(t)));
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

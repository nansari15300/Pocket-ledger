/** Details ledger table tone — Closing Balance ribbon pills; persisted locally. */

export type LedgerTxnTableTone = "default" | "green" | "blue";

export const LEDGER_TXN_TABLE_TONE_KEY = "pocket-ledger:ledger-txn-table-tone:v1";
export const LEDGER_TXN_TABLE_TONE_CHANGED_EVENT = "pl-ledger-txn-table-tone-changed";

export function parseLedgerTxnTableTone(raw: unknown): LedgerTxnTableTone {
  if (raw === "green" || raw === "blue" || raw === "default") return raw;
  return "default";
}

export function readLedgerTxnTableTone(): LedgerTxnTableTone {
  if (typeof window === "undefined") return "default";
  try {
    return parseLedgerTxnTableTone(window.localStorage.getItem(LEDGER_TXN_TABLE_TONE_KEY));
  } catch {
    return "default";
  }
}

export function writeLedgerTxnTableTone(tone: LedgerTxnTableTone): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEDGER_TXN_TABLE_TONE_KEY, tone);
    window.dispatchEvent(
      new CustomEvent(LEDGER_TXN_TABLE_TONE_CHANGED_EVENT, { detail: { tone } })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

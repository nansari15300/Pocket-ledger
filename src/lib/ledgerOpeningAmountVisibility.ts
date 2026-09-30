"use client";

import { LEDGER_OPENING_HIDE_AMOUNT_ENABLED } from "@/lib/ledgerOpeningHideAmountFreeze";

const SESSION_KEY = "ledgerOpeningAmountHiddenKeys:v1";
const LEGACY_SESSION_KEY = "showOpeningBalanceAmount";

/** Stacked master books opening row (top). */
export const LEDGER_OB_BOOK_KEY = "ledger-ob-book";
/** Primary period / book opening row at top of ledger. */
export const LEDGER_OB_DATED_KEY = "ledger-ob-dated";

export function ledgerFyOpeningAmountKey(rowId: string): string {
  const id = String(rowId || "").trim();
  return id ? `ledger-fy-ob:${id}` : "ledger-fy-ob:unknown";
}

function parseHiddenKeys(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k) => typeof k === "string" && k.length > 0));
  } catch {
    return new Set();
  }
}

/** Opening rows whose Dr/Cr/Balance are hidden (per-row). Frozen when hide feature disabled. */
export function readHiddenLedgerOpeningAmountKeys(): Set<string> {
  if (!LEDGER_OPENING_HIDE_AMOUNT_ENABLED) return new Set();
  if (typeof sessionStorage === "undefined") return new Set();
  const set = parseHiddenKeys(sessionStorage.getItem(SESSION_KEY));
  const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
  if (legacy === "false" && !set.size) {
    set.add(LEDGER_OB_DATED_KEY);
  }
  return set;
}

export function writeHiddenLedgerOpeningAmountKeys(hidden: Set<string>): void {
  if (!LEDGER_OPENING_HIDE_AMOUNT_ENABLED) return;
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...hidden]));
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
}

/** @deprecated Use per-row keys — kept for any stale imports. */
export function readShowOpeningBalanceAmount(): boolean {
  return !readHiddenLedgerOpeningAmountKeys().has(LEDGER_OB_DATED_KEY);
}

/** @deprecated */
export function writeShowOpeningBalanceAmount(show: boolean): void {
  const hidden = readHiddenLedgerOpeningAmountKeys();
  if (show) hidden.delete(LEDGER_OB_DATED_KEY);
  else hidden.add(LEDGER_OB_DATED_KEY);
  writeHiddenLedgerOpeningAmountKeys(hidden);
}

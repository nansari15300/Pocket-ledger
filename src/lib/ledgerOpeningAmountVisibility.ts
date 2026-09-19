"use client";

const SESSION_KEY = "showOpeningBalanceAmount";

/** Ledger opening row Dr/Cr — default visible. */
export function readShowOpeningBalanceAmount(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw === "false") return false;
  return true;
}

export function writeShowOpeningBalanceAmount(show: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, String(show));
}

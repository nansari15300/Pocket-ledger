"use client";

import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import { PL_CLIENT_OFFLINE_FIRST_PERSIST_MS } from "@/lib/localMirrorServerMeta";

/** Voucher `date` / Firestore Timestamp / SQLite JSON → Date (server + P2P client same parser). */
export function voucherFieldToDate(value: unknown): Date | null {
  return parseFirestoreDateFieldToJsDate(value);
}

function isCalendarMidnight(d: Date): boolean {
  return (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  );
}

/** Entry clock when voucher `date` is picker-midnight only — createdAt → lastEditedAt → updatedAt. */
function voucherEntryClockDate(row: Record<string, unknown>): Date | null {
  return (
    parseFirestoreDateFieldToJsDate(row.createdAt) ??
    parseFirestoreDateFieldToJsDate(row.lastEditedAt) ??
    parseFirestoreDateFieldToJsDate(row.updatedAt) ??
    null
  );
}

/**
 * Recent Transactions sort instant: calendar date + entry time (same day pe createdAt clock).
 * Server PC + P2P client — ek hi ms key se order match.
 */
export function voucherRecentTransactionSortMs(row: Record<string, unknown> | null | undefined): number {
  const r = row ?? {};
  const dateRaw = parseFirestoreDateFieldToJsDate(r.date);
  if (!dateRaw) {
    const clock = voucherEntryClockDate(r);
    if (clock) return clock.getTime();
    const persistRaw = r[PL_CLIENT_OFFLINE_FIRST_PERSIST_MS];
    if (typeof persistRaw === "number" && Number.isFinite(persistRaw)) return persistRaw;
    return 0;
  }

  if (!isCalendarMidnight(dateRaw)) {
    return dateRaw.getTime();
  }

  const clock = voucherEntryClockDate(r);
  if (clock) {
    return new Date(
      dateRaw.getFullYear(),
      dateRaw.getMonth(),
      dateRaw.getDate(),
      clock.getHours(),
      clock.getMinutes(),
      clock.getSeconds(),
      clock.getMilliseconds()
    ).getTime();
  }

  return dateRaw.getTime();
}

/** Stable breakdown — tests / debug; primary sort uses `voucherRecentTransactionSortMs`. */
export function voucherRecencySortKey(row: Record<string, unknown> | null | undefined): {
  sortMs: number;
  dateMs: number;
  createdMs: number;
  editedMs: number;
  persistMs: number;
  id: string;
} {
  const r = row ?? {};
  const dateParsed = parseFirestoreDateFieldToJsDate(r.date);
  const createdParsed = parseFirestoreDateFieldToJsDate(r.createdAt);
  const editedParsed =
    parseFirestoreDateFieldToJsDate(r.lastEditedAt) ?? parseFirestoreDateFieldToJsDate(r.updatedAt);
  const persistRaw = r[PL_CLIENT_OFFLINE_FIRST_PERSIST_MS];
  const persistMs =
    typeof persistRaw === "number" && Number.isFinite(persistRaw) ? persistRaw : 0;
  return {
    sortMs: voucherRecentTransactionSortMs(r),
    dateMs: dateParsed?.getTime() ?? 0,
    createdMs: createdParsed?.getTime() ?? 0,
    editedMs: editedParsed?.getTime() ?? 0,
    persistMs,
    id: String(r.id ?? ""),
  };
}

/** Newest first — full date+time instant, then id tie-break. */
export function compareRecentTransactionsDesc(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const ma = voucherRecentTransactionSortMs(a);
  const mb = voucherRecentTransactionSortMs(b);
  if (mb !== ma) return mb - ma;
  const ka = voucherRecencySortKey(a);
  const kb = voucherRecencySortKey(b);
  if (kb.createdMs !== ka.createdMs) return kb.createdMs - ka.createdMs;
  if (kb.editedMs !== ka.editedMs) return kb.editedMs - ka.editedMs;
  if (kb.persistMs !== ka.persistMs) return kb.persistMs - ka.persistMs;
  return kb.id.localeCompare(ka.id);
}

export function sortRecentTransactionsDesc<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort(compareRecentTransactionsDesc);
}

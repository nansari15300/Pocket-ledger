"use client";

import { startOfDay } from "date-fns";
import { currentFiscalYearRange } from "@/lib/fyPagination/periodBounds";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

export function voucherDateStartMs(date: unknown): number | null {
  const d = parseFirestoreDateFieldToJsDate(date);
  if (!d || Number.isNaN(d.getTime())) return null;
  return startOfDay(d).getTime();
}

/** Voucher / master OB row date falls in running fiscal year? */
export function isDateInCurrentFy(
  country?: string,
  date?: unknown,
  today = new Date()
): boolean {
  const ms = voucherDateStartMs(date);
  if (ms == null) return false;
  const { fromMs, toMs } = currentFiscalYearRange(country, today);
  return ms >= fromMs && ms <= toMs;
}

/**
 * Company Selector Files tick ON: auto-download / idle warm only for current FY rows.
 * Prior FY → preview/click only (`grantExplicitAttachmentNetworkFetch`).
 */
export function shouldAutoWarmAttachmentForLedgerRow(
  country?: string,
  rowDate?: unknown,
  filesTickEnabled = true,
  today = new Date()
): boolean {
  if (!filesTickEnabled) return false;
  return isDateInCurrentFy(country, rowDate, today);
}

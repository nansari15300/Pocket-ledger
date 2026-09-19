import { startOfDay } from "date-fns";

/**
 * FY boundary closing (prior FY carry): include all vouchers before `beforeMs` on top of book OB.
 * Dated / arbitrary boundary closing: respect master "As on" — same as client pre-period reduce.
 */
export function effectiveOpeningBalanceDateBeforeMs(
  openingBalanceDate: Date | null | undefined,
  _beforeMs: number,
  respectMasterOpeningBalanceDate = true
): Date | null {
  if (!respectMasterOpeningBalanceDate) return null;
  if (!openingBalanceDate) return null;
  return startOfDay(openingBalanceDate);
}

export function isLedgerTransactionOnOrAfterOpeningDate(
  transactionDate: Date,
  openingBalanceDate: Date | null | undefined
): boolean {
  if (!openingBalanceDate) return true;
  return startOfDay(transactionDate).getTime() >= startOfDay(openingBalanceDate).getTime();
}

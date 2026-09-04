function safeToDate(date: unknown): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  const maybeTs = date as { toDate?: () => Date };
  if (typeof maybeTs.toDate === "function") return maybeTs.toDate();
  const parsed = new Date(date as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type LedgerEarliestMasterInput = {
  openingBalance?: number;
  openingBalanceDate?: unknown;
};

export type LedgerEarliestVoucherInput = {
  date?: unknown;
  voucherDate?: unknown;
};

/**
 * Earliest dated ledger activity: min(voucher dates, master openingBalanceDate).
 * Used when company fiscal year is not set — trace/report label = all history from here.
 */
export function computeLedgerEarliestActivityDate(
  vouchers: LedgerEarliestVoucherInput[],
  masters: LedgerEarliestMasterInput[]
): Date | null {
  let minMs: number | null = null;

  const consider = (d: Date | null) => {
    if (!d || Number.isNaN(d.getTime())) return;
    const ms = d.getTime();
    if (minMs === null || ms < minMs) minMs = ms;
  };

  for (const voucher of vouchers) {
    consider(safeToDate(voucher.date ?? voucher.voucherDate));
  }

  for (const master of masters) {
    const openingDate = safeToDate(master.openingBalanceDate);
    if (!openingDate) continue;
    const openingBalance = Number(master.openingBalance) || 0;
    if (Math.abs(openingBalance) < 0.005) continue;
    consider(openingDate);
  }

  return minMs !== null ? new Date(minMs) : null;
}

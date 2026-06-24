import type { PrintPayload } from "@/lib/printDirect";

export type LedgerPagePrintSource = {
  paginatedTransactions: readonly unknown[];
  openingForPage: number;
  periodDrForPage?: number;
  periodCrForPage?: number;
  closingForPage?: number;
  booksOpeningBalance?: number;
  ledgerShowBookOpeningRow?: boolean;
  ledgerDateFilterActive?: boolean;
  openingBalancePeriodStartDate?: unknown;
  masterOpeningBalanceDate?: unknown;
  dateRange?: { from?: Date | null; to?: Date | null };
};

export function stripSpendWiseSpacers(transactions: readonly unknown[]): unknown[] {
  return transactions.filter((t) => !(t as { _spendWiseSpacer?: boolean })?._spendWiseSpacer);
}

/** Spend-wise synthetic OB master row — Book/Dated opening rows at top handle display; linked children stay grouped. */
export function stripSpendWiseSyntheticOpeningMaster(transactions: readonly unknown[]): unknown[] {
  if (!transactions.some((t) => (t as { id?: string })?.id === "__opening_balance_group__")) {
    return transactions as unknown[];
  }
  const filtered = transactions.filter((t) => (t as { id?: string })?.id !== "__opening_balance_group__");
  let firstIdx = -1;
  let lastIdx = -1;
  filtered.forEach((t, i) => {
    const row = t as { _spendWiseGroupId?: string; _spendWiseSpacer?: boolean };
    if (row._spendWiseGroupId === "sw-group-opening-balance" && !row._spendWiseSpacer) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  });
  if (firstIdx < 0) return filtered;
  return filtered.map((t, i) => {
    const row = t as {
      _spendWiseGroupId?: string;
      _spendWiseSpacer?: boolean;
      _spendWiseGroupFirst?: boolean;
      _spendWiseGroupLast?: boolean;
    };
    if (row._spendWiseGroupId !== "sw-group-opening-balance" || row._spendWiseSpacer) return t;
    return {
      ...(t as object),
      _spendWiseGroupFirst: i === firstIdx,
      _spendWiseGroupLast: i === lastIdx,
    };
  });
}

/** Print sirf active ledger page — screen jaisa pagination, opening row, aur row order. */
export function applyLedgerPageToPrintPayload(
  payload: PrintPayload,
  page: LedgerPagePrintSource
): PrintPayload {
  const transactions = stripSpendWiseSyntheticOpeningMaster(
    stripSpendWiseSpacers(page.paginatedTransactions)
  ) as PrintPayload["transactions"];
  return {
    ...payload,
    transactions,
    vouchersCount: transactions.length,
    openingBalance: page.openingForPage,
    preserveOrder: true,
    booksOpeningBalance: page.booksOpeningBalance,
    ledgerShowBookOpeningRow: page.ledgerShowBookOpeningRow,
    ledgerDateFilterActive: page.ledgerDateFilterActive,
    openingBalancePeriodStartDate: page.openingBalancePeriodStartDate,
    ledgerDateRange: page.dateRange,
    ...(page.masterOpeningBalanceDate !== undefined
      ? { openingBalanceDate: page.masterOpeningBalanceDate }
      : {}),
    ...(page.periodDrForPage != null ? { ledgerPagePeriodDr: page.periodDrForPage } : {}),
    ...(page.periodCrForPage != null ? { ledgerPagePeriodCr: page.periodCrForPage } : {}),
    ...(page.closingForPage != null ? { ledgerPageClosingBalance: page.closingForPage } : {}),
  };
}

"use client";

import { openPrintDirect, type PrintPayload } from "@/lib/printDirect";
import {
  stripSpendWiseSpacers,
  stripSpendWiseSyntheticOpeningMaster,
} from "@/lib/ledgerPagePrint";

export type SpendWiseGroupPrintConfig = {
  company: PrintPayload["company"];
  /** e.g. `Spend Wise Account Statement: Cash` — group voucher no. append hota hai */
  titleBase: string;
  context: PrintPayload["context"];
  contextId?: string | null;
  dateSystem: PrintPayload["dateSystem"];
  dateRangeText: string;
  showNarration?: boolean;
  includeNotes?: boolean;
  visibleColumns?: PrintPayload["visibleColumns"];
  userNames?: Record<string, string>;
  debitColumnHeaderLabel?: string;
  creditColumnHeaderLabel?: string;
};

/** Anchor row ke `_spendWiseGroupId` se poori group rows (spacers skip). */
export function extractSpendWiseGroupTransactions(
  allTransactions: readonly unknown[],
  anchorRow: Record<string, unknown> | null | undefined
): Record<string, unknown>[] {
  if (!anchorRow || (anchorRow as { _spendWiseSpacer?: boolean })._spendWiseSpacer) return [];
  const groupId = String((anchorRow as { _spendWiseGroupId?: string })._spendWiseGroupId || "").trim();
  if (!groupId) return [anchorRow];
  const items = (allTransactions as Record<string, unknown>[]).filter(
    (t) =>
      !(t as { _spendWiseSpacer?: boolean })._spendWiseSpacer &&
      String((t as { _spendWiseGroupId?: string })._spendWiseGroupId || "") === groupId
  );
  return items.map((t, i) => ({
    ...t,
    _spendWiseGroupFirst: i === 0,
    _spendWiseGroupLast: i === items.length - 1,
  }));
}

export async function printSpendWiseGroupTransactions(
  config: SpendWiseGroupPrintConfig,
  groupTransactions: Record<string, unknown>[]
): Promise<void> {
  const cleaned = stripSpendWiseSyntheticOpeningMaster(
    stripSpendWiseSpacers(groupTransactions)
  ) as Record<string, unknown>[];
  if (!cleaned.length) return;

  const head =
    cleaned.find((t) => (t as { _spendWiseGroupFirst?: boolean })._spendWiseGroupFirst) ?? cleaned[0];
  const groupLabel = String(
    (head as { voucherNumber?: string; type?: string }).voucherNumber ||
      (head as { type?: string }).type ||
      "Group"
  ).trim();

  await openPrintDirect(
    {
      company: config.company,
      title: `${config.titleBase} — ${groupLabel}`,
      context: config.context,
      contextId: config.contextId,
      dateSystem: config.dateSystem,
      dateRangeText: config.dateRangeText,
      vouchersCount: cleaned.length,
      openingBalance: 0,
      transactions: cleaned,
      showNarration: config.showNarration,
      includeNotes: config.includeNotes,
      visibleColumns: config.visibleColumns,
      userNames: config.userNames,
      preserveOrder: true,
      spendWise: true,
      billWise: false,
      debitColumnHeaderLabel: config.debitColumnHeaderLabel,
      creditColumnHeaderLabel: config.creditColumnHeaderLabel,
    },
    true
  );
}

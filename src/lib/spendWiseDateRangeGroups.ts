import { endOfDay, startOfDay } from "date-fns";
import { isLedgerTransactionUnapproved } from "@/lib/ledgerPendingApproval";
import {
  buildSpendWiseDisplayBlocks,
  resolveSpendWiseRowBaseVoucherId,
} from "@/lib/spendWisePagination";

export const SPEND_WISE_OPENING_GROUP_ID = "sw-group-opening-balance";

function spendWiseRowDateMs(row: any): number | null {
  if (!row?.date) return null;
  const d = row.date?.toDate ? row.date.toDate() : new Date(row.date);
  return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null;
}

function isMsInLedgerDateRange(
  ms: number,
  range?: { from?: Date | null; to?: Date | null }
): boolean {
  if (!range?.from && !range?.to) return true;
  const rawFrom = range.from != null ? startOfDay(range.from).getTime() : undefined;
  const rawTo = range.to != null ? endOfDay(range.to).getTime() : undefined;
  if (rawFrom != null && rawTo != null) {
    const lo = Math.min(rawFrom, rawTo);
    const hi = Math.max(rawFrom, rawTo);
    return ms >= lo && ms <= hi;
  }
  if (rawFrom != null) return ms >= rawFrom;
  return ms <= rawTo!;
}

function rowInSpendWiseDateRange(
  row: any,
  dateRange?: { from?: Date | null; to?: Date | null }
): boolean {
  if (row.id === "__opening_balance_group__") return true;
  const ms = spendWiseRowDateMs(row);
  if (ms == null) return true;
  return isMsInLedgerDateRange(ms, dateRange);
}

/**
 * Spend-wise: poori list pehle banao (bina range), phir block-wise sirf range ke bahar ki rows hatao.
 * Opening-linked group toot-ta nahi — Book Opening embed ke saath ek hi card rehta hai.
 */
export function filterSpendWiseRowsByDateRange(
  rows: readonly any[],
  dateRange?: { from?: Date | null; to?: Date | null }
): any[] {
  if (!rows.length) return [];
  if (!dateRange?.from && !dateRange?.to) return [...rows];

  const blocks = buildSpendWiseDisplayBlocks(rows as any[], true);
  const out: any[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.length === 1 && (block[0] as any)?._spendWiseSpacer) continue;

    const kept = block.filter((row) => {
      if ((row as any)?._spendWiseSpacer) return false;
      return rowInSpendWiseDateRange(row, dateRange);
    });

    const dataKept = kept.filter((r) => r.id !== "__opening_balance_group__");
    if (dataKept.length === 0) continue;

    kept.forEach((r, idx) => {
      out.push({
        ...r,
        _spendWiseGroupFirst: idx === 0,
        _spendWiseGroupLast: idx === kept.length - 1,
      });
    });

    const nextBlock = blocks[bi + 1];
    const nextHasGroup =
      nextBlock &&
      !(nextBlock.length === 1 && (nextBlock[0] as any)?._spendWiseSpacer) &&
      nextBlock.some((r) => r._spendWiseGroupId);
    if (nextHasGroup) {
      const gid = String(kept[0]?._spendWiseGroupId || "block");
      out.push({
        _spendWiseSpacer: true,
        id: `spend-wise-spacer-after-${gid}`,
        _rowKey: `spacer-after-${gid}`,
      });
    }
  }

  return out;
}

/** Row filters (unapproved, etc.) par spend-wise group ko todna mat. */
export function filterSpendWisePreservingGroups<T extends { isApproved?: boolean }>(
  list: readonly T[],
  keepRow: (row: T) => boolean
): T[] {
  if (!list.length) return [];
  const hasGroups = list.some((r) => Boolean((r as { _spendWiseGroupId?: string })._spendWiseGroupId));
  if (!hasGroups) return list.filter(keepRow);
  const blocks = buildSpendWiseDisplayBlocks(list as any[], true);
  const kept: any[] = [];
  for (const block of blocks) {
    if (block.length === 1 && (block[0] as { _spendWiseSpacer?: boolean })._spendWiseSpacer) continue;
    if (block.some((r) => keepRow(r as T))) kept.push(...block);
  }
  return kept as T[];
}

export function filterSpendWiseUnapprovedOnly<T extends { isApproved?: boolean }>(
  list: readonly T[],
  onlyUnapproved: boolean
): T[] {
  if (!onlyUnapproved) return [...list];
  return filterSpendWisePreservingGroups(list, (row) => isLedgerTransactionUnapproved(row));
}

export function buildSpendWiseAddedInflowVoucherIds(rows: readonly any[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) {
    if ((r as any)?._spendWiseSpacer || (r as any)?._spendWiseChild) continue;
    const baseId = resolveSpendWiseRowBaseVoucherId(r);
    if (baseId && baseId !== "__opening_balance_group__") ids.add(baseId);
  }
  return ids;
}

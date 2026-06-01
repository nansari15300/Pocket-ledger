/**
 * Bank spend-wise: footer “rows per page” = data lines (non-spacer), contiguous list slices, split-group border hints.
 * Used by AccountDetails, AccountGroupDetails, and TransactionRow (via _spendWisePageShow* on each row).
 */

/** Statement: one block per list row. Spend-wise: one block per linked group or spacer (search + mobile group filter). */
export function buildSpendWiseDisplayBlocks(list: any[], spendWise: boolean): any[][] {
  if (!list.length) return [];
  if (!spendWise) {
    return list.map((t) => [t]);
  }
  const blocks: any[][] = [];
  let i = 0;
  while (i < list.length) {
    const first = list[i] as any;
    if (first._spendWiseSpacer) {
      blocks.push([first]);
      i++;
      continue;
    }
    let end = i;
    while (end < list.length) {
      const cur = list[end] as any;
      if (cur._spendWiseGroupLast === true) {
        end++;
        if (end < list.length && (list[end] as any)._spendWiseSpacer) end++;
        break;
      }
      end++;
    }
    blocks.push(list.slice(i, end));
    i = end;
  }
  return blocks;
}

/** Block ki pehli data row se chronological sort key — statement jaisa date + createdAt + id. */
function spendWiseBlockSortKey(block: any[]): [number, number, string] {
  const opening = block.some(
    (r) => r?.id === "__opening_balance_group__" || (r?.type === "opening_balance" && r?._spendWiseGroupFirst)
  );
  if (opening) return [-1, 0, ""];

  const row = block.find((r) => r && !r._spendWiseSpacer);
  if (!row?.date) return [Number.MAX_SAFE_INTEGER, 0, String(row?.id || "")];

  const d = row.date?.toDate ? row.date.toDate() : new Date(row.date);
  const dateMs = d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : Number.MAX_SAFE_INTEGER;
  const creationMs = row.createdAt?.toDate ? row.createdAt.toDate().getTime() : 0;
  return [dateMs, creationMs, String(row.id || "")];
}

/**
 * Spend-wise blocks ko date order me — unlinked RCPT upar na aaye, outflows ke saath chronological mix.
 * Linked groups ek block rehte hain (inflow + linked outs); sirf block order badalta hai.
 */
export function reorderSpendWiseRowsByDate(list: any[]): any[] {
  if (!list.length) return list;
  const blocks = buildSpendWiseDisplayBlocks(list, true);
  const sorted = [...blocks].sort((a, b) => {
    const [da, ca, ida] = spendWiseBlockSortKey(a);
    const [db, cb, idb] = spendWiseBlockSortKey(b);
    if (da !== db) return da - db;
    if (ca !== cb) return ca - cb;
    return ida.localeCompare(idb);
  });
  return sorted.flat();
}

/** Newest page first: page 1 = last `maxDataRows` *data* lines, slice includes spacers between those indices. */
export function packFlatListByDataLineBudgetFromEnd(
  list: any[],
  maxDataRows: number
): { start: number; end: number }[] {
  if (maxDataRows <= 0 || !list.length) {
    return list.length ? [{ start: 0, end: list.length }] : [];
  }
  const dataIdx: number[] = [];
  for (let i = 0; i < list.length; i++) {
    if (!(list[i] as any)?._spendWiseSpacer) dataIdx.push(i);
  }
  if (dataIdx.length === 0) {
    return [{ start: 0, end: list.length }];
  }
  const pageRanges: { start: number; end: number }[] = [];
  let remaining = dataIdx.length;
  while (remaining > 0) {
    const take = Math.min(maxDataRows, remaining);
    const fromDataIdx = dataIdx[remaining - take]!;
    const toDataIdx = dataIdx[remaining - 1]!;
    pageRanges.push({ start: fromDataIdx, end: toDataIdx + 1 });
    remaining -= take;
  }
  return pageRanges;
}

/** Oldest-first paging: page 1 = pehle `maxDataRows` data lines (Book OB is page par). */
export function packFlatListByDataLineBudgetFromStart(
  list: any[],
  maxDataRows: number
): { start: number; end: number }[] {
  if (maxDataRows <= 0 || !list.length) {
    return list.length ? [{ start: 0, end: list.length }] : [];
  }
  const dataIdx: number[] = [];
  for (let i = 0; i < list.length; i++) {
    if (!(list[i] as any)?._spendWiseSpacer) dataIdx.push(i);
  }
  if (dataIdx.length === 0) {
    return [{ start: 0, end: list.length }];
  }
  const pageRanges: { start: number; end: number }[] = [];
  let offset = 0;
  let remaining = dataIdx.length;
  while (remaining > 0) {
    const take = Math.min(maxDataRows, remaining);
    const fromDataIdx = dataIdx[offset]!;
    const toDataIdx = dataIdx[offset + take - 1]!;
    pageRanges.push({ start: fromDataIdx, end: toDataIdx + 1 });
    offset += take;
    remaining -= take;
  }
  return pageRanges;
}

/** Spend-wise synthetic row id → asli voucher id (statement count ke liye). */
export function resolveSpendWiseRowBaseVoucherId(row: any): string {
  const rawId = String(row?.id ?? "").trim();
  if (!rawId || rawId === "__opening_balance_group__") return rawId;
  if (row?._baseVoucherId) return String(row._baseVoucherId).trim();
  if (rawId.includes("-in-")) return rawId.substring(0, rawId.indexOf("-in-"));
  if (rawId.endsWith("-ob-link")) return rawId.substring(0, rawId.length - "-ob-link".length);
  return rawId;
}

/**
 * Footer (before) / (after) / Total — statement voucher list ke hisaab se.
 * Spend-wise page par linked child rows ho to bhi count statement jaisa rahe.
 */
export function computeStatementFooterCountsFromPage(
  statementList: any[],
  pageRows: any[]
): { beforeCount: number; afterCount: number; totalCount: number } {
  const total = statementList.length;
  if (total === 0) {
    return { beforeCount: 0, afterCount: 0, totalCount: 0 };
  }
  const idToIndex = new Map<string, number>();
  statementList.forEach((t, i) => {
    const id = String(t?.id ?? "").trim();
    if (id) idToIndex.set(id, i);
  });
  const indices: number[] = [];
  for (const row of pageRows) {
    if ((row as any)?._spendWiseSpacer) continue;
    const baseId = resolveSpendWiseRowBaseVoucherId(row);
    if (!baseId || baseId === "__opening_balance_group__") continue;
    const idx = idToIndex.get(baseId);
    if (idx !== undefined) indices.push(idx);
  }
  if (indices.length === 0) {
    return { beforeCount: 0, afterCount: 0, totalCount: total };
  }
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  return {
    beforeCount: minIdx,
    afterCount: Math.max(0, total - maxIdx - 1),
    totalCount: total,
  };
}

/** Flat list me index se pehle kitni data lines (spacer skip) — rows/page budget ke liye. */
export function countSpendWiseDataLinesBeforeIndex(list: any[], flatIndex: number): number {
  let count = 0;
  const end = Math.min(flatIndex, list.length);
  for (let i = 0; i < end; i++) {
    if (!(list[i] as any)?._spendWiseSpacer) count++;
  }
  return count;
}

/** Flat slice [start,end) me kitni data lines — footer page size verify ke liye. */
export function countSpendWiseDataLinesInSlice(list: any[], start: number, end: number): number {
  let count = 0;
  for (let i = Math.max(0, start); i < Math.min(end, list.length); i++) {
    if (!(list[i] as any)?._spendWiseSpacer) count++;
  }
  return count;
}

/** Split-group box: which horizontal edges to draw on this page (open toward other pages). */
export function attachSpendWisePageEdgeFlags(
  full: any[],
  pageStart: number,
  pageEnd: number
): { list: any[]; pageStart: number; pageEnd: number } {
  if (pageStart >= pageEnd) return { list: [], pageStart, pageEnd };
  const out = full.slice(pageStart, pageEnd).map((t, k) => {
    const i = pageStart + k;
    if ((t as any)?._spendWiseSpacer) return t;
    const gid = (t as any)._spendWiseGroupId;
    if (gid == null || gid === "") return t;
    let fragFirst = true;
    for (let j = pageStart; j < i; j++) {
      const u = full[j] as any;
      if (u?._spendWiseSpacer) continue;
      if (u?._spendWiseGroupId === gid) {
        fragFirst = false;
        break;
      }
    }
    let fragLast = true;
    for (let j = i + 1; j < pageEnd; j++) {
      const u = full[j] as any;
      if (u?._spendWiseSpacer) continue;
      if (u?._spendWiseGroupId === gid) {
        fragLast = false;
        break;
      }
    }
    let cAbove = false;
    for (let j = 0; j < pageStart; j++) {
      const u = full[j] as any;
      if (u?._spendWiseSpacer) continue;
      if (u?._spendWiseGroupId === gid) {
        cAbove = true;
        break;
      }
    }
    let cBelow = false;
    for (let j = pageEnd; j < full.length; j++) {
      const u = full[j] as any;
      if (u?._spendWiseSpacer) continue;
      if (u?._spendWiseGroupId === gid) {
        cBelow = true;
        break;
      }
    }
    const showTop = fragFirst && !cAbove;
    const showBottom = fragLast && !cBelow;
    return { ...t, _spendWisePageShowTopEdge: showTop, _spendWisePageShowBottomEdge: showBottom };
  });
  return { list: out, pageStart, pageEnd };
}

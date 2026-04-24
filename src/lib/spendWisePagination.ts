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

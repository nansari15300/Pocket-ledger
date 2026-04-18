/**
 * Client-side filter for ledger tables: search voucher narration and note title (type `note` uses `title`).
 * Spend-wise grouped rows stay intact if any row in the group matches.
 */

export function transactionMatchesNarrationNoteSearch(t: any, rawQuery: string): boolean {
  const q = (rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  const narration = String(t?.narration ?? "").toLowerCase();
  const title = String(t?.title ?? "").toLowerCase();
  return narration.includes(q) || title.includes(q);
}

type IndexBlock = { start: number; end: number; spacerOnly: boolean };

function buildTransactionIndexBlocks(transactions: any[]): IndexBlock[] {
  const blocks: IndexBlock[] = [];
  let i = 0;
  const n = transactions.length;
  while (i < n) {
    const t = transactions[i];
    if ((t as any)._spendWiseSpacer) {
      blocks.push({ start: i, end: i, spacerOnly: true });
      i++;
      continue;
    }
    if ((t as any)._spendWiseGroupFirst === true) {
      const start = i;
      let j = i;
      while (j < n) {
        const cur = transactions[j];
        if ((cur as any)._spendWiseGroupLast) {
          j++;
          break;
        }
        j++;
      }
      blocks.push({ start, end: j - 1, spacerOnly: false });
      i = j;
      continue;
    }
    blocks.push({ start: i, end: i, spacerOnly: false });
    i++;
  }
  return blocks;
}

export function filterTransactionsByNarrationNoteSearch(transactions: any[], rawQuery: string): any[] {
  const q = (rawQuery || "").trim();
  if (!q) return transactions;

  const rowMatchesData = (t: any): boolean => {
    if (!t || (t as any)._spendWiseSpacer) return false;
    return transactionMatchesNarrationNoteSearch(t, q);
  };

  const hasSpendWise = transactions.some((t: any) => (t as any)._spendWiseGroupFirst === true);
  if (!hasSpendWise) {
    return transactions.filter((t) => {
      if ((t as any)._spendWiseSpacer) return false;
      return rowMatchesData(t);
    });
  }

  const blocks = buildTransactionIndexBlocks(transactions);
  const included = new Set<number>();
  blocks.forEach((b, bi) => {
    if (b.spacerOnly) return;
    for (let j = b.start; j <= b.end; j++) {
      if (rowMatchesData(transactions[j])) {
        included.add(bi);
        break;
      }
    }
  });
  blocks.forEach((b, bi) => {
    if (b.spacerOnly && (included.has(bi - 1) || included.has(bi + 1))) included.add(bi);
  });

  const out: any[] = [];
  blocks.forEach((b, bi) => {
    if (!included.has(bi)) return;
    for (let j = b.start; j <= b.end; j++) out.push(transactions[j]);
  });
  return out;
}

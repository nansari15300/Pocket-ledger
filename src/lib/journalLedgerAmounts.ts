/**
 * Journal ledger — ek hi accountId Dr + Cr alag lines par ho sakta hai; saari matching entries jod kar Dr/Cr nikalo.
 */
export function sumJournalAmountsForAccount(
  entries: unknown,
  accountId: string | null | undefined
): { debit: number; credit: number } {
  if (!Array.isArray(entries) || accountId == null || accountId === "") {
    return { debit: 0, credit: 0 };
  }
  const id = String(accountId);
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    if (String((e as { accountId?: unknown })?.accountId ?? "") !== id) continue;
    debit += Number((e as { debit?: unknown }).debit || 0);
    credit += Number((e as { credit?: unknown }).credit || 0);
  }
  return { debit, credit };
}

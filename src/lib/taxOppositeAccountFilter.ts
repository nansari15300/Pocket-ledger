import {
  findStaffTaxEntry,
  staffCreditEntries,
} from "@/lib/staffTaxDetailsLedger";

function taxAccountIds(processedTaxes: any[]): Set<string> {
  return new Set((processedTaxes || []).map((t: any) => String(t.id)));
}

function sumJournalAmountsForAccount(entries: any[], accountId: string) {
  let debit = 0;
  let credit = 0;
  for (const e of entries || []) {
    if (String(e.accountId) !== String(accountId)) continue;
    debit += Number(e.debit) || 0;
    credit += Number(e.credit) || 0;
  }
  return { debit, credit };
}

export function voucherTouchesTaxAccount(
  voucher: any,
  taxAccountId: string,
  processedTaxes: any[]
): boolean {
  if (!voucher || !taxAccountId) return false;

  if (voucher.taxAccountId === taxAccountId) return true;

  if (Array.isArray(voucher.lineItems)) {
    if (voucher.lineItems.some((li: any) => li.taxAccountId === taxAccountId)) return true;
  }

  if (Array.isArray(voucher.entries)) {
    const journalAmt = sumJournalAmountsForAccount(voucher.entries, taxAccountId);
    if (journalAmt.debit > 0 || journalAmt.credit > 0) return true;
  }

  return false;
}

/** Opposite ledger accounts linked to this tax on a voucher (staff, party, …). */
export function getTaxOppositeAccountIdsFromVoucher(
  voucher: any,
  taxAccountId: string,
  processedTaxes: any[]
): string[] {
  if (!voucherTouchesTaxAccount(voucher, taxAccountId, processedTaxes)) return [];

  const ids = new Set<string>();

  if (voucher.type === "journal" && voucher.subType === "add_salary" && Array.isArray(voucher.entries)) {
    const staffRows = staffCreditEntries(voucher, processedTaxes);
    staffRows.forEach((staffEntry: any, rowIndex: number) => {
      const staffId = String(staffEntry.accountId || "");
      if (!staffId) return;
      const taxEntry = findStaffTaxEntry(voucher, staffId, rowIndex, processedTaxes);
      if (taxEntry && String(taxEntry.accountId) === String(taxAccountId)) {
        ids.add(staffId);
      }
    });
    return Array.from(ids);
  }

  if (voucher.type === "sale" || voucher.type === "purchase") {
    const hasTaxLine = (voucher.lineItems || []).some(
      (li: any) => String(li.taxAccountId) === String(taxAccountId)
    );
    if (hasTaxLine && voucher.partyId) ids.add(String(voucher.partyId));
    return Array.from(ids);
  }

  if (
    (voucher.type === "payment_in" || voucher.type === "payment_out") &&
    voucher.taxAccountId === taxAccountId
  ) {
    if (voucher.partyId) ids.add(String(voucher.partyId));
    else if (voucher.staffId) ids.add(String(voucher.staffId));
    return Array.from(ids);
  }

  if (voucher.subType === "pay_salary" && voucher.taxAccountId === taxAccountId && voucher.staffId) {
    ids.add(String(voucher.staffId));
    return Array.from(ids);
  }

  if (Array.isArray(voucher.entries)) {
    const journalAmt = sumJournalAmountsForAccount(voucher.entries, taxAccountId);
    if (journalAmt.debit > 0 || journalAmt.credit > 0) {
      if (voucher.partyId) ids.add(String(voucher.partyId));
      else if (voucher.staffId) ids.add(String(voucher.staffId));
    }
  }

  return Array.from(ids);
}

export function getTaxOppositeAccountFilterOptions(
  transactions: any[],
  taxAccountId: string,
  processedTaxes: any[],
  resolveName: (id: string) => string
): { value: string; label: string }[] {
  const idSet = new Set<string>();
  for (const t of transactions) {
    for (const id of getTaxOppositeAccountIdsFromVoucher(t, taxAccountId, processedTaxes)) {
      if (id) idSet.add(id);
    }
  }
  if (idSet.size === 0) return [];

  return [
    { value: "", label: "All accounts" },
    ...Array.from(idSet)
      .sort((a, b) => resolveName(a).localeCompare(resolveName(b)))
      .map((id) => ({ value: id, label: resolveName(id) || id })),
  ];
}

export function filterTaxLedgerByOppositeAccount(
  transactions: any[],
  taxAccountId: string,
  oppositeAccountFilter: string,
  processedTaxes: any[]
): any[] {
  if (!oppositeAccountFilter) return transactions;
  return transactions.filter((t) => {
    const oppositeIds = getTaxOppositeAccountIdsFromVoucher(t, taxAccountId, processedTaxes);
    return oppositeIds.includes(oppositeAccountFilter);
  });
}

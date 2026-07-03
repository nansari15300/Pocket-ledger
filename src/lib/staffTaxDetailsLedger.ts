export type StaffAddSalaryTaxRow = {
  credit: number;
  debit: number;
  debitAccountId: string | null;
  taxAmount: number;
  taxableAmount: number;
  taxRate: number;
};

function taxAccountIds(processedTaxes: any[]): Set<string> {
  return new Set((processedTaxes || []).map((t: any) => String(t.id)));
}

function isAddSalaryJournal(voucher: any): boolean {
  return (
    (voucher?.type === "journal" && voucher?.subType === "add_salary") ||
    voucher?.type === "add_salary"
  );
}

export function staffCreditEntries(voucher: any, processedTaxes: any[]): any[] {
  if (!Array.isArray(voucher?.entries)) return [];
  const taxIds = taxAccountIds(processedTaxes);
  return voucher.entries.filter((e: any) => {
    const credit = Number(e.credit) || 0;
    if (credit <= 0) return false;
    const nar = String(e.narration || "");
    if (nar.includes("(Staff ID:")) return false;
    if (e.accountId && taxIds.has(String(e.accountId))) return false;
    return true;
  });
}

export function findStaffTaxEntry(
  voucher: any,
  staffId: string,
  staffRowIndex: number,
  processedTaxes: any[]
): any | null {
  const allEnt = voucher.entries || [];
  const sidMarker = `(Staff ID: ${staffId})`;
  const taxIds = taxAccountIds(processedTaxes);

  let taxEntry =
    allEnt.find(
      (taxE: any) =>
        taxIds.has(String(taxE.accountId)) &&
        String(taxE.narration || "").includes(sidMarker) &&
        Number(taxE.credit) > 0
    ) ||
    allEnt.find(
      (taxE: any) =>
        String(taxE.narration || "").includes(sidMarker) &&
        (Number(taxE.credit) > 0 || Number(taxE.debit) > 0)
    );

  if (!taxEntry) {
    const taxSatelliteLines = allEnt.filter((e: any) => {
      const nar = String(e.narration || "");
      if (!nar.includes("(Staff ID:")) return false;
      return Number(e.credit) > 0 || Number(e.debit) > 0;
    });
    if (taxSatelliteLines[staffRowIndex]) taxEntry = taxSatelliteLines[staffRowIndex];
  }

  if (!taxEntry && staffCreditEntries(voucher, processedTaxes).length === 1) {
    taxEntry = allEnt.find(
      (e: any) => taxIds.has(String(e.accountId)) && Number(e.credit) > 0
    );
  }

  return taxEntry || null;
}

export function isStaffAddSalaryVoucher(
  voucher: any,
  staffId: string,
  processedTaxes: any[]
): boolean {
  if (!voucher || voucher.type === "note" || !staffId || staffId === "all") return false;
  if (!isAddSalaryJournal(voucher)) return false;

  if (Array.isArray(voucher.entries)) {
    return staffCreditEntries(voucher, processedTaxes).some(
      (e: any) => String(e.accountId) === staffId
    );
  }

  return voucher.staffId === staffId;
}

export function extractStaffAddSalaryTaxRow(
  voucher: any,
  staffId: string,
  processedTaxes: any[]
): StaffAddSalaryTaxRow | null {
  if (!isStaffAddSalaryVoucher(voucher, staffId, processedTaxes)) return null;

  const taxIds = taxAccountIds(processedTaxes);
  let afterTaxSalary = 0;
  let taxAmount = 0;
  let debitAccountId: string | null = null;
  let taxAccountId: string | null = null;

  if (Array.isArray(voucher.entries)) {
    const staffRows = staffCreditEntries(voucher, processedTaxes);
    const staffRowIndex = staffRows.findIndex((e: any) => String(e.accountId) === staffId);
    const staffEntry = staffRowIndex >= 0 ? staffRows[staffRowIndex] : null;
    if (!staffEntry) return null;

    afterTaxSalary = Number(staffEntry.credit) || 0;
    const taxEntry = findStaffTaxEntry(voucher, staffId, staffRowIndex, processedTaxes);
    taxAmount = Number(taxEntry?.credit) || Number(taxEntry?.debit) || 0;
    taxAccountId = taxEntry?.accountId ? String(taxEntry.accountId) : null;

    const debitEntry = voucher.entries.find(
      (e: any) =>
        Number(e.debit) > 0 &&
        !taxIds.has(String(e.accountId)) &&
        String(e.accountId) !== staffId
    );
    if (debitEntry?.accountId) debitAccountId = String(debitEntry.accountId);
  } else if (voucher.type === "add_salary" && voucher.staffId === staffId) {
    afterTaxSalary = Number(voucher.amount || voucher.total || 0);
  }

  const fullSalary = afterTaxSalary + taxAmount;
  let taxRate = 0;
  if (taxAmount > 0) {
    const relevantTax = processedTaxes.find((t: any) => t.id === taxAccountId);
    taxRate =
      Number(relevantTax?.rate) ||
      (fullSalary > 0 ? (taxAmount / fullSalary) * 100 : 0);
  }

  return {
    credit: fullSalary,
    debit: taxAmount,
    debitAccountId,
    taxAmount,
    taxableAmount: fullSalary,
    taxRate,
  };
}

export function mapTransactionsForStaffTaxDetailsView(
  transactions: any[],
  staffId: string,
  processedTaxes: any[]
): any[] {
  return transactions
    .map((t) => {
      if (!isStaffAddSalaryVoucher(t, staffId, processedTaxes)) return null;
      const row = extractStaffAddSalaryTaxRow(t, staffId, processedTaxes);
      if (!row) return null;
      return {
        ...t,
        debit: row.debit,
        credit: row.credit,
        taxAmount: row.taxAmount,
        taxableAmount: row.taxableAmount,
        taxRate: row.taxRate,
        _staffTaxDetailsMode: true,
        _staffTaxDetailsDebitAccountId: row.debitAccountId,
      };
    })
    .filter(Boolean) as any[];
}

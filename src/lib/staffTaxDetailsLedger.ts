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

/**
 * Staff ledger split: sirf 2 mode (Staff details hata diya).
 * - salary = full staff account txns; ADD-SAL pe taxable (gross) amount
 * - tax = tax page parity (tax amount only)
 */
export type StaffLedgerSplitMode = "tax" | "salary";

export function staffLedgerSplitShellTitle(mode: StaffLedgerSplitMode): string {
  return mode === "tax" ? "Staff tax details" : "Staff salary details";
}

/** Pill = dusra mode (toggle). */
export function staffLedgerSplitPillLabel(mode: StaffLedgerSplitMode): string {
  return mode === "salary" ? "Tax Details" : "Salary Details";
}

export function nextStaffLedgerSplitMode(mode: StaffLedgerSplitMode): StaffLedgerSplitMode {
  return mode === "salary" ? "tax" : "salary";
}

/** Full staff ledger; ADD-SAL rows show the NET credit (gross - TDS). `taxableAmount` keeps the gross for TDS columns. */
export function mapTransactionsForStaffSalaryDetailsView(
  transactions: any[],
  staffId: string,
  processedTaxes: any[]
): any[] {
  return (transactions || []).map((t) => {
    if (!isStaffAddSalaryVoucher(t, staffId, processedTaxes)) return t;
    const row = extractStaffAddSalaryTaxRow(t, staffId, processedTaxes);
    if (!row) return t;
    const taxable = Number(row.taxableAmount) || 0;
    return {
      ...t,
      debit: 0,
      // Staff carries NET (gross - TDS); TDS stays on the TDS account. taxableAmount below stays gross for the TDS columns.
      credit: Math.max(0, Math.round((taxable - (Number(row.taxAmount) || 0) + Number.EPSILON) * 100) / 100),
      taxAmount: row.taxAmount,
      taxableAmount: taxable,
      taxRate: row.taxRate,
      _staffLedgerSplitMode: "salary",
      _staffTaxDetailsDebitAccountId: row.debitAccountId,
    };
  });
}

function staffIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? "") === String(b ?? "");
}

function resolveAddSalaryTaxAccountId(
  voucher: any,
  staffId: string,
  processedTaxes: any[]
): string | null {
  if (!Array.isArray(voucher?.entries)) return null;
  const staffRows = staffCreditEntries(voucher, processedTaxes);
  const staffRowIndex = staffRows.findIndex((e: any) => staffIdEq(e.accountId, staffId));
  if (staffRowIndex < 0) return null;
  const taxEntry = findStaffTaxEntry(voucher, staffId, staffRowIndex, processedTaxes);
  const tid = taxEntry?.accountId ? String(taxEntry.accountId) : "";
  return tid || null;
}

/**
 * Tax page parity for this staff: same vouchers/amounts as tax ledger filtered by opposite = staff
 * (ADD-SAL tax credit, tax payment out/in, …) via `getTaxTransactionAmounts`.
 *
 * `getOppositeIds` should be taxOppositeAccountFilter.getTaxOppositeAccountIdsFromVoucher
 * (passed in to avoid circular import with this module).
 */
export function mapTransactionsForStaffTaxPageView(
  vouchers: any[],
  staffId: string,
  processedTaxes: any[],
  getTaxAmounts: (
    transaction: any,
    taxAccountId: string,
    taxes: any[]
  ) => { debit: number; credit: number; taxableAmount: number; taxAmount: number; taxRate: number },
  getOppositeIds?: (
    voucher: any,
    taxAccountId: string,
    taxes: any[]
  ) => string[]
): any[] {
  if (!staffId || staffId === "all") return [];
  const taxes = processedTaxes || [];
  const sid = String(staffId);
  const rowsById = new Map<string, any>();

  const pushTaxRow = (v: any, matchedTaxId: string) => {
    if (!matchedTaxId || !v) return;
    const amounts = getTaxAmounts(v, matchedTaxId, taxes);
    const debit = Number(amounts.debit) || 0;
    const credit = Number(amounts.credit) || 0;
    if (debit === 0 && credit === 0) return;
    const id = String(v.id || "");
    if (!id || rowsById.has(id)) return;
    rowsById.set(id, {
      ...v,
      debit,
      credit,
      taxAmount: amounts.taxAmount,
      taxableAmount: amounts.taxableAmount,
      taxRate: amounts.taxRate,
      _staffLedgerSplitMode: "tax",
      _staffTaxDetailsMode: true,
      _staffTaxAccountId: matchedTaxId,
    });
  };

  for (const v of vouchers || []) {
    if (!v || v.type === "note") continue;

    // 1) Tax-page opposite match (same helper as Tax details account filter)
    if (taxes.length && getOppositeIds) {
      let matchedTaxId: string | null = null;
      for (const tax of taxes) {
        const tid = String(tax?.id || "");
        if (!tid) continue;
        const oppositeIds = getOppositeIds(v, tid, taxes) || [];
        if (oppositeIds.some((id) => staffIdEq(id, sid))) {
          matchedTaxId = tid;
          break;
        }
      }
      if (matchedTaxId) {
        pushTaxRow(v, matchedTaxId);
        continue;
      }
    }

    // 2) Fallback: this staff's ADD-SAL with a tax line (staff ledger always has these)
    if (!isStaffAddSalaryVoucher(v, sid, taxes)) continue;
    const row = extractStaffAddSalaryTaxRow(v, sid, taxes);
    if (!row || !(Number(row.taxAmount) > 0)) continue;
    const taxId =
      resolveAddSalaryTaxAccountId(v, sid, taxes) ||
      (taxes.length ? String(taxes[0]?.id || "") : "");
    if (taxId) {
      pushTaxRow(v, taxId);
      continue;
    }
    // No tax master list — still show extracted tax credit so staff tax view is not empty
    const id = String(v.id || "");
    if (!id || rowsById.has(id)) continue;
    rowsById.set(id, {
      ...v,
      debit: 0,
      credit: Number(row.taxAmount) || 0,
      taxAmount: row.taxAmount,
      taxableAmount: row.taxableAmount,
      taxRate: row.taxRate,
      _staffLedgerSplitMode: "tax",
      _staffTaxDetailsMode: true,
    });
  }

  return Array.from(rowsById.values());
}


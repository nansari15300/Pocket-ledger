/**
 * Staff TDS details — same table shape as party TDS (Taxable / TDS Amount / Status),
 * sourced from ADD-SAL tax legs + salary bill-wise settlements.
 */
import {
  LEDGER_TDS_ROW_FLAG,
  LEDGER_TDS_SETTLEMENT_FLAG,
  summarizePartyTdsBalancesFromRows,
  type PartyTdsBalanceSummary,
  type PartyTdsJournalAccountSeed,
} from "@/lib/partyLedgerTdsView";
import {
  extractStaffAddSalaryTaxRow,
  findStaffTaxEntry,
  isStaffAddSalaryVoucher,
  staffCreditEntries,
} from "@/lib/staffTaxDetailsLedger";
import {
  getAllocationTotal,
  getPaymentInRemaining,
  getPaymentOutRemaining,
  getPaymentStatus,
  getTaxFromAllocation,
  getTaxNetTaxableAllocatedByVoucherIdFromSalarySources,
  isSalaryBillWiseSourceVoucher,
  type Allocation,
} from "@/lib/payment-allocation-utils";
import { round2 } from "@/lib/tdsVoucher";

function voucherDisplayNo(v: Record<string, unknown>): string {
  return String(v.voucherNumber ?? v.voucher_number ?? "").trim();
}

function resolveStaffTaxAccountId(
  voucher: Record<string, unknown>,
  staffId: string,
  processedTaxes: { id?: string }[]
): string {
  if (!Array.isArray(voucher.entries)) return "";
  const staffRows = staffCreditEntries(voucher, processedTaxes);
  const staffRowIndex = staffRows.findIndex(
    (e: { accountId?: unknown }) => String(e.accountId ?? "") === String(staffId)
  );
  if (staffRowIndex < 0) return "";
  const taxEntry = findStaffTaxEntry(voucher, staffId, staffRowIndex, processedTaxes);
  return taxEntry?.accountId ? String(taxEntry.accountId) : "";
}

function linkedSettlementNosForAddSalary(
  addSalaryId: string,
  voucherById: Map<string, Record<string, unknown>>
): string[] {
  const nos: string[] = [];
  for (const src of voucherById.values()) {
    if (!isSalaryBillWiseSourceVoucher(src)) continue;
    const allocs = (src.allocations as Allocation[] | undefined) || [];
    let taxAmt = 0;
    for (const a of allocs) {
      if (String(a.voucherId ?? "") !== addSalaryId) continue;
      taxAmt = round2(taxAmt + getTaxFromAllocation(a));
    }
    if (taxAmt <= 0) continue;
    const no = voucherDisplayNo(src);
    if (no && !nos.includes(no)) nos.push(no);
  }
  return nos;
}

export type ExpandStaffLedgerTdsOptions = {
  staffId: string;
  processedTaxes: { id?: string; name?: string }[];
  taxNameById: Map<string, string>;
  voucherById: Map<string, Record<string, unknown>>;
  /** When false, only ADD-SAL TDS bill rows (Hide linked trxn). Default true. */
  includeSettlements?: boolean;
};

/**
 * Convert staff tax-page rows → party-style TDS bill + settlement rows.
 * `taxPageRows` should already be filtered to this staff (mapTransactionsForStaffTaxPageView).
 */
export function expandStaffLedgerTdsRows<T extends Record<string, unknown>>(
  taxPageRows: T[],
  options: ExpandStaffLedgerTdsOptions
): T[] {
  const staffId = String(options.staffId || "");
  const taxes = options.processedTaxes || [];
  const voucherById = options.voucherById;
  const includeSettlements = options.includeSettlements !== false;
  if (!staffId) return [];

  const allocatedTaxByAddSalary = getTaxNetTaxableAllocatedByVoucherIdFromSalarySources(
    Array.from(voucherById.values())
  );

  const billRows: T[] = [];
  const settlementRows: T[] = [];

  for (const row of taxPageRows) {
    const id = String((row as { id?: unknown }).id ?? "");
    const source =
      id && voucherById.has(id)
        ? (voucherById.get(id)! as Record<string, unknown>)
        : (row as Record<string, unknown>);

    if (isStaffAddSalaryVoucher(source, staffId, taxes)) {
      const taxRow = extractStaffAddSalaryTaxRow(source, staffId, taxes);
      if (!taxRow || !(Number(taxRow.taxAmount) > 0)) continue;
      const tdsAmt = round2(taxRow.taxAmount);
      const tdsAccountId =
        resolveStaffTaxAccountId(source, staffId, taxes) ||
        String((row as { _staffTaxAccountId?: unknown })._staffTaxAccountId ?? "").trim();
      const allocated = round2(allocatedTaxByAddSalary.get(id)?.tax ?? 0);
      const pay = getPaymentStatus(tdsAmt, allocated, source.dueDate ?? (row as { dueDate?: unknown }).dueDate);
      const linkedFromVoucherNos = linkedSettlementNosForAddSalary(id, voucherById);
      billRows.push({
        ...source,
        ...row,
        [LEDGER_TDS_ROW_FLAG]: true,
        [LEDGER_TDS_SETTLEMENT_FLAG]: false,
        _ledgerTdsParentId: id,
        _rowKey: `${id}__staffTds`,
        type: "tds",
        _ledgerTdsSide: "purchase",
        _tdsAccountId: tdsAccountId,
        _tdsAccountName: options.taxNameById.get(tdsAccountId) ?? tdsAccountId,
        _tdsTaxable: round2(taxRow.taxableAmount),
        _tdsAmount: tdsAmt,
        debit: 0,
        credit: tdsAmt,
        balance: 0,
        linkedFromVoucherNos,
        linkedToVoucherNos: [] as string[],
        linkedFromVoucherNosBillWise: linkedFromVoucherNos,
        linkedToVoucherNosBillWise: [] as string[],
        paymentStatus: pay.isOverdue ? "overdue" : pay.status,
        isOverdue: pay.isOverdue,
        outstanding: pay.outstanding,
      } as T);
      continue;
    }

    if (!includeSettlements) continue;

    const debit = round2(Number((row as { debit?: unknown }).debit) || 0);
    const credit = round2(Number((row as { credit?: unknown }).credit) || 0);
    if (debit <= 0 && credit <= 0) continue;

    const srcType = String(source.type ?? "");
    const paymentTotal =
      round2(Number(source.amount ?? source.total ?? 0) || 0) || round2(debit + credit);
    let remaining = 0;
    if (srcType === "payment_out" || srcType === "direct_expense") {
      remaining = getPaymentOutRemaining(source);
    } else if (srcType === "payment_in" || srcType === "direct_income") {
      remaining = getPaymentInRemaining(source);
    } else if (srcType === "journal") {
      const allocs = (source.allocations as Allocation[] | undefined) || [];
      const allocatedOut = allocs.reduce((s, a) => s + getAllocationTotal(a), 0);
      remaining = Math.max(0, round2(paymentTotal - allocatedOut));
    }
    const allocated = Math.max(0, round2(paymentTotal - remaining));
    const pay = getPaymentStatus(paymentTotal, allocated, source.dueDate);

    const linkedToNos: string[] = [];
    const allocs = (source.allocations as Allocation[] | undefined) || [];
    for (const a of allocs) {
      const targetId = String(a.voucherId ?? "");
      if (!targetId || getTaxFromAllocation(a) <= 0) continue;
      const target = voucherById.get(targetId);
      const no = target ? voucherDisplayNo(target) : "";
      if (no && !linkedToNos.includes(no)) linkedToNos.push(no);
    }

    const tdsAccountId = String(
      (row as { _staffTaxAccountId?: unknown })._staffTaxAccountId ?? ""
    ).trim();

    settlementRows.push({
      ...source,
      ...row,
      [LEDGER_TDS_SETTLEMENT_FLAG]: true,
      [LEDGER_TDS_ROW_FLAG]: false,
      _rowKey: `${id}__staffTdsSettle`,
      _tdsAccountId: tdsAccountId,
      _tdsAccountName: options.taxNameById.get(tdsAccountId) ?? tdsAccountId,
      _tdsAmount: 0,
      _tdsTaxable: 0,
      tdsAmount: 0,
      _ledgerTdsSide: debit > 0 ? "purchase" : "sale",
      debit,
      credit,
      balance: 0,
      linkedFromVoucherNos: [] as string[],
      linkedToVoucherNos: linkedToNos,
      linkedFromVoucherNosBillWise: [] as string[],
      linkedToVoucherNosBillWise: linkedToNos,
      paymentStatus: pay.isOverdue ? "overdue" : pay.status,
      isOverdue: pay.isOverdue,
      outstanding: pay.outstanding,
    } as T);
  }

  return includeSettlements ? [...billRows, ...settlementRows] : billRows;
}

export function summarizeStaffTdsBalances(
  taxPageRows: Record<string, unknown>[],
  options: ExpandStaffLedgerTdsOptions
): PartyTdsBalanceSummary {
  const rows = expandStaffLedgerTdsRows(taxPageRows, {
    ...options,
    includeSettlements: true,
  });
  return summarizePartyTdsBalancesFromRows(rows);
}

export function resolvePrimaryStaffTdsAccountForJournal(
  taxPageRows: Record<string, unknown>[],
  options: ExpandStaffLedgerTdsOptions
): PartyTdsJournalAccountSeed | null {
  const rows = expandStaffLedgerTdsRows(taxPageRows, {
    ...options,
    includeSettlements: false,
  });
  const byAccount = new Map<string, { amount: number; name: string }>();
  for (const r of rows) {
    if ((r as Record<string, unknown>)[LEDGER_TDS_SETTLEMENT_FLAG]) continue;
    if (!(r as Record<string, unknown>)[LEDGER_TDS_ROW_FLAG]) continue;
    const id = String((r as { _tdsAccountId?: unknown })._tdsAccountId ?? "").trim();
    if (!id) continue;
    const amt = round2(Number((r as { _tdsAmount?: unknown })._tdsAmount ?? 0) || 0);
    if (amt <= 0) continue;
    const cur = byAccount.get(id) ?? {
      amount: 0,
      name: String(
        (r as { _tdsAccountName?: unknown })._tdsAccountName ??
          options.taxNameById.get(id) ??
          id
      ),
    };
    cur.amount = round2(cur.amount + amt);
    byAccount.set(id, cur);
  }
  if (byAccount.size === 0) return null;
  let bestId = "";
  let bestName = "";
  let bestAmt = -1;
  for (const [id, v] of byAccount) {
    if (v.amount > bestAmt) {
      bestAmt = v.amount;
      bestId = id;
      bestName = v.name;
    }
  }
  if (!bestId) return null;
  // Salary TDS is payable (purchase-like) → tax line credit on journal.
  return {
    accountId: bestId,
    accountName: bestName || options.taxNameById.get(bestId) || bestId,
    side: "purchase",
    journalLineType: "credit",
  };
}

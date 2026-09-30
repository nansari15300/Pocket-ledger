import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { FY_OPENING_ROW_TYPE } from "@/lib/fyPagination/fyOpeningRows";

/** Signed bill-wise Balance column value for one ledger row (party/staff bill-wise). */
export function signedBillWiseOutstandingForRow(
  t: any,
  context: string,
  groupEntityType?: string
): number | null {
  if (!t || t._spendWiseSpacer) return null;
  if (t.type === FISCAL_YEAR_PARTITION_ROW_TYPE || t.type === FY_OPENING_ROW_TYPE) return null;
  if (t.type === "opening_balance") return null;
  if (t.outstanding == null) return null;
  const out = Number(t.outstanding) || 0;
  if (Math.abs(out) < 1e-6) return 0;
  const debit = Number(t.debit) || 0;
  const hasDrAmount = debit > 0;
  const isStaffCtx = context === "staff" || (context === "group" && groupEntityType === "staff");
  const isStaffPaymentOut =
    isStaffCtx && (t.type === "payment_out" || t.type === "direct_expense");
  const isJournalWithOutstanding =
    t.type === "journal" && t.subType !== "add_salary" && t.outstanding != null;
  if (isJournalWithOutstanding) return debit > 0 ? out : -out;
  return isStaffPaymentOut ? out : hasDrAmount ? out : -out;
}

/** Sum bill-wise balances for rows strictly above `openingIndex` until prior FY opening / book opening. */
export function sumBillWiseOutstandingSegmentAboveIndex(
  rows: readonly any[],
  openingIndex: number,
  context: string,
  groupEntityType?: string
): number {
  let sum = 0;
  for (let j = openingIndex - 1; j >= 0; j--) {
    const row = rows[j];
    if (!row) continue;
    if (row.type === FY_OPENING_ROW_TYPE) break;
    if (row.type === "opening_balance") break;
    if (row.type === FISCAL_YEAR_PARTITION_ROW_TYPE) continue;
    const signed = signedBillWiseOutstandingForRow(row, context, groupEntityType);
    if (signed != null) sum += signed;
  }
  return sum;
}

/** Sum bill-wise rows from list start until first FY divider / FY opening row. */
export function sumBillWiseOutstandingBeforeFirstFyDelimiter(
  rows: readonly any[],
  context: string,
  groupEntityType?: string
): number {
  let sum = 0;
  for (const row of rows) {
    if (!row) continue;
    if (row.type === FISCAL_YEAR_PARTITION_ROW_TYPE || row.type === FY_OPENING_ROW_TYPE) break;
    const signed = signedBillWiseOutstandingForRow(row, context, groupEntityType);
    if (signed != null) sum += signed;
  }
  return sum;
}

export function signedToOpeningDrCr(signed: number): { debit: number; credit: number; balance: number } {
  const balance = Number(signed) || 0;
  const abs = Math.abs(balance);
  return {
    debit: balance > 0 ? abs : 0,
    credit: balance < 0 ? abs : 0,
    balance,
  };
}

/** Bill-wise party/staff: FY opening row = sum of bill-wise rows in prior FY segment (not running books balance). */
/** Signed carry on an FY opening synthetic row (bill-wise segment sum or books running balance). */
export function signedFyOpeningRowAmount(row: any, billWisePartyStaff = false): number {
  if (row?.type !== FY_OPENING_ROW_TYPE || row?._fyOpeningPending || row?._fyOpeningUnavailable) return 0;
  if (billWisePartyStaff && typeof row._billWiseOpeningSigned === "number" && Number.isFinite(row._billWiseOpeningSigned)) {
    return row._billWiseOpeningSigned;
  }
  const balance = Number(row.balance);
  if (Number.isFinite(balance) && Math.abs(balance) > 1e-6) return balance;
  const debit = Number(row.debit) || 0;
  const credit = Number(row.credit) || 0;
  return debit - credit;
}

function isLedgerTxnRowForHiddenAdjust(row: any): boolean {
  if (!row || row._spendWiseSpacer) return false;
  if (row.type === FISCAL_YEAR_PARTITION_ROW_TYPE || row.type === FY_OPENING_ROW_TYPE) return false;
  if (row.type === "opening_balance") return false;
  return true;
}

/**
 * Subtract hidden opening carry from balance / outstanding on each row after hidden opening rows.
 * FREEZE: only called when `LEDGER_OPENING_HIDE_AMOUNT_ENABLED` is true.
 */
export function applyHiddenLedgerOpeningAmountAdjustments(
  rows: readonly any[],
  options: {
    hiddenKeys: ReadonlySet<string>;
    fyOpeningKey: (rowId: string) => string;
    datedOpeningHiddenSigned: number;
    bookOpeningHiddenSigned: number;
    billWisePartyStaff: boolean;
  }
): any[] {
  const { hiddenKeys, fyOpeningKey, datedOpeningHiddenSigned, bookOpeningHiddenSigned, billWisePartyStaff } =
    options;
  let hiddenAdjust = (Number(datedOpeningHiddenSigned) || 0) + (Number(bookOpeningHiddenSigned) || 0);
  const out: any[] = [];
  for (const row of rows) {
    if (!row) {
      out.push(row);
      continue;
    }
    if (row.type === FY_OPENING_ROW_TYPE) {
      const key = fyOpeningKey(String(row.id || ""));
      const signed = signedFyOpeningRowAmount(row, billWisePartyStaff);
      if (hiddenKeys.has(key)) {
        hiddenAdjust += signed;
        out.push({
          ...row,
          debit: 0,
          credit: 0,
          balance: 0,
          runningBalance: 0,
          _billWiseOpeningSigned: 0,
        });
        continue;
      }
      out.push(row);
      continue;
    }
    if (!isLedgerTxnRowForHiddenAdjust(row) || Math.abs(hiddenAdjust) < 1e-6) {
      out.push(row);
      continue;
    }
    const adjust = hiddenAdjust;
    const next = { ...row };
    if (typeof next.balance === "number" && Number.isFinite(next.balance)) next.balance -= adjust;
    if (typeof next.runningBalance === "number" && Number.isFinite(next.runningBalance)) {
      next.runningBalance -= adjust;
    }
    if (next.outstanding != null && Number.isFinite(Number(next.outstanding))) {
      const debit = Number(next.debit) || 0;
      const signedOut = debit > 0 ? Number(next.outstanding) : -Number(next.outstanding);
      const adjustedSigned = signedOut - adjust;
      next.outstanding = Math.abs(adjustedSigned);
    }
    if (typeof next._spendWiseLedgerRunningBalance === "number") {
      next._spendWiseLedgerRunningBalance -= adjust;
    }
    if (typeof next._spendWiseRunningBalance === "number") {
      next._spendWiseRunningBalance -= adjust;
    }
    out.push(next);
  }
  return out;
}

export function patchFyOpeningRowsBillWiseBalances(
  rows: any[],
  context: string,
  groupEntityType?: string,
  enabled = false
): any[] {
  if (!enabled || !rows?.length) return rows;
  return rows.map((row, idx) => {
    if (row?.type !== FY_OPENING_ROW_TYPE || row?._fyOpeningPending || row?._fyOpeningUnavailable) return row;
    const signed = sumBillWiseOutstandingSegmentAboveIndex(rows, idx, context, groupEntityType);
    const { debit, credit, balance } = signedToOpeningDrCr(signed);
    return {
      ...row,
      _billWiseOpeningSigned: signed,
      balance,
      runningBalance: balance,
      debit,
      credit,
    };
  });
}

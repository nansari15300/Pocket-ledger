import { FY_OPENING_ROW_TYPE } from "@/lib/fyPagination/fyOpeningRows";
import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { lineTaxableBaseForTds, round2, sumVoucherLineTds } from "@/lib/tdsVoucher";
import { salePurchaseTaxableAmount } from "@/lib/salePurchaseDiscountAdjustment";
import type { TransactionColumnKey, VisibleColumns } from "@/components/vouchers/TransactionsTable";
import { DEFAULT_TRANSACTION_SORT_ORDER, sortTransactions, recomputeRunningBalanceTopToBottom } from "@/lib/transactionSort";
import type { TransactionSortBy, TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import {
  allocationEntityTxnId,
  getAllocationAmountForEntityScope,
  getAllocationTotal,
  getPaymentInRemaining,
  getPaymentOutRemaining,
  getPaymentStatus,
  getTaxFromAllocation,
  parseBillWiseEntityTxnId,
  type Allocation,
} from "@/lib/payment-allocation-utils";

export const LEDGER_TDS_ROW_FLAG = "_ledgerTdsRow" as const;
/** Payment / journal row that settles party TDS (tax-page style). */
export const LEDGER_TDS_SETTLEMENT_FLAG = "_ledgerTdsSettlementRow" as const;

const SALE_TYPES = new Set(["sale", "sale_service"]);
const PURCHASE_TYPES = new Set(["purchase", "purchase_service"]);
const BILL_TYPES = new Set([...SALE_TYPES, ...PURCHASE_TYPES]);
const TDS_SETTLEMENT_SOURCE_TYPES = new Set([
  "payment_out",
  "payment_in",
  "direct_expense",
  "direct_income",
  "journal",
]);

function voucherDisplayNo(v: Record<string, unknown>): string {
  return String(v.voucherNumber ?? v.voucher_number ?? "").trim();
}

/** Entity-wise TDS/tax allocation amount toward a sale/purchase TDS account (never party net). */
function allocationAmountForTdsAccount(
  alloc: Allocation,
  tdsAccountId: string,
  targetVoucher: Record<string, unknown>
): number {
  const accountId = String(tdsAccountId || "").trim();
  if (!accountId) return 0;
  const stored = allocationEntityTxnId(alloc);
  if (stored) {
    const parsed = parseBillWiseEntityTxnId(stored);
    if (!parsed || String(parsed.accountId) !== accountId) return 0;
    if (parsed.entityKind !== "tds" && parsed.entityKind !== "tax") return 0;
    const taxAmt = getTaxFromAllocation(alloc);
    return taxAmt > 0 ? taxAmt : 0;
  }
  return getAllocationAmountForEntityScope(
    alloc,
    { entityKind: "tds", accountId },
    targetVoucher
  );
}

export function buildTaxNameById(taxes: { id: string; name?: string }[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of taxes ?? []) {
    const id = String(t?.id ?? "").trim();
    if (!id) continue;
    map.set(id, String(t?.name ?? "").trim() || id);
  }
  return map;
}

function isFyOrPartitionSyntheticRow(t: { type?: string; id?: string }): boolean {
  const type = String(t?.type ?? "");
  const id = String(t?.id ?? "");
  return (
    type === FY_OPENING_ROW_TYPE ||
    type === FISCAL_YEAR_PARTITION_ROW_TYPE ||
    id.startsWith("__fiscal_partition_")
  );
}

function resolveTdsLegPaymentFields(args: {
  processedTxn: Record<string, unknown>;
  voucher: Record<string, unknown>;
  tdsAccountId: string;
  tdsAmt: number;
  voucherById?: Map<string, Record<string, unknown>>;
}): {
  paymentStatus: string;
  isOverdue: boolean;
  outstanding: number;
  linkedFromVoucherNos: string[];
} {
  const { processedTxn, voucher, tdsAccountId, tdsAmt, voucherById } = args;
  const targetId = String(voucher.id ?? "");
  const linkedFromVoucherNos: string[] = [];
  if (tdsAccountId && tdsAmt > 0 && voucherById && targetId) {
    let allocated = 0;
    for (const src of voucherById.values()) {
      const allocs = (src.allocations as Allocation[] | undefined) || [];
      let srcAmt = 0;
      for (const a of allocs) {
        if (String(a.voucherId ?? "") !== targetId) continue;
        srcAmt = round2(srcAmt + allocationAmountForTdsAccount(a, tdsAccountId, voucher));
      }
      if (srcAmt <= 0) continue;
      allocated = round2(allocated + srcAmt);
      const no = voucherDisplayNo(src);
      if (no && !linkedFromVoucherNos.includes(no)) linkedFromVoucherNos.push(no);
    }
    const result = getPaymentStatus(tdsAmt, allocated, voucher.dueDate ?? processedTxn.dueDate);
    return {
      paymentStatus: result.isOverdue ? "overdue" : result.status,
      isOverdue: result.isOverdue,
      outstanding: result.outstanding,
      linkedFromVoucherNos,
    };
  }
  return {
    paymentStatus: "unpaid",
    isOverdue: false,
    outstanding: tdsAmt,
    linkedFromVoucherNos,
  };
}

function buildLedgerTdsRow(
  voucher: Record<string, unknown>,
  opts: {
    lineIndex: number;
    tdsAccountId: string;
    tdsAccountName: string;
    tdsAmt: number;
    taxable: number;
    lineLabel: string;
    processedTxn?: Record<string, unknown>;
    voucherById?: Map<string, Record<string, unknown>>;
  }
): Record<string, unknown> {
  const vType = String(voucher.type ?? "");
  const isSale = SALE_TYPES.has(vType);
  const tdsAmt = round2(opts.tdsAmt);
  const debit = isSale ? tdsAmt : 0;
  const credit = !isSale ? tdsAmt : 0;
  const parentId = String(voucher.id ?? "");
  const processed = opts.processedTxn || voucher;
  const pay = resolveTdsLegPaymentFields({
    processedTxn: processed,
    voucher,
    tdsAccountId: opts.tdsAccountId,
    tdsAmt,
    voucherById: opts.voucherById,
  });
  return {
    ...voucher,
    // Entity-wise only — never copy party-leg linked voucher nos onto TDS rows.
    linkedFromVoucherNos: pay.linkedFromVoucherNos,
    linkedToVoucherNos: [] as string[],
    linkedFromVoucherNosBillWise: pay.linkedFromVoucherNos,
    linkedToVoucherNosBillWise: [] as string[],
    [LEDGER_TDS_ROW_FLAG]: true,
    _ledgerTdsParentId: parentId,
    _rowKey: `${parentId}__tds__${opts.lineIndex}`,
    type: "tds",
    _ledgerTdsSide: isSale ? "sale" : "purchase",
    _tdsAccountId: opts.tdsAccountId,
    _tdsAccountName: opts.tdsAccountName,
    _tdsTaxable: round2(opts.taxable),
    _tdsAmount: tdsAmt,
    _tdsLineLabel: opts.lineLabel,
    debit,
    credit,
    balance: 0,
    paymentStatus: pay.paymentStatus,
    isOverdue: pay.isOverdue,
    outstanding: pay.outstanding,
  };
}

/**
 * Tax-page style settlement rows for party TDS details: payments/journals that
 * allocated to this party's sale/purchase TDS legs (entity-wise).
 */
function buildPartyTdsSettlementRows(
  tdsBillRows: Record<string, unknown>[],
  voucherById: Map<string, Record<string, unknown>>,
  taxNameById: Map<string, string>
): Record<string, unknown>[] {
  type Agg = {
    src: Record<string, unknown>;
    amount: number;
    purchaseAmt: number;
    saleAmt: number;
    tdsAccountId: string;
    linkedToNos: string[];
  };
  const bySrc = new Map<string, Agg>();

  for (const bill of tdsBillRows) {
    const parentId = String(bill._ledgerTdsParentId ?? bill.id ?? "").trim();
    const tdsAccountId = String(bill._tdsAccountId ?? "").trim();
    if (!parentId || !tdsAccountId) continue;
    const target = voucherById.get(parentId) || bill;
    const billNo = voucherDisplayNo(bill) || voucherDisplayNo(target);
    const side = String(bill._ledgerTdsSide ?? "").toLowerCase();
    const isPurchase = side === "purchase";

    for (const src of voucherById.values()) {
      const srcId = String(src.id ?? "").trim();
      if (!srcId || srcId === parentId) continue;
      const srcType = String(src.type ?? "");
      if (!TDS_SETTLEMENT_SOURCE_TYPES.has(srcType)) continue;
      if (srcType === "journal" && String(src.subType ?? "") === "add_salary") continue;

      const allocs = (src.allocations as Allocation[] | undefined) || [];
      let amt = 0;
      for (const a of allocs) {
        if (String(a.voucherId ?? "") !== parentId) continue;
        amt = round2(amt + allocationAmountForTdsAccount(a, tdsAccountId, target));
      }
      if (amt <= 0) continue;

      const cur = bySrc.get(srcId) ?? {
        src,
        amount: 0,
        purchaseAmt: 0,
        saleAmt: 0,
        tdsAccountId,
        linkedToNos: [] as string[],
      };
      cur.amount = round2(cur.amount + amt);
      if (isPurchase) cur.purchaseAmt = round2(cur.purchaseAmt + amt);
      else cur.saleAmt = round2(cur.saleAmt + amt);
      if (billNo && !cur.linkedToNos.includes(billNo)) cur.linkedToNos.push(billNo);
      bySrc.set(srcId, cur);
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (const [srcId, agg] of bySrc) {
    const amt = round2(agg.amount);
    if (amt <= 0) continue;
    // Purchase TDS liability settle → Dr; sale TDS receivable settle → Cr (same as tax ledger).
    const debit = agg.purchaseAmt > 0 ? round2(agg.purchaseAmt) : 0;
    const credit = agg.saleAmt > 0 ? round2(agg.saleAmt) : 0;
    const tdsName = taxNameById.get(agg.tdsAccountId) ?? agg.tdsAccountId;
    const src = agg.src;
    const srcType = String(src.type ?? "");
    const paymentTotal =
      round2(Number(src.amount ?? src.total ?? 0) || 0) || amt;
    let remaining = 0;
    if (srcType === "payment_out" || srcType === "direct_expense") {
      remaining = getPaymentOutRemaining(src);
    } else if (srcType === "payment_in" || srcType === "direct_income") {
      remaining = getPaymentInRemaining(src);
    } else if (srcType === "journal") {
      const allocs = (src.allocations as Allocation[] | undefined) || [];
      const allocatedOut = allocs.reduce((s, a) => s + getAllocationTotal(a), 0);
      remaining = Math.max(0, round2(paymentTotal - allocatedOut));
    }
    const allocated = Math.max(0, round2(paymentTotal - remaining));
    const pay = getPaymentStatus(paymentTotal, allocated, src.dueDate);
    rows.push({
      ...src,
      [LEDGER_TDS_SETTLEMENT_FLAG]: true,
      [LEDGER_TDS_ROW_FLAG]: false,
      _rowKey: `${srcId}__tdsSettle`,
      _tdsAccountId: agg.tdsAccountId,
      _tdsAccountName: tdsName,
      // Linked settlement: amount only in Dr/Cr — never TDS Amount column.
      _tdsAmount: 0,
      _tdsTaxable: 0,
      tdsAmount: 0,
      _ledgerTdsSide: debit > 0 ? "purchase" : "sale",
      debit,
      credit,
      balance: 0,
      linkedFromVoucherNos: [] as string[],
      linkedToVoucherNos: agg.linkedToNos,
      linkedFromVoucherNosBillWise: [] as string[],
      linkedToVoucherNosBillWise: agg.linkedToNos,
      paymentStatus: pay.isOverdue ? "overdue" : pay.status,
      isOverdue: pay.isOverdue,
      outstanding: pay.outstanding,
    });
  }
  return rows;
}

function lineLabelFromItem(line: Record<string, unknown>): string {
  const name = String(line.itemName ?? line.name ?? line.description ?? "").trim();
  return name;
}

export type ExpandPartyLedgerTdsOptions = {
  /** Party ledger: only this party's sale/purchase vouchers. */
  partyId?: string;
  /** Full voucher docs (lineItems) keyed by id — party rows may be summary-only. */
  voucherById?: Map<string, Record<string, unknown>>;
  /**
   * When false, only TDS bill rows (sale/purchase legs). When true (default), also
   * include entity-wise settlement payments/journals (Show linked trxn).
   */
  includeSettlements?: boolean;
};

function expandSingleVoucherTdsRows(
  voucher: Record<string, unknown>,
  taxNameById: Map<string, string>,
  partyId?: string,
  processedTxn?: Record<string, unknown>,
  voucherById?: Map<string, Record<string, unknown>>
): Record<string, unknown>[] {
  const vType = String(voucher.type ?? "");
  if (!BILL_TYPES.has(vType)) return [];
  if (partyId && String(voucher.partyId ?? "") !== String(partyId)) return [];

  const lines = Array.isArray(voucher.lineItems) ? (voucher.lineItems as Record<string, unknown>[]) : [];
  const out: Record<string, unknown>[] = [];
  const rowOptsBase = { processedTxn, voucherById };

  lines.forEach((line, lineIndex) => {
    const tdsAccountId = String(line.tdsAccountId ?? "").trim();
    const tdsAmt = round2(Number(line.tdsAmount) || 0);
    if (!tdsAccountId || tdsAmt <= 0) return;
    out.push(
      buildLedgerTdsRow(voucher, {
        ...rowOptsBase,
        lineIndex,
        tdsAccountId,
        tdsAccountName: taxNameById.get(tdsAccountId) ?? tdsAccountId,
        tdsAmt,
        taxable: lineTaxableBaseForTds(line),
        lineLabel: lineLabelFromItem(line),
      })
    );
  });

  if (out.length === 0) {
    const headerTds = round2(sumVoucherLineTds(voucher as { lineItems?: unknown; tds?: unknown }));
    if (headerTds <= 0) return [];
    out.push(
      buildLedgerTdsRow(voucher, {
        ...rowOptsBase,
        lineIndex: 0,
        tdsAccountId: "",
        tdsAccountName: "",
        tdsAmt: headerTds,
        taxable: salePurchaseTaxableAmount(voucher as Parameters<typeof salePurchaseTaxableAmount>[0]),
        lineLabel: "",
      })
    );
  }

  return out;
}

/** Party / party-group ledger: TDS bill rows + entity-wise settlement rows (tax-page reuse). */
export function expandPartyLedgerTdsRows<T extends Record<string, unknown>>(
  transactions: T[],
  taxNameById: Map<string, string>,
  options?: ExpandPartyLedgerTdsOptions
): T[] {
  const partyId = options?.partyId ? String(options.partyId) : undefined;
  const voucherById = options?.voucherById;
  const billRows: T[] = [];
  for (const t of transactions) {
    if (isFyOrPartitionSyntheticRow(t)) continue;
    if ((t as Record<string, unknown>)[LEDGER_TDS_ROW_FLAG]) continue;
    if ((t as Record<string, unknown>)[LEDGER_TDS_SETTLEMENT_FLAG]) continue;
    const id = String((t as { id?: unknown }).id ?? "");
    const source =
      id && voucherById?.has(id) ? (voucherById.get(id)! as Record<string, unknown>) : (t as Record<string, unknown>);
    billRows.push(
      ...(expandSingleVoucherTdsRows(
        source,
        taxNameById,
        partyId,
        t as Record<string, unknown>,
        voucherById
      ) as T[])
    );
  }
  if (options?.includeSettlements === false) return billRows;
  if (!voucherById || billRows.length === 0) return billRows;
  const settlements = buildPartyTdsSettlementRows(
    billRows as Record<string, unknown>[],
    voucherById,
    taxNameById
  ) as T[];
  return [...billRows, ...settlements];
}

export function ledgerTdsTypeDisplayLabel(side: unknown): string {
  const s = String(side ?? "").toLowerCase();
  if (s === "purchase" || s === "purchase_service") return "pur TDS";
  return "sale TDS";
}

export function isLedgerTdsTableRow(
  t: { type?: unknown; [LEDGER_TDS_ROW_FLAG]?: boolean } | null | undefined
): boolean {
  if (!t) return false;
  return Boolean(t[LEDGER_TDS_ROW_FLAG]) || String(t.type ?? "") === "tds";
}

export function isLedgerTdsSettlementRow(
  t: { [LEDGER_TDS_SETTLEMENT_FLAG]?: boolean } | null | undefined
): boolean {
  return Boolean(t?.[LEDGER_TDS_SETTLEMENT_FLAG]);
}

export function isLedgerTdsPurchaseRow(t: { _ledgerTdsSide?: unknown } | null | undefined): boolean {
  return String(t?._ledgerTdsSide ?? "").toLowerCase() === "purchase";
}

/** Sale TDS → green pill/amounts; purchase TDS → red. */
export function ledgerTdsTypePillDrCrSide(t: { _ledgerTdsSide?: unknown } | null | undefined): "dr" | "cr" {
  return isLedgerTdsPurchaseRow(t) ? "cr" : "dr";
}

/** Sale TDS → green amounts; purchase TDS → red (party ledger TDS view). */
export function ledgerTdsRowAmountToneClass(t: { _ledgerTdsSide?: unknown } | null | undefined): string {
  return isLedgerTdsPurchaseRow(t) ? "text-red-700 font-semibold" : "text-green-700 font-semibold";
}

export function buildLedgerTdsVisibleColumns(showBillWiseStatus: boolean): VisibleColumns {
  return {
    syncStatus: false,
    date: true,
    type: true,
    voucherNo: true,
    tdsTaxable: true,
    tdsAmount: true,
    user: true,
    file: true,
    dr: true,
    cr: true,
    status: showBillWiseStatus,
    runningBalance: true,
  };
}

/** Columns shown in footer Columns menu while TDS pill is on (no Sync / TDS Account). */
export function ledgerTdsFooterColumnMenuKeys(showBillWiseStatus: boolean): TransactionColumnKey[] {
  const keys: TransactionColumnKey[] = [
    "date",
    "type",
    "voucherNo",
    "user",
    "file",
    "tdsTaxable",
    "tdsAmount",
    "dr",
    "cr",
    "runningBalance",
  ];
  if (showBillWiseStatus) {
    keys.splice(keys.indexOf("runningBalance"), 0, "status");
  }
  return keys;
}

export function mergeLedgerTdsVisibleColumnsWithPrefs(
  prefs: VisibleColumns,
  showBillWiseStatus: boolean
): VisibleColumns {
  const base = buildLedgerTdsVisibleColumns(showBillWiseStatus);
  const allowed = new Set(ledgerTdsFooterColumnMenuKeys(showBillWiseStatus));
  const merged: VisibleColumns = { ...base, syncStatus: false };
  for (const key of allowed) {
    if (prefs[key] !== undefined) {
      merged[key] = prefs[key] !== false;
    }
  }
  if (showBillWiseStatus) {
    merged.status = true;
  }
  return merged;
}

export function sortLedgerTdsRowsForDisplay<T extends { debit?: unknown; credit?: unknown; balance?: unknown }>(
  rows: T[],
  sortBy: TransactionSortBy = "date",
  sortOrder: TransactionSortOrder = DEFAULT_TRANSACTION_SORT_ORDER
): T[] {
  const sorted = sortTransactions(rows, sortBy, sortOrder);
  return recomputeRunningBalanceTopToBottom(sorted, 0, {
    booksDrCrForRow: (tx) => partyTdsLedgerBooksDrCrFromRow(tx),
  });
}

export const LEDGER_TDS_COLUMN_LABELS = {
  tdsTaxable: "Taxable",
  tdsAmount: "TDS Amount",
} as const;

/** Party header TDS Balance — sale vs purchase totals (same rows as TDS details table). */
export type PartyTdsBalanceSummary = {
  saleTds: number;
  purchaseTds: number;
  /** Signed closing for TDS ledger: sale Dr − purchase Cr (same as running balance end). */
  netSigned: number;
  hasAny: boolean;
};

/** Party/staff TDS detail bill row that is still Unverified — exclude from header/footer books. */
export function isUnverifiedLedgerTdsBillRow(
  t: {
    type?: unknown;
    subType?: unknown;
    isTdsVerified?: unknown;
    tds?: unknown;
    lineItems?: unknown;
    _tdsAmount?: unknown;
    _tdsAccountId?: unknown;
    entries?: unknown;
    [LEDGER_TDS_ROW_FLAG]?: boolean;
    [LEDGER_TDS_SETTLEMENT_FLAG]?: boolean;
  } | null | undefined
): boolean {
  if (!t) return false;
  if (isLedgerTdsSettlementRow(t)) return false;
  if (!isLedgerTdsTableRow(t as { type?: string; [LEDGER_TDS_ROW_FLAG]?: boolean })) return false;
  return (
    resolveSalePurchaseTdsVerifyLabel(t) === SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE
  );
}

/** Dr/Cr that move party/staff TDS-details running / footer balance. */
export function partyTdsLedgerBooksDrCrFromRow(t: {
  debit?: unknown;
  credit?: unknown;
  type?: unknown;
  isTdsVerified?: unknown;
  tds?: unknown;
  lineItems?: unknown;
  _tdsAmount?: unknown;
  [LEDGER_TDS_ROW_FLAG]?: boolean;
  [LEDGER_TDS_SETTLEMENT_FLAG]?: boolean;
} | null | undefined): { debit: number; credit: number } {
  const debit = Number(t?.debit) || 0;
  const credit = Number(t?.credit) || 0;
  if (isUnverifiedLedgerTdsBillRow(t)) return { debit: 0, credit: 0 };
  return { debit, credit };
}

export function summarizePartyTdsBalancesFromRows(
  tdsRows: {
    _ledgerTdsSide?: unknown;
    _tdsAmount?: unknown;
    outstanding?: unknown;
    debit?: unknown;
    credit?: unknown;
    isTdsVerified?: unknown;
    tds?: unknown;
    lineItems?: unknown;
    [LEDGER_TDS_ROW_FLAG]?: boolean;
    [LEDGER_TDS_SETTLEMENT_FLAG]?: boolean;
    type?: unknown;
  }[]
): PartyTdsBalanceSummary {
  let saleTds = 0;
  let purchaseTds = 0;
  for (const r of tdsRows) {
    // Header = open TDS only (bill legs); ignore settlement payment rows.
    if (r[LEDGER_TDS_SETTLEMENT_FLAG]) continue;
    if (!r[LEDGER_TDS_ROW_FLAG] && String(r.type ?? "") !== "tds") continue;
    // Unverified TDS stays on the table (dim / Waiting) but does not move Sale/Pur TDS balance.
    if (isUnverifiedLedgerTdsBillRow(r)) continue;
    const full = round2(Number(r._tdsAmount ?? r.debit ?? r.credit) || 0);
    if (full <= 0) continue;
    const openRaw = Number(r.outstanding);
    const open = Number.isFinite(openRaw) ? Math.max(0, round2(openRaw)) : full;
    if (open <= 0) continue;
    if (String(r._ledgerTdsSide ?? "").toLowerCase() === "purchase") purchaseTds += open;
    else saleTds += open;
  }
  saleTds = round2(saleTds);
  purchaseTds = round2(purchaseTds);
  return {
    saleTds,
    purchaseTds,
    netSigned: round2(saleTds - purchaseTds),
    hasAny: saleTds > 0 || purchaseTds > 0,
  };
}

/** Expand + sum for a party (reuse voucherById when ledger rows are summary-only). */
export function summarizePartyTdsBalances(
  transactions: Record<string, unknown>[],
  taxNameById: Map<string, string>,
  options?: ExpandPartyLedgerTdsOptions
): PartyTdsBalanceSummary {
  const rows = expandPartyLedgerTdsRows(transactions, taxNameById, options);
  return summarizePartyTdsBalancesFromRows(rows);
}

/** Primary TDS tax account for party TDS Journal seed (largest amount; side matches Pur vs Sale). */
export type PartyTdsJournalAccountSeed = {
  accountId: string;
  accountName: string;
  side: "sale" | "purchase";
  /** Journal line type for the TDS tax account (sale → debit, purchase → credit). */
  journalLineType: "debit" | "credit";
};

export function resolvePrimaryPartyTdsAccountForJournal(
  transactions: Record<string, unknown>[],
  taxNameById: Map<string, string>,
  options?: ExpandPartyLedgerTdsOptions
): PartyTdsJournalAccountSeed | null {
  const rows = expandPartyLedgerTdsRows(transactions, taxNameById, options);
  const byAccount = new Map<string, { sale: number; purchase: number; name: string }>();
  for (const r of rows) {
    if ((r as Record<string, unknown>)[LEDGER_TDS_SETTLEMENT_FLAG]) continue;
    if (!(r as Record<string, unknown>)[LEDGER_TDS_ROW_FLAG] && String((r as { type?: unknown }).type ?? "") !== "tds") {
      continue;
    }
    const id = String((r as { _tdsAccountId?: unknown })._tdsAccountId ?? "").trim();
    if (!id) continue;
    const amt = round2(Number((r as { _tdsAmount?: unknown })._tdsAmount ?? 0) || 0);
    if (amt <= 0) continue;
    const cur = byAccount.get(id) ?? {
      sale: 0,
      purchase: 0,
      name: String((r as { _tdsAccountName?: unknown })._tdsAccountName ?? taxNameById.get(id) ?? id),
    };
    if (String((r as { _ledgerTdsSide?: unknown })._ledgerTdsSide ?? "").toLowerCase() === "purchase") {
      cur.purchase = round2(cur.purchase + amt);
    } else {
      cur.sale = round2(cur.sale + amt);
    }
    byAccount.set(id, cur);
  }
  if (byAccount.size === 0) return null;

  let bestId = "";
  let bestSale = 0;
  let bestPurchase = 0;
  let bestName = "";
  let bestTotal = -1;
  for (const [id, v] of byAccount) {
    const total = round2(v.sale + v.purchase);
    if (total > bestTotal) {
      bestTotal = total;
      bestId = id;
      bestSale = v.sale;
      bestPurchase = v.purchase;
      bestName = v.name;
    }
  }
  if (!bestId) return null;
  const side: "sale" | "purchase" =
    bestPurchase > bestSale ? "purchase" : bestSale > 0 ? "sale" : "purchase";
  return {
    accountId: bestId,
    accountName: bestName || taxNameById.get(bestId) || bestId,
    side,
    journalLineType: side === "purchase" ? "credit" : "debit",
  };
}

/** True when journal is marked as TDS settlement (party statement hides amounts). */
export function isTdsJournalVoucher(v: { type?: unknown; subType?: unknown; isTdsJournal?: unknown } | null | undefined): boolean {
  return (
    String(v?.type ?? "") === "journal" &&
    String(v?.subType ?? "") !== "add_salary" &&
    v?.isTdsJournal === true
  );
}

/** Sale/Purchase (ya TDS detail row) pe TDS line selected hai. */
export function voucherHasTdsSelected(t: {
  tds?: unknown;
  lineItems?: unknown;
  _tdsAmount?: unknown;
} | null | undefined): boolean {
  if (!t) return false;
  if (Number(t.tds) > 0) return true;
  if (Number(t._tdsAmount) > 0) return true;
  const lines = Array.isArray(t.lineItems) ? (t.lineItems as Record<string, unknown>[]) : [];
  return lines.some((li) => {
    const id = String(li?.tdsAccountId ?? "").trim();
    const amt = Number(li?.tdsAmount) || 0;
    return Boolean(id) && amt > 0;
  });
}

export const SALE_PURCHASE_TDS_VERIFIED_MESSAGE = "TDS Verified";
export const SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE = "TDS Unverified";

/** Party / tax / staff ledger: TDS verify badge contexts. */
export function isSalePurchaseTdsVerifyLedgerContext(
  context: string | undefined,
  groupEntityType?: string | null
): boolean {
  if (context === "party" || context === "tax" || context === "staff") return true;
  if (
    context === "group" &&
    (groupEntityType === "party" || groupEntityType === "tax" || groupEntityType === "staff")
  ) {
    return true;
  }
  return false;
}

function isAddSalaryVoucher(t: { type?: unknown; subType?: unknown } | null | undefined): boolean {
  if (!t) return false;
  return (
    (String(t.type ?? "") === "journal" && String(t.subType ?? "") === "add_salary") ||
    String(t.type ?? "") === "add_salary"
  );
}

/** Add-salary tax legs for one tax account (or all tax credits when taxId empty). */
function addSalaryTaxEntriesForAccount(
  t: { entries?: unknown },
  taxAccountId?: string
): Array<{ isTdsVerified?: unknown; credit?: unknown; debit?: unknown; accountId?: unknown; narration?: unknown }> {
  const entries = Array.isArray(t.entries) ? t.entries : [];
  const taxId = String(taxAccountId ?? "").trim();
  return entries.filter((e: any) => {
    const cr = Number(e?.credit) || 0;
    const dr = Number(e?.debit) || 0;
    if (cr <= 0 && dr <= 0) return false;
    const nar = String(e?.narration ?? "");
    // Tax satellite lines: "TDS for … (Staff ID: …)" or account is the tax id
    if (taxId) return String(e?.accountId ?? "").trim() === taxId;
    return nar.includes("(Staff ID:") || nar.toLowerCase().includes("tds for");
  }) as Array<{ isTdsVerified?: unknown; credit?: unknown; debit?: unknown; accountId?: unknown; narration?: unknown }>;
}

function addSalaryTaxEntryForStaff(
  t: { entries?: unknown },
  staffId: string
): { isTdsVerified?: unknown; credit?: unknown; debit?: unknown } | null {
  const sid = String(staffId ?? "").trim();
  if (!sid) return null;
  const marker = `(Staff ID: ${sid})`;
  const entries = Array.isArray(t.entries) ? t.entries : [];
  const hit = entries.find((e: any) => {
    const nar = String(e?.narration ?? "");
    if (!nar.includes(marker)) return false;
    return (Number(e?.credit) || 0) > 0 || (Number(e?.debit) || 0) > 0;
  });
  return hit ?? null;
}

/**
 * Sale/Purchase (+ party TDS detail rows) + Add Salary: empty Dr/Cr pe Verified / Unverified.
 * Journal TDS Journal rows alag handle hote hain.
 */
export function resolveSalePurchaseTdsVerifyLabel(
  t: {
    type?: unknown;
    subType?: unknown;
    isTdsJournal?: unknown;
    isTdsVerified?: unknown;
    tds?: unknown;
    lineItems?: unknown;
    _tdsAmount?: unknown;
    entries?: unknown;
  } | null | undefined,
  opts?: { context?: string; contextId?: string; groupEntityType?: string | null }
): typeof SALE_PURCHASE_TDS_VERIFIED_MESSAGE | typeof SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE | null {
  if (!t) return null;
  if (isTdsJournalVoucher(t)) return null;

  if (isAddSalaryVoucher(t)) {
    const ctx = opts?.context;
    const ctxId = String(opts?.contextId ?? "").trim();
    const isTaxCtx = ctx === "tax" || (ctx === "group" && opts?.groupEntityType === "tax");
    const isStaffCtx = ctx === "staff" || (ctx === "group" && opts?.groupEntityType === "staff");
    if (isTaxCtx) {
      const legs = addSalaryTaxEntriesForAccount(t, ctxId || undefined);
      if (legs.length === 0) return null;
      const allVerified = legs.every((e) => e.isTdsVerified === true);
      return allVerified ? SALE_PURCHASE_TDS_VERIFIED_MESSAGE : SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE;
    }
    if (isStaffCtx && ctxId) {
      const taxLeg = addSalaryTaxEntryForStaff(t, ctxId);
      if (!taxLeg) return null;
      const amt = Number(taxLeg.credit) || Number(taxLeg.debit) || 0;
      if (amt <= 0) return null;
      return taxLeg.isTdsVerified === true
        ? SALE_PURCHASE_TDS_VERIFIED_MESSAGE
        : SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE;
    }
    return null;
  }

  const rawType = String(t.type ?? "");
  const isSalePurchase =
    rawType === "sale" ||
    rawType === "sale_service" ||
    rawType === "purchase" ||
    rawType === "purchase_service" ||
    isLedgerTdsTableRow(t);
  if (!isSalePurchase) return null;
  if (!voucherHasTdsSelected(t)) return null;
  return t.isTdsVerified === true
    ? SALE_PURCHASE_TDS_VERIFIED_MESSAGE
    : SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE;
}

/**
 * Tax ledger: this account is a TDS / Add-Salary tax leg on the voucher
 * (not a plain VAT/Sales Tax line). Used for Unverified dim/Waiting + balance exclude.
 */
export function taxAccountIsTdsVerifyLegOnVoucher(
  t: {
    type?: unknown;
    subType?: unknown;
    isTdsVerified?: unknown;
    tds?: unknown;
    lineItems?: unknown;
    _tdsAmount?: unknown;
    _tdsAccountId?: unknown;
    entries?: unknown;
    [LEDGER_TDS_ROW_FLAG]?: boolean;
  } | null | undefined,
  taxAccountId: string | null | undefined
): boolean {
  if (!t) return false;
  const taxId = String(taxAccountId ?? "").trim();
  if (!taxId) return false;
  if (isAddSalaryVoucher(t)) {
    return addSalaryTaxEntriesForAccount(t, taxId).length > 0;
  }
  // Tax-page TDS detail / settlement rows (split from sale/purchase).
  if (isLedgerTdsTableRow(t as { type?: string; [LEDGER_TDS_ROW_FLAG]?: boolean })) {
    const rowTaxId = String((t as { _tdsAccountId?: unknown })._tdsAccountId ?? "").trim();
    const amt = Number((t as { _tdsAmount?: unknown })._tdsAmount ?? 0) || 0;
    if (rowTaxId) return rowTaxId === taxId && amt > 0;
    // Legacy rows without _tdsAccountId: still a TDS leg when amount present.
    return amt > 0 || voucherHasTdsSelected(t);
  }
  const lines = Array.isArray(t.lineItems) ? (t.lineItems as Record<string, unknown>[]) : [];
  return lines.some((li) => {
    const id = String(li?.tdsAccountId ?? "").trim();
    const amt = Number(li?.tdsAmount) || 0;
    return id === taxId && amt > 0;
  });
}

/** Dr/Cr that move tax books balance (Unverified TDS → 0; UI amount still shown). */
export function taxLedgerBooksDrCrFromRow(
  t: {
    debit?: unknown;
    credit?: unknown;
    type?: unknown;
    subType?: unknown;
    isTdsVerified?: unknown;
    tds?: unknown;
    lineItems?: unknown;
    _tdsAmount?: unknown;
    _tdsAccountId?: unknown;
    entries?: unknown;
    [LEDGER_TDS_ROW_FLAG]?: boolean;
  } | null | undefined,
  taxAccountId: string | null | undefined
): { debit: number; credit: number } {
  const debit = Number(t?.debit) || 0;
  const credit = Number(t?.credit) || 0;
  if (taxAccountId && isUnverifiedTaxTdsBalanceRow(t, taxAccountId)) {
    return { debit: 0, credit: 0 };
  }
  return { debit, credit };
}

/**
 * Tax page running / list / Dated Opening / footer: Unverified TDS legs do not move
 * the balance (row still shows dim amount + "Waiting"). Same rule as the badge label.
 */
export function isUnverifiedTaxTdsBalanceRow(
  t: {
    type?: unknown;
    subType?: unknown;
    isTdsVerified?: unknown;
    tds?: unknown;
    lineItems?: unknown;
    _tdsAmount?: unknown;
    _tdsAccountId?: unknown;
    entries?: unknown;
    [LEDGER_TDS_ROW_FLAG]?: boolean;
  } | null | undefined,
  taxAccountId: string | null | undefined
): boolean {
  return (
    resolveSalePurchaseTdsVerifyLabel(t, {
      context: "tax",
      contextId: String(taxAccountId ?? "").trim(),
    }) === SALE_PURCHASE_TDS_UNVERIFIED_MESSAGE
  );
}

/** Add-voucher journal default data with TDS tax account pre-selected. */
export function buildPartyTdsJournalDefaultVoucherData(
  seed: PartyTdsJournalAccountSeed
): Record<string, unknown> {
  const oppType = seed.journalLineType === "credit" ? "debit" : "credit";
  return {
    defaultTab: "journal",
    isTdsJournal: true,
    _journalFocusSide: seed.journalLineType,
    _openedFromAccountId: seed.accountId,
    lines: [
      {
        accountId: seed.accountId,
        entityType: "tax",
        type: seed.journalLineType,
        amount: 0,
        isAutoLine: false,
      },
      {
        accountId: "",
        entityType: "",
        type: oppType,
        amount: 0,
        isAutoLine: true,
      },
    ],
  };
}

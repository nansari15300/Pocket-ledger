import { FY_OPENING_ROW_TYPE } from "@/lib/fyPagination/fyOpeningRows";
import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { lineTaxableBaseForTds, round2, sumVoucherLineTds } from "@/lib/tdsVoucher";
import { salePurchaseTaxableAmount } from "@/lib/salePurchaseDiscountAdjustment";
import type { TransactionColumnKey, VisibleColumns } from "@/components/vouchers/TransactionsTable";
import { DEFAULT_TRANSACTION_SORT_ORDER, sortTransactions, recomputeRunningBalanceTopToBottom } from "@/lib/transactionSort";
import type { TransactionSortBy, TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";

export const LEDGER_TDS_ROW_FLAG = "_ledgerTdsRow" as const;

const SALE_TYPES = new Set(["sale", "sale_service"]);
const PURCHASE_TYPES = new Set(["purchase", "purchase_service"]);
const BILL_TYPES = new Set([...SALE_TYPES, ...PURCHASE_TYPES]);

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

function buildLedgerTdsRow(
  voucher: Record<string, unknown>,
  opts: {
    lineIndex: number;
    tdsAccountId: string;
    tdsAccountName: string;
    tdsAmt: number;
    taxable: number;
    lineLabel: string;
  }
): Record<string, unknown> {
  const vType = String(voucher.type ?? "");
  const isSale = SALE_TYPES.has(vType);
  const tdsAmt = round2(opts.tdsAmt);
  const debit = isSale ? tdsAmt : 0;
  const credit = !isSale ? tdsAmt : 0;
  const parentId = String(voucher.id ?? "");
  return {
    ...voucher,
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
  };
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
};

function expandSingleVoucherTdsRows(
  voucher: Record<string, unknown>,
  taxNameById: Map<string, string>,
  partyId?: string
): Record<string, unknown>[] {
  const vType = String(voucher.type ?? "");
  if (!BILL_TYPES.has(vType)) return [];
  if (partyId && String(voucher.partyId ?? "") !== String(partyId)) return [];

  const lines = Array.isArray(voucher.lineItems) ? (voucher.lineItems as Record<string, unknown>[]) : [];
  const out: Record<string, unknown>[] = [];

  lines.forEach((line, lineIndex) => {
    const tdsAccountId = String(line.tdsAccountId ?? "").trim();
    const tdsAmt = round2(Number(line.tdsAmount) || 0);
    if (!tdsAccountId || tdsAmt <= 0) return;
    out.push(
      buildLedgerTdsRow(voucher, {
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

/** Party / party-group ledger: one row per sale/purchase line with TDS. */
export function expandPartyLedgerTdsRows<T extends Record<string, unknown>>(
  transactions: T[],
  taxNameById: Map<string, string>,
  options?: ExpandPartyLedgerTdsOptions
): T[] {
  const partyId = options?.partyId ? String(options.partyId) : undefined;
  const voucherById = options?.voucherById;
  const rows: T[] = [];
  for (const t of transactions) {
    if (isFyOrPartitionSyntheticRow(t)) continue;
    if ((t as Record<string, unknown>)[LEDGER_TDS_ROW_FLAG]) continue;
    const id = String((t as { id?: unknown }).id ?? "");
    const source =
      id && voucherById?.has(id) ? (voucherById.get(id)! as T) : t;
    rows.push(...(expandSingleVoucherTdsRows(source as Record<string, unknown>, taxNameById, partyId) as T[]));
  }
  return rows;
}

export function ledgerTdsTypeDisplayLabel(side: unknown): string {
  const s = String(side ?? "").toLowerCase();
  if (s === "purchase" || s === "purchase_service") return "pur TDS";
  return "sale TDS";
}

export function isLedgerTdsTableRow(t: { type?: string; [LEDGER_TDS_ROW_FLAG]?: boolean } | null | undefined): boolean {
  if (!t) return false;
  return Boolean(t[LEDGER_TDS_ROW_FLAG]) || String(t.type ?? "") === "tds";
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
  return recomputeRunningBalanceTopToBottom(sorted, 0);
}

export const LEDGER_TDS_COLUMN_LABELS = {
  tdsTaxable: "Taxable",
  tdsAmount: "TDS Amount",
} as const;

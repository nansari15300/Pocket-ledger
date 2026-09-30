import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { FY_OPENING_ROW_TYPE } from "@/lib/fyPagination/fyOpeningRows";

export type BillWiseLinkPreviewSelection = {
  anchorRowId: string;
  linkedVoucherNo: string;
};

const PREVIEW_GROUP_ID = "__bill_wise_link_preview__";

export function ledgerRowStableId(row: { id?: string; _rowKey?: string } | null | undefined): string {
  const id = String(row?.id ?? row?._rowKey ?? "").trim();
  return id || "";
}

export function normalizeLedgerVoucherNumber(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isReorderableLedgerRow(row: any): boolean {
  if (!row || row._spendWiseSpacer) return false;
  if (row.type === FISCAL_YEAR_PARTITION_ROW_TYPE || row.type === FY_OPENING_ROW_TYPE) return false;
  if (row.type === "opening_balance") return false;
  return Boolean(ledgerRowStableId(row));
}

function findRowByVoucherNo(rows: readonly any[], voucherNo: string): any | null {
  const target = normalizeLedgerVoucherNumber(voucherNo);
  if (!target) return null;
  for (const row of rows) {
    if (!isReorderableLedgerRow(row)) continue;
    const vn = normalizeLedgerVoucherNumber(row.voucherNumber ?? row.voucher_number);
    if (vn && vn === target) return row;
  }
  return null;
}

/** Session-only: pull linked voucher row next to anchor row inside a preview group card. */
export function applyBillWiseLinkPreviewGrouping(
  rows: readonly any[],
  preview: BillWiseLinkPreviewSelection | null | undefined
): any[] {
  if (!preview?.anchorRowId || !preview.linkedVoucherNo || !rows?.length) return [...rows];

  const anchorId = String(preview.anchorRowId).trim();
  const linkedRow = findRowByVoucherNo(rows, preview.linkedVoucherNo);
  const linkedId = linkedRow ? ledgerRowStableId(linkedRow) : "";
  if (!linkedId || linkedId === anchorId) return [...rows];

  const anchorIndex = rows.findIndex((r) => ledgerRowStableId(r) === anchorId);
  if (anchorIndex < 0) return [...rows];

  const pulled: any[] = [];
  const rest: any[] = [];
  for (const row of rows) {
    const id = ledgerRowStableId(row);
    if (id === linkedId && id !== anchorId) {
      pulled.push(row);
      continue;
    }
    rest.push(row);
  }
  if (!pulled.length) return [...rows];

  const anchorIndexInRest = rest.findIndex((r) => ledgerRowStableId(r) === anchorId);
  if (anchorIndexInRest < 0) return [...rows];

  const anchorRow = rest[anchorIndexInRest];
  const linked = pulled[0];
  const groupedAnchor = {
    ...anchorRow,
    _billWiseLinkPreviewGroupId: PREVIEW_GROUP_ID,
    _billWiseLinkPreviewGroupFirst: true,
    _billWiseLinkPreviewGroupLast: false,
    _billWiseLinkPreviewGroupColorIndex: 0,
  };
  const groupedLinked = {
    ...linked,
    _billWiseLinkPreviewGroupId: PREVIEW_GROUP_ID,
    _billWiseLinkPreviewGroupFirst: false,
    _billWiseLinkPreviewGroupLast: true,
    _billWiseLinkPreviewGroupColorIndex: 0,
  };

  const out = [...rest];
  out.splice(anchorIndexInRest, 1, groupedAnchor, groupedLinked);
  return out;
}

export function rowHasBillWiseLinkPreviewGroup(row: any): boolean {
  return typeof row?._billWiseLinkPreviewGroupId === "string" && row._billWiseLinkPreviewGroupId.length > 0;
}

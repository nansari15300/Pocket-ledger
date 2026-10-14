"use client";

import * as React from "react";
import { TableCell } from "@/components/ui/table";
import type { FiscalPartitionClosingSummary } from "@/lib/fiscalPartitionClosingSummary";
import { cn } from "@/lib/utils";
import { FyOpeningPillFormatPill } from "@/components/vouchers/FyOpeningPillFormatPill";
import { useFyPartitionRowColor } from "@/hooks/useFyPartitionRowColor";
import {
  LEDGER_ENTITY_BALANCE_COL_PX,
  LEDGER_TXN_BALANCE_TO_MENU_PAD_CN,
  LEDGER_TXN_DR_CR_AMOUNT_CELL_CN,
  LEDGER_TXN_DR_CR_COL_PX,
  LEDGER_TXN_ROW_MENU_CELL_CN,
} from "@/lib/ledgerHeaderChrome";

const ROW_PY = "py-1"; // 4px top/bottom
/** Mobile FY end + start rows — same vertical rhythm. */
const MOBILE_FY_PARTITION_ROW_CN = "px-2 py-1 leading-snug text-[11px] sm:text-xs";
const AMOUNT_CELL = cn(LEDGER_TXN_DR_CR_AMOUNT_CELL_CN, "font-semibold text-sm", ROW_PY);
/** Ledger txn jaisa: white row + black bottom line */
const LEDGER_CLOSING_ROW = cn(
  "cursor-default bg-background hover:!bg-background",
  "[&>td]:align-middle [&>td]:bg-background"
);

export type FiscalPartitionColumnLayout = {
  /** Cols before Dr — "Total" label spans here (ledger footer jaisa). */
  leadingColSpan: number;
  showDebit: boolean;
  showCredit: boolean;
  showStatus: boolean;
  showBalance: boolean;
  /** Kebab / actions column (usually 1). */
  trailingMenuCol: number;
  /** @deprecated use showStatus + showBalance + trailingMenuCol */
  trailingColSpan?: number;
};

type Props = {
  summary: FiscalPartitionClosingSummary;
  formatAmount: (n: number) => string;
  showDrCr?: boolean;
  /** Band FY — Total row ke right side (End Date + format dropdown). */
  partitionClosingEndLabel?: string;
};

function formatSignedBalance(amount: number, showDrCr: boolean, formatAmount: (n: number) => string): string {
  const abs = Math.abs(amount);
  const core = formatAmount(abs);
  if (!showDrCr) return core;
  return amount >= 0 ? `${core} Dr` : `${core} Cr`;
}

/** Mobile FY merge: "FY … Start Date …" row — same local color as desktop `fiscal-partition-label`. */
export function FiscalPartitionStartLabelBlock({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const { color: rowColor, backgroundColor } = useFyPartitionRowColor("start");

  return (
    <div
      data-row="fiscal-partition-label"
      data-pl-fy-row-color={rowColor === "default" ? undefined : rowColor}
      className={cn(
        "box-border w-full border-b border-black text-left font-semibold normal-case tracking-wide text-foreground",
        MOBILE_FY_PARTITION_ROW_CN,
        !backgroundColor && "bg-background",
        className
      )}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <span>{label}</span>
    </div>
  );
}

/** Mobile only: FY end row — FY label · Balance · closing amount (no Dr/Cr columns). */
export function FiscalPartitionClosingSummaryBlock({
  summary,
  formatAmount,
  showDrCr: _showDrCr = true,
  partitionClosingEndLabel,
}: Props) {
  const { closingBalance } = summary;
  const { color: rowColor, backgroundColor } = useFyPartitionRowColor("end");
  const balanceText = formatSignedBalance(closingBalance, false, formatAmount);
  const cellBase = cn(MOBILE_FY_PARTITION_ROW_CN, "tabular-nums");

  return (
    <div className="w-full text-xs sm:text-sm">
      <div
        data-row="fiscal-partition-total"
        data-pl-fy-row-color={rowColor === "default" ? undefined : rowColor}
        className={cn(
          "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2",
          cellBase
        )}
        style={backgroundColor ? { backgroundColor } : undefined}
      >
        <div className="flex min-w-0 items-center justify-end gap-2 pr-1">
          {partitionClosingEndLabel ? (
            <FyOpeningPillFormatPill
              title="Change FY merge divider label format"
              showLeadingChevron
              className="min-w-0 max-w-full justify-end"
            >
              <span className="truncate text-right text-[11px] font-semibold normal-case tracking-wide text-foreground sm:text-xs">
                {partitionClosingEndLabel}
              </span>
            </FyOpeningPillFormatPill>
          ) : null}
        </div>
        <div className="shrink-0 text-right font-semibold text-foreground">Balance</div>
        <div
          className={cn(
            "shrink-0 text-right font-semibold",
            closingBalance >= 0 ? "text-green-700" : "text-red-700"
          )}
        >
          {balanceText}
        </div>
      </div>
    </div>
  );
}

type TableRowsProps = Props & {
  layout: FiscalPartitionColumnLayout;
  rowClassName?: string;
  onRowClickStop?: (e: React.MouseEvent) => void;
  TableRowComponent: React.ComponentType<React.HTMLAttributes<HTMLTableRowElement>>;
};

/** Desktop ledger: Dr/Cr cells align with table Debit/Credit columns. */
export function FiscalPartitionClosingSummaryTableRows({
  summary,
  formatAmount,
  showDrCr = true,
  layout,
  rowClassName,
  onRowClickStop,
  TableRowComponent,
  partitionClosingEndLabel,
}: TableRowsProps) {
  const { totalDr, totalCr, closingBalance } = summary;
  const { color: rowColor, backgroundColor } = useFyPartitionRowColor("end");
  const balanceText = formatSignedBalance(closingBalance, showDrCr, formatAmount);

  const leading = Math.max(0, layout.leadingColSpan);
  const showStatus =
    layout.showStatus ??
    (typeof layout.trailingColSpan === "number" && layout.trailingColSpan > 1);
  const showBalance =
    layout.showBalance ??
    (typeof layout.trailingColSpan === "number" && layout.trailingColSpan > 0);
  const menuCol = layout.trailingMenuCol ?? 1;

  const stop = onRowClickStop ?? ((e: React.MouseEvent) => e.stopPropagation());
  const rowCn = cn(LEDGER_CLOSING_ROW, rowClassName);

  return (
    <TableRowComponent
      data-row="fiscal-partition-total"
      data-pl-fy-row-color={rowColor === "default" ? undefined : rowColor}
      className={rowCn}
      style={
        backgroundColor
          ? ({ "--pl-fy-partition-row-bg": backgroundColor } as React.CSSProperties)
          : undefined
      }
      onClick={stop}
    >
      {leading > 0 ? (
        <TableCell colSpan={leading} className={cn(ROW_PY, "px-2")}>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {partitionClosingEndLabel ? (
              <FyOpeningPillFormatPill
                title="Change FY merge divider label format"
                showLeadingChevron
                className="min-w-0 max-w-[min(100%,42rem)] justify-end"
              >
                <span className="truncate text-right text-[11px] font-semibold normal-case tracking-wide text-foreground sm:text-xs">
                  {partitionClosingEndLabel}
                </span>
              </FyOpeningPillFormatPill>
            ) : null}
            <span className="shrink-0 font-semibold text-foreground">Total</span>
          </div>
        </TableCell>
      ) : null}
      {layout.showDebit ? (
        <TableCell
          className={cn(AMOUNT_CELL, "text-green-700")}
          style={{ minWidth: LEDGER_TXN_DR_CR_COL_PX }}
        >
          {formatAmount(totalDr)}
        </TableCell>
      ) : null}
      {layout.showCredit ? (
        <TableCell
          className={cn(AMOUNT_CELL, "text-red-700")}
          style={{ minWidth: LEDGER_TXN_DR_CR_COL_PX }}
        >
          {formatAmount(totalCr)}
        </TableCell>
      ) : null}
      {showStatus ? (
        <TableCell className={cn(ROW_PY, "px-[5px] text-center font-semibold")}>-</TableCell>
      ) : null}
      {showBalance ? (
        <TableCell
          className={cn(
            AMOUNT_CELL,
            LEDGER_TXN_BALANCE_TO_MENU_PAD_CN,
            "tabular-nums",
            closingBalance >= 0 ? "text-green-700" : "text-red-700"
          )}
          style={{ minWidth: LEDGER_ENTITY_BALANCE_COL_PX }}
        >
          {balanceText}
        </TableCell>
      ) : null}
      {menuCol > 0 ? <TableCell className={LEDGER_TXN_ROW_MENU_CELL_CN} /> : null}
    </TableRowComponent>
  );
}

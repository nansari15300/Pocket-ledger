"use client";

import * as React from "react";
import { TableCell } from "@/components/ui/table";
import type { FiscalPartitionClosingSummary } from "@/lib/fiscalPartitionClosingSummary";
import { cn } from "@/lib/utils";
import { FyOpeningPillFormatPill } from "@/components/vouchers/FyOpeningPillFormatPill";

const ROW_PY = "py-1"; // 4px top/bottom
const AMOUNT_CELL = cn("text-right font-semibold tabular-nums text-sm", ROW_PY, "px-[5px]");
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

/** Mobile / narrow: ek row — Total · Dr · Cr · Balance. */
export function FiscalPartitionClosingSummaryBlock({
  summary,
  formatAmount,
  showDrCr = true,
  partitionClosingEndLabel,
}: Props) {
  const { totalDr, totalCr, closingBalance } = summary;
  const balanceText = formatSignedBalance(closingBalance, showDrCr, formatAmount);
  const cellBase = `${ROW_PY} px-2 tabular-nums leading-snug`;

  return (
    <div className="w-full text-xs sm:text-sm">
      <div
        className={cn(
          "grid w-full grid-cols-[1fr_minmax(3rem,auto)_1fr_1fr_1fr] items-center gap-x-2",
          cellBase
        )}
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
      <div className="text-right font-semibold text-foreground">Total</div>
      <div className="text-right font-semibold text-green-700">{formatAmount(totalDr)}</div>
      <div className="text-right font-semibold text-red-700">{formatAmount(totalCr)}</div>
      <div
        className={cn(
          "text-right font-semibold",
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
    <TableRowComponent data-row="fiscal-partition-total" className={rowCn} onClick={stop}>
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
        <TableCell className={cn(AMOUNT_CELL, "text-green-700")}>{formatAmount(totalDr)}</TableCell>
      ) : null}
      {layout.showCredit ? (
        <TableCell className={cn(AMOUNT_CELL, "text-red-700")}>{formatAmount(totalCr)}</TableCell>
      ) : null}
      {showStatus ? (
        <TableCell className={cn(ROW_PY, "px-[5px] text-center font-semibold")}>-</TableCell>
      ) : null}
      {showBalance ? (
        <TableCell
          className={cn(
            AMOUNT_CELL,
            closingBalance >= 0 ? "text-green-700" : "text-red-700"
          )}
        >
          {balanceText}
        </TableCell>
      ) : null}
      {menuCol > 0 ? <TableCell className="w-10 p-0" /> : null}
    </TableRowComponent>
  );
}

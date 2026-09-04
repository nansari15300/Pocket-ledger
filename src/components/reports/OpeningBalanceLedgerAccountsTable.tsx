"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { txnSelectedMainRowCn } from "@/lib/listSelectionChrome";
import {
  type OpeningBalanceLedgerAccountRow,
  type OpeningBalanceLedgerBreakdown,
  type OpeningBalanceLedgerEntityType,
  openingBalanceLedgerAccountRowKey,
} from "@/lib/reports/openingBalanceLedgerAccounts";
import { sidebarEntityMenuLabel } from "@/lib/sidebarEntityMenuLabels";

type Props = {
  breakdown: OpeningBalanceLedgerBreakdown;
  formatCurrency: (
    amount: number,
    options?: { showDrCr?: boolean; noSuffix?: boolean }
  ) => string;
  className?: string;
  /** Master edit open — neeche table click-through band. */
  interactionLocked?: boolean;
  /** Double-click / Enter — open master edit (party, bank, staff, etc.). */
  onRowActivate?: (row: OpeningBalanceLedgerAccountRow) => void;
};

function entityLabel(entityType: OpeningBalanceLedgerEntityType): string {
  switch (entityType) {
    case "party":
      return sidebarEntityMenuLabel("party");
    case "account":
      return sidebarEntityMenuLabel("bankCash");
    case "staff":
      return sidebarEntityMenuLabel("staff");
    case "tax":
      return sidebarEntityMenuLabel("tax");
    case "expense":
      return "Income/Expense";
    default:
      return entityType;
  }
}

function formatOpeningBalanceDateCell(
  date: Date | null,
  dateSystem: ReturnType<typeof useDate>["dateSystem"],
  formatDate: (d: Date) => string,
  formatDateBS: (d: Date) => string
): string {
  if (!date) return "—";
  if (dateSystem === "BS") return formatDateBS(date);
  if (dateSystem === "Both") return `${formatDate(date)} / ${formatDateBS(date)}`;
  return formatDate(date);
}

/** Current master opening balances — snapshot only (no historical date/running rows). */
export function OpeningBalanceLedgerAccountsTable({
  breakdown,
  formatCurrency,
  className,
  interactionLocked = false,
  onRowActivate,
}: Props) {
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const { masterRows, masterTotals } = breakdown;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Keep the selected row only while the user is interacting with that row.
  // Any other click inside the ledger popup clears the visual selection.
  useEffect(() => {
    if (!selectedKey) return;
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-opening-balance-row]")) {
        return;
      }
      setSelectedKey(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [selectedKey]);

  const formatDateCell = (date: Date | null) =>
    formatOpeningBalanceDateCell(date, dateSystem, formatDate, formatDateBS);
  const dateColumnLabel =
    dateSystem === "BS" ? "Date (BS)" : dateSystem === "Both" ? "Date (AD / BS)" : "Date";

  const activateRow = useCallback(
    (row: OpeningBalanceLedgerAccountRow) => {
      if (row.isSystemOpeningBalanceLedger) return;
      onRowActivate?.(row);
    },
    [onRowActivate]
  );

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (masterRows.length === 0) return;
      const idx = selectedKey
        ? masterRows.findIndex((r) => openingBalanceLedgerAccountRowKey(r) === selectedKey)
        : -1;
      const currentIndex = idx >= 0 ? idx : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, masterRows.length - 1);
        const row = masterRows[next];
        if (row) setSelectedKey(openingBalanceLedgerAccountRowKey(row));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        const row = masterRows[prev];
        if (row) setSelectedKey(openingBalanceLedgerAccountRowKey(row));
      } else if (e.key === "Enter" && selectedKey) {
        e.preventDefault();
        const row = masterRows.find(
          (r) => openingBalanceLedgerAccountRowKey(r) === selectedKey
        );
        if (row) activateRow(row);
      }
    },
    [masterRows, selectedKey, activateRow]
  );

  return (
    <div className={cn("min-w-0 w-full", className, interactionLocked && "pointer-events-none")}>
      <div
        ref={tableContainerRef}
        tabIndex={0}
        role="grid"
        aria-label="Opening balance accounts"
        data-theme-table="transactions"
        className="w-full min-w-full overflow-x-auto scrollbar-slim-dim outline-none focus:outline-none"
        onKeyDown={handleTableKeyDown}
        onClick={() => tableContainerRef.current?.focus()}
      >
        <Table className="w-full min-w-[600px] border-separate border-spacing-0 [&_tr]:border-b [&_tr]:border-border">
          <TableHeader>
            <TableRow className="border-b-2 border-black hover:bg-transparent [&>th]:border-b-2 [&>th]:border-black">
              <TableHead className="font-semibold whitespace-nowrap">{dateColumnLabel}</TableHead>
              <TableHead className="font-semibold whitespace-nowrap">Account Name</TableHead>
              <TableHead className="font-semibold whitespace-nowrap">Entity</TableHead>
              <TableHead className="text-right font-semibold whitespace-nowrap">Debit</TableHead>
              <TableHead className="text-right font-semibold whitespace-nowrap">Credit</TableHead>
              <TableHead className="text-right font-semibold whitespace-nowrap">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {masterRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No accounts with opening balances found.
                </TableCell>
              </TableRow>
            ) : (
              masterRows.map((acc, index) => {
                const key = openingBalanceLedgerAccountRowKey(acc);
                const isSelected = selectedKey === key;
                const isHovered = hoveredKey === key;
                return (
                  <TableRow
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    onDoubleClick={() => activateRow(acc)}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    data-opening-balance-row={key}
                    data-txn-stripe={String(index % 2)}
                    data-pl-txn-hovered={isHovered ? "" : undefined}
                    data-pl-txn-selected={isSelected ? "" : undefined}
                    className={cn(
                      "transaction-main-row min-h-[28px] cursor-pointer border-b border-black",
                      isSelected && txnSelectedMainRowCn(false)
                    )}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDateCell(acc.openingBalanceDate)}
                    </TableCell>
                    <TableCell className="font-medium max-w-[260px] truncate" title={acc.accountName}>
                      {acc.accountName}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {entityLabel(acc.entityType)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-green-700 font-medium">
                      {acc.debit > 0 ? formatCurrency(acc.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-700 font-medium">
                      {acc.credit > 0 ? formatCurrency(acc.credit) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        acc.runningBalance >= 0 ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {formatCurrency(acc.runningBalance, { showDrCr: true })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {masterRows.length > 0 && (
            <TableFooter>
              <TableRow className="border-t-2 border-black font-bold">
                <TableCell colSpan={3}>
                  Total (party, bank, staff, tax, income/expense)
                </TableCell>
                <TableCell className="text-right tabular-nums text-green-700">
                  {formatCurrency(masterTotals.totalDebit)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-red-700">
                  {formatCurrency(masterTotals.totalCredit)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    masterTotals.netSigned >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {formatCurrency(masterTotals.netSigned, { showDrCr: true })}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

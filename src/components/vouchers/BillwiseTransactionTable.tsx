"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { cn } from "@/lib/utils";
import type { StockView, Item } from "@/components/items/types";
import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Filter, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { VoucherTypeFilter } from "@/components/vouchers/VoucherTypeFilter";
import {
  TransactionRow,
  getConversionFactor,
  formatQuantity,
  type Transaction,
  type Context,
} from "./transactionTableShared";
import { Badge } from "@/components/ui/badge";

export type BillwiseTransactionTableProps = {
  transactions: Transaction[];
  context: Context;
  contextId?: string;
  openingBalance?: number;
  /** Bill-wise: outstanding for OB row (OB amount - linked). When set, OB row Net Balance and status use this. */
  openingBalanceOutstanding?: number;
  /** Bill-wise: voucher numbers that have allocated to OB (for status detail "to PYMT-9"). */
  openingBalanceLinkedVoucherNos?: string[];
  showNarration?: boolean;
  stockView?: StockView;
  item?: Item;
  displayUnit?: string;
  setDisplayUnit?: (unit: string) => void;
  journalAccountNames?: Record<string, string>;
  userNames?: Record<string, string>;
  filters?: Record<string, string>;
  setFilters?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeFilter?: string | null;
  setActiveFilter?: React.Dispatch<React.SetStateAction<string | null>>;
  onRowClick?: (transaction: any) => void;
  onDeleteVoucher?: (transaction: any) => void;
  onHistoryVoucher?: (transaction: any) => void;
  onAddLink?: (transaction: any) => void;
  onApproveVoucher?: (transaction: any) => void;
  periodDr?: number;
  periodCr?: number;
  closingBalance?: number;
  isTaxContext?: boolean;
  hideDebitColumn?: boolean;
  hideCreditColumn?: boolean;
  hideBalanceColumn?: boolean;
  hideFooter?: boolean;
  getDisplayValue?: (value: number) => string;
  voucherTypes?: string[];
  onVoucherTypeChange?: (types: string[]) => void;
  isBalanceMasked?: boolean;
  visibleColumns?: Record<string, boolean>;
  openingBalanceActions?: React.ReactNode;
  scrollOnlyTransactions?: boolean;
  statusFilter?: { paid: boolean; unpaid: boolean; partial: boolean; overdue: boolean };
  statusFilterAllChecked?: boolean;
  onStatusFilterAll?: () => void;
  onStatusFilterChange?: (key: "paid" | "unpaid" | "partial" | "overdue", checked: boolean) => void;
  statusFilterIdPrefix?: string;
};

export function BillwiseTransactionTable({
  transactions,
  context,
  openingBalance = 0,
  openingBalanceOutstanding,
  openingBalanceLinkedVoucherNos = [],
  showNarration = false,
  stockView = "amount",
  item,
  displayUnit,
  journalAccountNames,
  userNames,
  filters,
  setFilters,
  activeFilter,
  setActiveFilter,
  onRowClick,
  periodDr = 0,
  periodCr = 0,
  closingBalance = 0,
  isTaxContext,
  hideDebitColumn,
  hideCreditColumn,
  hideBalanceColumn,
  hideFooter,
  getDisplayValue: getDisplayValueProp,
  voucherTypes,
  onVoucherTypeChange,
  isBalanceMasked,
  openingBalanceActions,
  statusFilter,
  statusFilterAllChecked,
  onStatusFilterAll,
  onStatusFilterChange,
  statusFilterIdPrefix = "status",
  visibleColumns,
  onDeleteVoucher,
  onHistoryVoucher,
  onAddLink,
  onApproveVoucher,
}: BillwiseTransactionTableProps) {
  const showCol = (key: string) => visibleColumns == null || visibleColumns[key] !== false;
  const { formatDate, formatDateBS, formatCurrency, dateSystem } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId && !transactions.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [transactions, selectedId]);

  const conversionFactor = useMemo(() => {
    if (context === "item" && stockView === "qty" && item) {
      return getConversionFactor(item, displayUnit);
    }
    return 1;
  }, [context, stockView, item, displayUnit]);

  const getDisplayValue = useCallback(
    (val: number) => {
      if (getDisplayValueProp) return getDisplayValueProp(val);
      const abs = Math.abs(val);
      return formatCurrency(abs, { noSuffix: true, context: "transaction" });
    },
    [getDisplayValueProp, formatCurrency]
  );

  const safeOpeningBalance = openingBalance ?? 0;
  const displayOpeningBalance = safeOpeningBalance / conversionFactor;
  const displayOpeningBalanceDr = displayOpeningBalance > 0 ? displayOpeningBalance : 0;
  const displayOpeningBalanceCr = displayOpeningBalance < 0 ? Math.abs(displayOpeningBalance) : 0;
  const obAmount = Math.abs(safeOpeningBalance) / conversionFactor;
  const obOutstandingDisplay = openingBalanceOutstanding != null ? openingBalanceOutstanding / conversionFactor : null;
  const obStatusLabel = obOutstandingDisplay != null
    ? (obOutstandingDisplay <= 0 ? "Paid" : obOutstandingDisplay >= obAmount ? "Unpaid" : "Partial")
    : null;
  const obStatusDetail = openingBalanceLinkedVoucherNos?.length
    ? (openingBalanceLinkedVoucherNos.length > 1 ? "Multi link" : `to ${openingBalanceLinkedVoucherNos[0]}`)
    : "";
  const displayPeriodDr = periodDr / conversionFactor;
  const displayPeriodCr = periodCr / conversionFactor;
  const displayClosingBalance = closingBalance / conversionFactor;
  
  // Total includes opening balance: Dr opening balance adds to Debit total, Cr opening balance adds to Credit total
  const displayTotalDr = (displayPeriodDr || 0) + displayOpeningBalanceDr;
  const displayTotalCr = (displayPeriodCr || 0) + displayOpeningBalanceCr;

  const formatFooterBalance = (value: number) => {
    if (isBalanceMasked) return "*****";
    const isItemQty = context === "item" && stockView === "qty";
    if (isItemQty) return `${formatQuantity(value)} ${displayUnit || ""}`;
    const absValue = Math.abs(value);
    const suffix = value >= 0 ? "Dr" : "Cr";
    return (
      <span className={cn("font-bold", value >= 0 ? "text-green-700" : "text-red-700")}>
        {formatCurrency(absValue, { noSuffix: true, context: "transaction" })} {suffix}
      </span>
    );
  };

  const formatFooterAmount = (val: number) => {
    if (context === "item" && stockView === "qty") {
      return `${formatQuantity(val)} ${displayUnit || ""}`;
    }
    return getDisplayValue(val);
  };

  const ensureMinGaps = true;

  const dateCols = dateSystem === "Both" ? 2 : 1;
  const visibleLabelCols =
    (showCol("date") ? dateCols : 0) +
    (showCol("type") ? 1 : 0) +
    (showCol("voucherNo") ? 1 : 0) +
    (context === "daybook" ? 1 : 0) +
    (showCol("user") && context !== "note" ? 1 : 0);
  const openingBalanceColSpan = visibleLabelCols;
  const totalColSpan = visibleLabelCols;
  const showOpeningBalance = ["party", "account", "staff", "tax", "item", "expense", "group"].includes(context);

  const renderHeaderWithFilter = (key: string, label: string, isNumeric: boolean = false, minWidthPx?: number) => {
    const isFiltered = !!(filters && filters[key]) || (key === "type" && voucherTypes && voucherTypes.length > 0 && !voucherTypes.includes("all"));
    const innerPadding = ensureMinGaps ? "px-[10px]" : "px-2";
    return (
      <TableHead key={key} className={cn("p-0", isNumeric && "text-right")} style={ensureMinGaps && minWidthPx != null ? { minWidth: `${minWidthPx}px` } : undefined}>
        <div
          className={cn(
            "flex items-center gap-1 font-bold py-3 text-black whitespace-nowrap",
            innerPadding,
            isFiltered ? "text-red-600" : "text-black",
            isNumeric ? "justify-end" : "justify-start"
          )}
        >
          <div className="flex items-center">
            <span>{label}</span>
            {(setFilters || (key === "type" && onVoucherTypeChange)) && (
              <Popover
                open={activeFilter === key}
                onOpenChange={(open) => setActiveFilter && setActiveFilter(open ? key : null)}
              >
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn("h-6 w-6", isNumeric ? "ml-1" : "ml-0")}>
                    <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-1 w-48"
                  onOpenAutoFocus={(e: Event) => e.preventDefault()}
                  onCloseAutoFocus={(e: Event) => e.preventDefault()}
                >
                  {key === "type" && onVoucherTypeChange ? (
                    <VoucherTypeFilter
                      selectedTypes={voucherTypes || ["all"]}
                      onSelectionChange={onVoucherTypeChange}
                    />
                  ) : setFilters ? (
                    <Input
                      placeholder={`Filter ${label}...`}
                      value={filters ? filters[key] || "" : ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const newValue = e.target.value;
                        setFilters((prev: Record<string, string>) => ({ ...prev, [key]: newValue }));
                      }}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter" && setActiveFilter) setActiveFilter(null);
                      }}
                      autoFocus
                    />
                  ) : null}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </TableHead>
    );
  };

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (transactions.length === 0) return;
      const idx = transactions.findIndex((t) => t.id === selectedId);
      const currentIndex = idx >= 0 ? idx : -1;
      if (e.key === "ArrowDown" && currentIndex < transactions.length - 1) {
        e.preventDefault();
        setSelectedId(transactions[currentIndex + 1].id);
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        setSelectedId(transactions[currentIndex - 1].id);
      } else if (e.key === "Enter" && currentIndex >= 0) {
        e.preventDefault();
        onRowClick?.(transactions[currentIndex]);
      }
    },
    [transactions, selectedId, onRowClick]
  );

  return (
    <div
      ref={tableContainerRef}
      tabIndex={0}
      role="grid"
      aria-label="Transactions"
      className="w-full min-w-0 overflow-x-auto scrollbar-slim-dim outline-none focus:outline-none"
      onKeyDown={handleTableKeyDown}
      onClick={() => tableContainerRef.current?.focus()}
    >
      <Table className={ensureMinGaps ? "table-auto w-full" : "table-fixed w-full min-w-[750px]"} scrollContainer={false}>
        <TableHeader>
          <TableRow className="border-b-4 border-black hover:bg-transparent">
            {showCol("date") &&
              (dateSystem === "Both" ? (
                <>
                  {renderHeaderWithFilter("date_bs", "Date (BS)", false, ensureMinGaps ? 95 : undefined)}
                  {renderHeaderWithFilter("date_ad", "Date (AD)", false, ensureMinGaps ? 95 : undefined)}
                </>
              ) : (
                renderHeaderWithFilter("date", "Date", false, ensureMinGaps ? 95 : undefined)
              ))}
            {showCol("type") && renderHeaderWithFilter("type", "Type", false, ensureMinGaps ? 75 : undefined)}
            {showCol("voucherNo") && renderHeaderWithFilter("voucherNumber", "Voucher No.", false, ensureMinGaps ? 105 : undefined)}
            {context === "daybook" && renderHeaderWithFilter("accounts", "Accounts", false, ensureMinGaps ? 120 : undefined)}
            {showCol("user") && context !== "note" && renderHeaderWithFilter("user", "User", false, ensureMinGaps ? 85 : undefined)}
            {showCol("dr") && !hideDebitColumn && renderHeaderWithFilter("debit", stockView === "amount" ? "Debit" : "In", true, ensureMinGaps ? 100 : undefined)}
            {showCol("cr") && !hideCreditColumn && renderHeaderWithFilter("credit", stockView === "amount" ? "Credit" : "Out", true, ensureMinGaps ? 100 : undefined)}
            {showCol("status") && (
              <TableHead className="p-0" style={ensureMinGaps ? { minWidth: "95px" } : undefined}>
                <div className={cn("flex items-center gap-1 font-bold py-3 text-black whitespace-nowrap justify-center", ensureMinGaps ? "px-[10px]" : "px-2")}>
                  <span>Status</span>
                  {statusFilter != null && onStatusFilterAll != null && onStatusFilterChange != null ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("h-6 w-6 ml-1", statusFilterAllChecked === false && "text-red-600")}
                        >
                          <Filter className={cn("h-4 w-4", statusFilterAllChecked === false && "text-red-600")} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-52 p-2">
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2 cursor-pointer font-medium border-b pb-2 mb-1">
                          <Checkbox id={`${statusFilterIdPrefix}-all`} checked={!!statusFilterAllChecked} onCheckedChange={() => onStatusFilterAll()} />
                          <label htmlFor={`${statusFilterIdPrefix}-all`} className="text-sm font-medium cursor-pointer flex-1">All</label>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox id={`${statusFilterIdPrefix}-paid`} checked={statusFilter.paid} onCheckedChange={(c) => onStatusFilterChange("paid", Boolean(c))} />
                          <label htmlFor={`${statusFilterIdPrefix}-paid`} className="text-sm font-medium cursor-pointer flex-1">Paid</label>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox id={`${statusFilterIdPrefix}-unpaid`} checked={statusFilter.unpaid} onCheckedChange={(c) => onStatusFilterChange("unpaid", Boolean(c))} />
                          <label htmlFor={`${statusFilterIdPrefix}-unpaid`} className="text-sm font-medium cursor-pointer flex-1">Unpaid</label>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox id={`${statusFilterIdPrefix}-partial`} checked={statusFilter.partial} onCheckedChange={(c) => onStatusFilterChange("partial", Boolean(c))} />
                          <label htmlFor={`${statusFilterIdPrefix}-partial`} className="text-sm font-medium cursor-pointer flex-1">Partial</label>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox id={`${statusFilterIdPrefix}-overdue`} checked={statusFilter.overdue} onCheckedChange={(c) => onStatusFilterChange("overdue", Boolean(c))} />
                          <label htmlFor={`${statusFilterIdPrefix}-overdue`} className="text-sm font-medium cursor-pointer flex-1">Overdue</label>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="w-6 ml-1" />
                  )}
                </div>
              </TableHead>
            )}
            {showCol("runningBalance") && !hideBalanceColumn && renderHeaderWithFilter("balance", stockView === "amount" ? "Net Balance" : "Stock", true, ensureMinGaps ? 115 : undefined)}
            <TableHead className="w-10 p-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence mode="popLayout">
            {showOpeningBalance && (
              <motion.tr
                key="opening-balance-row"
                layout
<<<<<<< HEAD
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
=======
                initial={false}
                exit={{ transition: { duration: 0 } }}
>>>>>>> 6a1ec26 (Animation Fixed)
                transition={
                  isRowAnimationEnabled
                    ? { duration: rowAnimationDuration, ease: "easeInOut" }
                    : { duration: 0 }
                }
              >
                <TableCell colSpan={openingBalanceColSpan} className="font-semibold">
                  Opening Balance
                </TableCell>
                {showCol("dr") && !hideDebitColumn && (
                  <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {displayOpeningBalanceDr > 0 ? formatFooterAmount(displayOpeningBalanceDr) : "-"}
                  </TableCell>
                )}
                {showCol("cr") && !hideCreditColumn && (
                  <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {displayOpeningBalanceCr > 0 ? formatFooterAmount(displayOpeningBalanceCr) : "-"}
                  </TableCell>
                )}
                {showCol("status") && (
                  <TableCell className={cn("text-center align-baseline", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                    {obStatusLabel != null ? (
                      <div className="flex flex-col items-center gap-[1px] leading-tight">
                        <Badge
                          variant="outline"
                          className={cn(
                            "inline-flex h-[22px] font-semibold shrink-0",
                            obStatusLabel === "Paid" ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                          )}
                        >
                          {obStatusLabel}
                        </Badge>
                        {obStatusDetail && <span className="text-[10px] text-muted-foreground">{obStatusDetail}</span>}
                      </div>
                    ) : (
                      <span className="font-semibold">-</span>
                    )}
                  </TableCell>
                )}
                {showCol("runningBalance") && !hideBalanceColumn && (
                  <TableCell className={cn("text-right font-semibold", (obOutstandingDisplay != null ? (safeOpeningBalance >= 0 ? obOutstandingDisplay : -obOutstandingDisplay) : displayOpeningBalance) >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                    {obOutstandingDisplay != null
                      ? formatFooterBalance(safeOpeningBalance >= 0 ? obOutstandingDisplay : -obOutstandingDisplay)
                      : formatFooterBalance(displayOpeningBalance)}
                  </TableCell>
                )}
                <TableCell className="w-10 p-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                  {openingBalanceActions != null ? (
                    openingBalanceActions
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40" />
                    </DropdownMenu>
                  )}
                </TableCell>
              </motion.tr>
            )}
            {transactions.length > 0 ? (
<<<<<<< HEAD
              transactions.map((t: any) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
=======
              transactions.map((t: any, rowIndex: number) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  animateLayout={true}
>>>>>>> 6a1ec26 (Animation Fixed)
                  showNarration={showNarration}
                  userNames={userNames}
                  journalAccountNames={journalAccountNames}
                  context={context}
                  stockView={stockView}
                  displayUnit={displayUnit}
                  item={item}
                  onRowClick={onRowClick}
                  onAddLink={onAddLink}
                  onDeleteVoucher={onDeleteVoucher}
                  onHistoryVoucher={onHistoryVoucher}
                  onApproveVoucher={onApproveVoucher}
                  onRowSelect={(tx: { id: string }) => setSelectedId(tx.id)}
                  isSelected={selectedId === t.id}
                  getDisplayValue={getDisplayValue}
                  isTaxContext={isTaxContext}
                  isBalanceMasked={isBalanceMasked}
                  hideBalanceColumn={hideBalanceColumn}
                  visibleColumns={visibleColumns}
                  useOutstandingForBalance={true}
                  isBillWise={true}
                  ensureMinGaps={ensureMinGaps}
                />
              ))
            ) : (
              <tr key="no-records-row">
                <TableCell
                  colSpan={(dateSystem === "Both" ? 5 : 4) + (context === "daybook" ? 1 : 0) + (context === "note" ? -1 : 0) + 2}
                  className="text-center text-gray-500 py-2"
                >
                  No matching records found
                </TableCell>
              </tr>
            )}
          </AnimatePresence>
        </TableBody>
        {!hideFooter && (
          <TableFooter className="bg-white shadow-inner border-t">
            <TableRow>
              <TableCell colSpan={totalColSpan} className="text-right font-semibold">
                Total
              </TableCell>
              {showCol("dr") && !hideDebitColumn && (
                <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>{formatFooterAmount(displayTotalDr)}</TableCell>
              )}
              {showCol("cr") && !hideCreditColumn && (
                <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>{formatFooterAmount(displayTotalCr)}</TableCell>
              )}
              {showCol("status") && <TableCell className={cn("text-center font-semibold", ensureMinGaps && "min-w-[95px] px-[5px]")}>-</TableCell>}
              {showCol("runningBalance") && !hideBalanceColumn && <TableCell className={cn("text-right font-semibold", ensureMinGaps && "min-w-[115px] px-[5px]")}>-</TableCell>}
              <TableCell className="w-10 p-0" />
            </TableRow>
            <TableRow className="border-t-2 border-black font-bold text-base bg-muted/30">
              <TableCell
                colSpan={totalColSpan + (showCol("dr") && !hideDebitColumn ? 1 : 0) + (showCol("cr") && !hideCreditColumn ? 1 : 0) + (showCol("status") ? 1 : 0)}
                className="text-right"
              >
                Closing Balance
              </TableCell>
              {showCol("runningBalance") && !hideBalanceColumn && (
                <TableCell className={cn("text-right font-bold", closingBalance >= 0 ? "text-green-700" : "text-red-700", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                  {formatFooterBalance(displayClosingBalance)}
                </TableCell>
              )}
              <TableCell className="w-10 p-0" />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

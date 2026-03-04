
"use client";

import React, { useMemo, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, Search, Loader2, ChevronDown, ChevronRight, Users, ChevronUp, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useVouchers } from "@/hooks/useVouchers";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { openPrintDirect } from "@/lib/printDirect";
import { cn } from "@/lib/utils";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import AdCalendar from "@/components/ui/ad-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";

import BsDatePicker from "@/components/ui/BsDatePicker";
import { startOfDay, endOfDay } from "date-fns";
import { useTransactions } from "@/hooks/use-transactions";

/**
 * TYPES
 */
type ProfitLossRow = {
  id: string;
  name: string;
  category: "Income" | "Expense";
  amount: number;
  isGroup: boolean;
  parentId?: string;
  subRows: ProfitLossRow[];
  level?: number;
  parentGroupName?: string;
  subGroupName?: string;
  accountId?: string;
  transactions?: any[];
};

/**
 * HELPERS
 */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toNepaliCurrency = (n: number) =>
  n === 0
    ? "-"
    : new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

/**
 * GROUP ROW COMPONENT
 */
function GroupRow({
  row,
  level = 0,
  expandedGroups,
  toggleGroup,
  onRowClick,
  parentGroupName,
  subGroupName,
}: {
  row: ProfitLossRow;
  level?: number;
  expandedGroups: Set<string>;
  toggleGroup: (id: string) => void;
  onRowClick: (row: ProfitLossRow) => void;
  parentGroupName?: string;
  subGroupName?: string;
}) {
  const isExpanded = expandedGroups.has(row.id);
  const hasSubRows = row.subRows.length > 0;
  const showAccountColumn = expandedGroups.size > 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasSubRows) {
      toggleGroup(row.id);
    }
  };

  const handleRowClick = () => {
    if (row.isGroup && hasSubRows) {
      toggleGroup(row.id);
    } else {
      onRowClick(row);
    }
  };

  return (
    <>
      <TableRow
        className={`cursor-pointer hover:bg-muted/60 ${level > 0 ? 'bg-muted/30' : ''}`}
        onClick={handleRowClick}
      >
        {showAccountColumn ? (
          <>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {row.isGroup && hasSubRows && (
                  <button
                    onClick={handleToggle}
                    className="p-0.5 hover:bg-muted rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
                {row.isGroup && !hasSubRows && <div className="w-5" />}
                {!row.isGroup && <div className="w-5" />}
                {row.isGroup ? (
                  <Users className="h-4 w-4 text-muted-foreground" />
                ) : null}
                <span>{row.isGroup ? row.name : ''}</span>
              </div>
            </TableCell>
            <TableCell className="font-medium">
              {!row.isGroup ? row.name : '-'}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isGroup && isExpanded ? '-' : (row.category === 'Income' ? toNepaliCurrency(row.amount) : '-')}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isGroup && isExpanded ? '-' : (row.category === 'Expense' ? toNepaliCurrency(row.amount) : '-')}
            </TableCell>
          </>
        ) : (
          <>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 20}px` }}>
                {row.isGroup && hasSubRows && (
                  <button
                    onClick={handleToggle}
                    className="p-0.5 hover:bg-muted rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
                {row.isGroup && !hasSubRows && <div className="w-5" />}
                {!row.isGroup && <div className="w-5" />}
                {row.isGroup ? (
                  <Users className="h-4 w-4 text-muted-foreground" />
                ) : null}
                <span>{row.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isGroup && isExpanded ? '-' : (row.category === 'Income' ? toNepaliCurrency(row.amount) : '-')}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.isGroup && isExpanded ? '-' : (row.category === 'Expense' ? toNepaliCurrency(row.amount) : '-')}
            </TableCell>
          </>
        )}
      </TableRow>
      {row.isGroup && isExpanded && hasSubRows && (
        <>
          {row.subRows.map((subRow) => (
            <GroupRow
              key={subRow.id}
              row={subRow}
              level={level + 1}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              onRowClick={onRowClick}
              parentGroupName={parentGroupName}
              subGroupName={subGroupName}
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * MAIN PROFIT & LOSS PAGE COMPONENT
 */
export function ProfitAndLossPage() {
  const isMobile = useIsMobile();
                    <AdCalendar
                      valueAD={dateRange}
                      isRange
                      numberOfMonths={calendarMonths}
                      onSelect={(adDate) => {
                        const range = dateRange;
                        if (!range?.from || (range.from && range.to)) {
                          setDateRange({ from: startOfDay(adDate), to: undefined });
                        } else if (adDate < range.from) {
                          setDateRange({ from: startOfDay(adDate), to: endOfDay(range.from) });
                          setIsCalendarOpen(false);
                          if (activeRow) openDetail(activeRow);
                        } else {
                          setDateRange({ from: range.from, to: endOfDay(adDate) });
                          setIsCalendarOpen(false);
                          if (activeRow) openDetail(activeRow);
                        }
                      }}

                    />
                  </PopoverContent>
                </Popover>
              )}
              {dateRange && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateRange(undefined);
                    if (activeRow) {
                      openDetail(activeRow);
                    }
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Per page:</span>
              <Select
                value={`${rowsPerPage}`}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[80px] h-8">
                  <SelectValue placeholder={`${rowsPerPage}`} />
                </SelectTrigger>
                <SelectContent>
                  {[20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto px-1">
            {activeRow && (() => {
              const totalPages = rowsPerPage > 0 ? Math.ceil((processedTransactions?.length || 0) / rowsPerPage) : 1;
              const paginatedTransactions = rowsPerPage > 0
                ? (processedTransactions || []).slice(
                    (currentPage - 1) * rowsPerPage,
                    currentPage * rowsPerPage
                  )
                : (processedTransactions || []);
              
              return (
                <>
                  <div className="min-w-0 w-max">
                    <TransactionsTable 
                      context="expense"
                      contextId={activeRow.accountId}
                      transactions={paginatedTransactions}
                      userNames={userNames}
                      openingBalance={openingBalanceForAccount}
                      periodDr={periodDr}
                      periodCr={periodCr}
                      closingBalance={calculatedClosingBalance}
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 flex-shrink-0">
                    <div className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, processedTransactions?.length || 0)} of {processedTransactions?.length || 0} transactions
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm font-medium">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
            {activeRow && (!processedTransactions || processedTransactions.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found for this account{dateRange ? ' in the selected date range' : ''}.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handlePrintDetail} className="gap-2" disabled={!activeRow}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={closeDrawer}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

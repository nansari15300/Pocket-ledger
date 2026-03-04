
"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Search, Loader2, ChevronDown, ChevronRight, ChevronUp, Printer, Calendar as CalendarIcon, XCircle } from "lucide-react";
import { PrintOptionsDialog } from "@/components/ui/PrintOptionsDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdCalendar from "@/components/ui/ad-calendar";

import { useVouchers } from "@/hooks/useVouchers";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { useTransactions } from "@/hooks/use-transactions";
import { openPrintDirect } from "@/lib/printDirect";
import type { DateRange } from "@/components/ui/ad-calendar";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { cn } from "@/lib/utils";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";


/**
 * TYPES
 */
type TrialBalanceRow = {
  id: string;
  name: string;
  isGroup: boolean;
  balance: number;
  debit: number;
  credit: number;
  subRows: TrialBalanceRow[];
  transactions?: any[];
  openingBalance?: number;
  parentId?: string | null;
  parentGroupName?: string; // Parent group name (level 0)
  subGroupName?: string; // Sub group name (level 1)
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
 * RECURSIVE ROW COMPONENT
 */
const GroupRow = ({ group, level, onAccountClick, expandedGroups, toggleGroup, parentGroupName, subGroupName, hasAnyExpanded }: {
    group: TrialBalanceRow,
    level: number,
    onAccountClick: (account: TrialBalanceRow) => void,
    expandedGroups: Set<string>,
    toggleGroup: (groupId: string) => void,
    parentGroupName?: string,
    subGroupName?: string,
    hasAnyExpanded: boolean,
}) => {
    const isExpanded = expandedGroups.has(group.id);
    const balanceStyle = isExpanded ? "text-muted-foreground/80 font-normal" : "font-semibold";
    
    // Determine parent and sub group names based on level
    // Level 0 = Parent Group (e.g., Assets, Liabilities)
    // Level 1 = Sub Group (e.g., Bank Accounts, Cash-in-Hand)
    // Level 2+ = Account
    const currentParentGroup = level === 0 ? group.name : parentGroupName;
    const currentSubGroup = level === 1 ? group.name : subGroupName;

    return (
        <>
            <TableRow 
                className={cn(
                    "font-semibold hover:bg-muted/50 cursor-pointer",
                    isExpanded ? "bg-muted/20 text-muted-foreground/80" : "bg-muted/40"
                )} 
                onClick={() => toggleGroup(group.id)}
            >
                {hasAnyExpanded ? (
                    <>
                        <TableCell className="py-3">{level === 0 ? group.name : (parentGroupName || '')}</TableCell>
                        <TableCell className="py-3">{level === 1 ? group.name : (subGroupName || '')}</TableCell>
                        <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                                {group.subRows.length > 0 && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                                {level > 1 ? group.name : ''}
                            </div>
                        </TableCell>
                    </>
                ) : (
                    <TableCell style={{ paddingLeft: `${level * 20 + 24}px` }} className="py-3">
                        <div className="flex items-center gap-2">
                            {group.subRows.length > 0 && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                            {group.name}
                        </div>
                    </TableCell>
                )}
                <TableCell className={cn("text-right tabular-nums pr-6 py-3", balanceStyle)}>
                  {isExpanded ? '-' : toNepaliCurrency(group.debit)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums pr-6 py-3", balanceStyle)}>
                  {isExpanded ? '-' : toNepaliCurrency(group.credit)}
                </TableCell>
            </TableRow>
            {isExpanded && group.subRows.map(row => {
                if (row.isGroup) {
                    return <GroupRow 
                        key={row.id} 
                        group={row} 
                        level={level + 1} 
                        onAccountClick={onAccountClick} 
                        expandedGroups={expandedGroups} 
                        toggleGroup={toggleGroup}
                        parentGroupName={currentParentGroup}
                        subGroupName={level === 0 ? row.name : currentSubGroup}
                        hasAnyExpanded={hasAnyExpanded}
                    />
                }
                // Account row
                return (
                    <TableRow key={row.id} className="text-sm hover:bg-accent/10 cursor-pointer" onClick={() => onAccountClick(row)}>
                        {hasAnyExpanded ? (
                            <>
                                <TableCell className="py-3">{currentParentGroup || ''}</TableCell>
                                <TableCell className="py-3">{level === 1 ? group.name : (currentSubGroup || '')}</TableCell>
                                <TableCell className="py-3">{row.name}</TableCell>
                            </>
                        ) : (
                            <TableCell style={{ paddingLeft: `${(level + 1) * 20 + 44}px` }} className="py-3">{row.name}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums text-green-600 pr-6 py-3">{row.debit > 0 ? toNepaliCurrency(row.debit) : '-'}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-600 pr-6 py-3">{row.credit > 0 ? toNepaliCurrency(row.credit) : '-'}</TableCell>
                    </TableRow>
                )
            })}
        </>
    )
}

/**
 * MAIN TRIAL BALANCE PAGE COMPONENT
 */
export function TrialBalancePage() {
  const isMobile = useIsMobile();
                      <AdCalendar
                        valueAD={dateRange}
                        isRange
                        numberOfMonths={calendarMonths}
                        transactionDates={transactionDates}
                        onSelect={(adDate) => {
                          const atNoon = new Date(adDate.getFullYear(), adDate.getMonth(), adDate.getDate(), 12);
                          const range = dateRange;
                          if (!range?.from || (range.from && range.to)) {
                            setDateRange({ from: atNoon, to: undefined });
                          } else if (adDate < range.from) {
                            setDateRange({ from: atNoon, to: new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate(), 12) });
                            setIsCalendarOpen(false);
                          } else {
                            setDateRange({ from: range.from, to: atNoon });
                            setIsCalendarOpen(false);
                          }
                        }}

                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              
              {/* Clear Filters Button */}
              {isFilterActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XCircle className="mr-2 h-4 w-4"/>Clear Filters
                </Button>
              )}
            </div>
            
            {/* Print Button */}
            <Button onClick={() => setShowDetailPrintDialog(true)} variant="outline" size="sm">
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>

          {/* Transactions Table or Opening Balance Accounts List */}
          <ScrollArea className="flex-1 px-6 pb-6 print:p-0">
            {activeAccount && (
              <div className="print:p-0">
                {activeAccount.id === 'opening_balance_ledger' ? (
                  // Special view for Opening Balance ledger
                  <div className="py-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[30%]">Account Name</TableHead>
                          {dateSystem === "Both" ? (
                            <>
                              <TableHead className="w-[12%]">Date (BS)</TableHead>
                              <TableHead className="w-[12%]">Date (AD)</TableHead>
                            </>
                          ) : (
                            <TableHead className="w-[15%]">Date</TableHead>
                          )}
                          <TableHead className="text-right w-[10%]">Debit</TableHead>
                          <TableHead className="text-right w-[10%]">Credit</TableHead>
                          <TableHead className="text-right w-[20%]">Running Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accountsWithOpeningBalances.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={dateSystem === "Both" ? 6 : 5} className="text-center py-8 text-muted-foreground">
                              No accounts with opening balances found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          accountsWithOpeningBalances.map((acc) => {
                            const displayDate = () => {
                              if (!acc.openingBalanceDate) return '-';
                              switch (dateSystem) {
                                case 'AD': return formatDate(acc.openingBalanceDate);
                                case 'BS': return formatDateBS(acc.openingBalanceDate);
                                case 'Both': return formatDateBS(acc.openingBalanceDate);
                                default: return formatDateBS(acc.openingBalanceDate);
                              }
                            };
                            
                            const displayDateAD = () => {
                              if (!acc.openingBalanceDate) return '-';
                              return formatDate(acc.openingBalanceDate);
                            };
                            
                            return (
                              <TableRow key={acc.id}>
                                <TableCell className="font-medium">{acc.name}</TableCell>
                                {dateSystem === "Both" ? (
                                  <>
                                    <TableCell>
                                      {acc.openingBalanceDate ? formatDateBS(acc.openingBalanceDate) : '-'}
                                    </TableCell>
                                    <TableCell>
                                      {acc.openingBalanceDate ? formatDate(acc.openingBalanceDate) : '-'}
                                    </TableCell>
                                  </>
                                ) : (
                                  <TableCell>
                                    {displayDate()}
                                  </TableCell>
                                )}
                                <TableCell className="text-right tabular-nums text-green-600">
                                  {acc.debit > 0 ? formatCurrency(acc.debit) : '-'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-red-600">
                                  {acc.credit > 0 ? formatCurrency(acc.credit) : '-'}
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right tabular-nums font-medium",
                                  acc.runningBalance >= 0 ? "text-green-600" : "text-red-600"
                                )}>
                                  {formatCurrency(acc.runningBalance, { showDrCr: true })}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={dateSystem === "Both" ? 3 : 2} className="font-bold">TOTAL</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-green-600">
                            {formatCurrency(accountsWithOpeningBalances.reduce((sum, acc) => sum + acc.debit, 0))}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-red-600">
                            {formatCurrency(accountsWithOpeningBalances.reduce((sum, acc) => sum + acc.credit, 0))}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-bold tabular-nums",
                            closingBalance >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {formatCurrency(closingBalance, { showDrCr: true })}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                ) : (
                  // Normal transactions table for other ledgers
                  <TransactionsTable 
                    context={accountContext}
                    contextId={activeAccount.id}
                    transactions={processedTransactions}
                    openingBalance={openingBalanceForPeriod}
                    periodDr={periodDr}
                    periodCr={periodCr}
                    closingBalance={closingBalance}
                    filters={filters}
                    setFilters={setFilters}
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                    userNames={userNames}
                  />
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* DETAIL PRINT OPTIONS DIALOG */}
      <PrintOptionsDialog
        open={showDetailPrintDialog}
        onOpenChange={setShowDetailPrintDialog}
        onSelect={(option) => {
          // For detail dialog, both options print the same (current transactions)
          handlePrint();
        }}
      />
    </div>
  );
}


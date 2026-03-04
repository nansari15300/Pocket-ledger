
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
<<<<<<< HEAD
import { useIsMobile } from "@/hooks/use-mobile";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
=======
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import AdCalendar from "@/components/ui/ad-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";
>>>>>>> 6a1ec26 (Animation Fixed)
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
<<<<<<< HEAD
=======
  const calendarMonths = useCalendarMonths();
>>>>>>> 6a1ec26 (Animation Fixed)
  const {
    vouchers,
    loading,
    processedExpenseAccounts,
    processedExpenseGroups,
    userNames,
  } = useVouchers();
  const { companyId, company } = useCompany();

  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [entityFilter, setEntityFilter] = useState<"all" | "Income" | "Expense">("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<ProfitLossRow | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  const { dateSystem, formatDate, formatDateBS } = useDate();

  // Build tree structure from groups and accounts
  const profitLossData = useMemo((): ProfitLossRow[] => {
    // 1. Gather all individual accounts
    // Note: processedExpenseAccounts.balance already includes openingBalance: balance = openingBalance + debit - credit
    const allAccounts: ProfitLossRow[] = processedExpenseAccounts
      .map(acc => {
        // Use balance which already includes openingBalance
        // For Income accounts: balance = openingBalance + credit - debit (positive = income)
        // For Expense accounts: balance = openingBalance + debit - credit (positive = expense)
        const balance = acc.balance || 0;
        const amount = Math.abs(balance);
        
        // Include accounts with non-zero balance OR non-zero opening balance
        const openingBalance = Number((acc as any).openingBalance) || 0;
        if (amount <= 0.01 && Math.abs(openingBalance) <= 0.01) return null;
        
        // Determine category based on balance sign
        // Positive balance for income accounts (credit > debit), negative for expense accounts (debit > credit)
        // But we need to check the account type or group to determine if it's income or expense
        const isIncomeAccount = acc.id === 'sales_account' || 
          (acc.groupId && processedExpenseGroups.some(g => 
            g.id === acc.groupId && ((g as any).type === 'Income' || g.id === 'direct_income' || g.id === 'indirect_income')
          ));
        
        return {
          id: acc.id,
          name: acc.name,
          category: isIncomeAccount ? 'Income' : 'Expense',
          amount: amount,
          isGroup: false,
          parentId: acc.groupId,
          subRows: [],
          accountId: acc.id,
        } as ProfitLossRow;
      })
      .filter((acc): acc is ProfitLossRow => acc !== null);

    // 2. Gather all groups
    const allGroups: ProfitLossRow[] = processedExpenseGroups.map(g => ({
      id: g.id,
      name: g.name,
      category: (g as any).type === 'Income' ? 'Income' : 'Expense',
      amount: 0, // Will be calculated
      isGroup: true,
      parentId: g.parentId,
      subRows: [],
    }));

    // 3. Build the tree
    const itemsMap = new Map<string, ProfitLossRow>();
    allGroups.forEach(g => itemsMap.set(g.id, { ...g, subRows: [] }));
    allAccounts.forEach(a => itemsMap.set(a.id, { ...a, subRows: [] }));

    const rootItems: ProfitLossRow[] = [];
    itemsMap.forEach(item => {
      const parentId = item.parentId;
      if (parentId && itemsMap.has(parentId)) {
        itemsMap.get(parentId)!.subRows.push(item);
      } else {
        rootItems.push(item);
      }
    });

    // 4. Calculate group totals recursively
    const calculateTotals = (item: ProfitLossRow): number => {
      if (!item.isGroup) {
        return item.amount;
      }

      let total = 0;
      item.subRows.forEach(subItem => {
        total += calculateTotals(subItem);
      });

      item.amount = round2(total);
      return total;
    };
    
    rootItems.forEach(calculateTotals);

    // 5. Filter out empty groups
    const processHierarchy = (items: ProfitLossRow[]): ProfitLossRow[] => {
      return items.map(item => {
        if (item.isGroup) {
          item.subRows = processHierarchy(item.subRows);
        }
        return item;
      }).filter(item => {
        return !item.isGroup || item.subRows.length > 0 || item.amount > 0.01;
      });
    };

    const finalHierarchy = processHierarchy(rootItems);
    
    // Sort children within each group alphabetically
    const sortRows = (rows: ProfitLossRow[]) => {
      rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      rows.forEach(row => { if (row.isGroup) sortRows(row.subRows); });
    };
    sortRows(finalHierarchy);
    
    return finalHierarchy;
  }, [processedExpenseAccounts, processedExpenseGroups]);

  // Filter and sort
  const filtered = useMemo(() => {
    let filteredData = [...profitLossData];

    // Apply entity filter
    if (entityFilter !== "all") {
      const filterByCategory = (items: ProfitLossRow[]): ProfitLossRow[] => {
        return items
          .map(item => {
            if (item.isGroup) {
              const filteredSubRows = filterByCategory(item.subRows);
              if (filteredSubRows.length === 0 && item.category !== entityFilter) {
                return null;
              }
              return { ...item, subRows: filteredSubRows };
    } else {
              return item.category === entityFilter ? item : null;
            }
          })
          .filter((item): item is ProfitLossRow => item !== null);
      };
      filteredData = filterByCategory(filteredData);
    }

    // Apply search query
    if (query) {
      const searchInItems = (items: ProfitLossRow[]): ProfitLossRow[] => {
        return items
          .map(item => {
            const matchesQuery = 
              item.name.toLowerCase().includes(query.toLowerCase()) ||
              item.category.toLowerCase().includes(query.toLowerCase());
            
            if (item.isGroup) {
              const filteredSubRows = searchInItems(item.subRows);
              if (filteredSubRows.length > 0 || matchesQuery) {
                return { ...item, subRows: filteredSubRows };
              }
              return null;
            } else {
              return matchesQuery ? item : null;
            }
          })
          .filter((item): item is ProfitLossRow => item !== null);
      };
      filteredData = searchInItems(filteredData);
    }

    // Sort
    const sortItems = (items: ProfitLossRow[]): ProfitLossRow[] => {
      const sorted = [...items];
      sorted.sort((a, b) => {
        if (sortDesc) {
          return b.amount - a.amount;
        } else {
          return a.amount - b.amount;
        }
      });
      return sorted.map(item => {
        if (item.isGroup) {
          return { ...item, subRows: sortItems(item.subRows) };
        }
        return item;
      });
    };
    
    return sortItems(filteredData);
  }, [profitLossData, query, sortDesc, entityFilter]);
  
  // Calculate totals from filtered data
  const totals = useMemo(() => {
    const calculateTotals = (items: ProfitLossRow[]): { income: number; expense: number } => {
      let income = 0;
      let expense = 0;
      
      items.forEach(item => {
        if (item.isGroup) {
          const subTotals = calculateTotals(item.subRows);
          income += subTotals.income;
          expense += subTotals.expense;
        } else {
          if (item.category === 'Income') {
            income += item.amount;
          } else {
            expense += item.amount;
          }
        }
      });
      
      return { income, expense };
    };
    
    const { income, expense } = calculateTotals(filtered);
    const net = income - expense;
    return { income: round2(income), expense: round2(expense), net: round2(net) };
  }, [filtered]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const getAllGroupIds = (items: ProfitLossRow[]): string[] => {
      const ids: string[] = [];
      items.forEach(item => {
        if (item.isGroup && item.subRows.length > 0) {
          ids.push(item.id);
          ids.push(...getAllGroupIds(item.subRows));
        }
      });
      return ids;
    };
    setExpandedGroups(new Set(getAllGroupIds(filtered)));
  }, [filtered]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const isAllExpanded = useMemo(() => {
    const getAllGroupIds = (items: ProfitLossRow[]): string[] => {
      const ids: string[] = [];
      items.forEach(item => {
        if (item.isGroup && item.subRows.length > 0) {
          ids.push(item.id);
          ids.push(...getAllGroupIds(item.subRows));
        }
      });
      return ids;
    };
    const allGroupIds = getAllGroupIds(filtered);
    return allGroupIds.length > 0 && allGroupIds.every(id => expandedGroups.has(id));
  }, [filtered, expandedGroups]);

  // Get account entity for useTransactions
  const accountEntity = useMemo(() => {
    if (!activeRow || activeRow.isGroup) return null;
    const account = processedExpenseAccounts.find(acc => acc.id === activeRow.accountId);
    if (!account) return null;
    
    // Get opening balance - processedExpenseAccounts spreads ...e so openingBalance should be preserved
    // But if not, calculate it: balance = openingBalance + debit - credit
    const openingBalanceFromAccount = Number((account as any).openingBalance);
    const calculatedOpeningBalance = openingBalanceFromAccount || ((account.balance || 0) - (account.debit || 0) + (account.credit || 0));
    
    // Ensure openingBalance is included in the entity
    return {
      ...account,
      openingBalance: calculatedOpeningBalance,
    };
  }, [activeRow, processedExpenseAccounts]);

  // Use useTransactions hook to get processed transactions with debit, credit, and running balance
  const { processedTransactions, openingBalanceForPeriod: openingBalanceForAccount, periodDr, periodCr, closingBalance: calculatedClosingBalance } = useTransactions(
    accountEntity,
    "expense",
    dateRange,
    "amount",
    processedExpenseAccounts,
    undefined, // passedTransactions
    undefined, // transactionContext
    undefined, // filters
    undefined, // voucherTypes
    undefined, // journalAccountNames
    userNames
  );

  const openDetail = (row: ProfitLossRow) => {
    if (row.isGroup) return;
    setActiveRow(row);
    setCurrentPage(1); // Reset to first page when opening new account
  };
  
  const closeDrawer = () => setActiveRow(null);

  const handlePrintDetail = () => {
    if (!company || !activeRow) return;
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;
      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    openPrintDirect({
      company: {
        name: company.name,
        pan: company.pan,
        phone: company.phone,
        address: company.address,
        decimalPlaces: company.decimalPlaces,
        showDrCr: company.showDrCr,
        showCurrencySymbol: company.showCurrencySymbol,
        logoUrl: company.logoUrl,
      },
      title: `${activeRow.name}${activeRow.category ? ` · ${activeRow.category}` : ""}`,
      context: "expense",
      contextId: activeRow.accountId,
      dateSystem: dateSystem,
      dateRangeText: dateRangeText,
      vouchersCount: processedTransactions?.length ?? 0,
      openingBalance: openingBalanceForAccount ?? 0,
      transactions: processedTransactions ?? [],
      userNames: userNames,
    }, true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="pb-[72px] p-0.5 w-full h-full overflow-y-auto">
      <div className="p-0 space-y-3">
        {/* Summary Cards at Top - responsive: 1 per row on mobile, 3 on desktop; no wrap */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4">
            <Card className="min-w-0">
              <CardContent className="p-4 overflow-x-auto">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <CardTitle className="text-base font-medium whitespace-nowrap shrink-0">Total Income</CardTitle>
                  <span className="text-2xl font-bold text-green-600 whitespace-nowrap tabular-nums">{toNepaliCurrency(totals.income)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardContent className="p-4 overflow-x-auto">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <CardTitle className="text-base font-medium whitespace-nowrap shrink-0">Total Expenses</CardTitle>
                  <span className="text-2xl font-bold text-red-600 whitespace-nowrap tabular-nums">{toNepaliCurrency(totals.expense)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardContent className="p-4 overflow-x-auto">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <CardTitle className="text-base font-medium whitespace-nowrap shrink-0">Net Profit / Loss</CardTitle>
                  <span className={`text-2xl font-bold whitespace-nowrap tabular-nums ${totals.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {totals.net >= 0 ? `${toNepaliCurrency(totals.net)} (Profit)` : `${toNepaliCurrency(Math.abs(totals.net))} (Loss)`}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

        <Card className="border-2 border-foreground/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Profit & Loss Statement</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div className={cn("flex items-center gap-2 py-3 px-4", isMobile && "overflow-x-auto min-w-0")}>
              <div className={cn("flex items-center gap-2 shrink-0", isMobile && "min-w-[560px]")}>
              <Button
                variant="outline"
                size="sm"
                onClick={isAllExpanded ? collapseAll : expandAll}
              >
                {isAllExpanded ? (
                  <>
                    <ChevronUp className="mr-2 h-4 w-4" /> Collapse All
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-2 h-4 w-4" /> Expand All
                  </>
                )}
              </Button>
              <Select value={entityFilter} onValueChange={(value: "all" | "Income" | "Expense") => setEntityFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Income">Income</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setSortDesc((s) => !s)}>
                <ArrowUpDown className="mr-2 h-4 w-4" /> Sort {sortDesc ? "Desc" : "Asc"}
              </Button>
              <div className="relative w-full max-w-sm ml-auto">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70" />
                <Input
                  placeholder="Search account or group…"
                  className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              </div>
            </div>

            <div className={cn("rounded-lg border flex-1 flex flex-col min-h-0 mx-4", isMobile && "overflow-x-auto")}>
              <div className={cn("flex-1 flex flex-col min-h-0", isMobile && "min-w-[600px]")}>
              <div className="flex-1 overflow-y-auto min-h-0">
                <Table className={cn(isMobile && "min-w-[600px]")}>
                  <TableCaption>Click a row to view details.</TableCaption>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {expandedGroups.size > 0 ? (
                        <>
                          <TableHead>Group</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Income</TableHead>
                          <TableHead className="text-right">Expense</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Group / Account Name</TableHead>
                          <TableHead className="text-right">Income</TableHead>
                          <TableHead className="text-right">Expense</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <GroupRow
                        key={row.id}
                        row={row}
                        level={0}
                        expandedGroups={expandedGroups}
                        toggleGroup={toggleGroup}
                        onRowClick={openDetail}
                      />
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={expandedGroups.size > 0 ? 4 : 3} className="text-center py-8 text-muted-foreground">
                          No matching records found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              </div>
            </div>

            <p className="mt-2 text-sm opacity-80 px-4 pb-4">Note: Profit & Loss Statement = Income - Expenses = Net Profit or Loss</p>
        </CardContent>
      </Card>
      </div>

      {/* DETAIL DIALOG - height 90% screen, width data anusar */}
      <Dialog open={!!activeRow} onOpenChange={(open) => !open && closeDrawer()}>
        <DialogContent className={cn(
          "h-[90vh] max-h-[90vh] w-max min-w-[320px] max-w-[95vw] flex flex-col gap-0 overflow-hidden"
        )}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="pr-8 truncate">
              {activeRow?.name} {activeRow?.category ? `· ${activeRow.category}` : ""}
            </DialogTitle>
          </DialogHeader>
          
          {/* Date Filter and Pagination Controls */}
          <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b">
            <div className="flex items-center gap-2">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={(range) => {
                    if (range) {
                      const normalizedRange: DateRange = {
                        from: range.from ? startOfDay(range.from) : undefined,
                        to: range.to ? endOfDay(range.to) : undefined,
                      };
                      setDateRange(normalizedRange);
                      if (activeRow) {
                        openDetail(activeRow);
                      }
                    } else {
                      setDateRange(undefined);
                      if (activeRow) {
                        openDetail(activeRow);
                      }
                    }
                  }}
                  className="w-auto"
                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`w-[240px] justify-start text-left font-normal ${
                        !dateRange && "text-muted-foreground"
                      }`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
<<<<<<< HEAD
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(range) => {
                        if (range) {
                          const normalizedRange: DateRange = {
                            from: range.from ? startOfDay(range.from) : undefined,
                            to: range.to ? endOfDay(range.to) : undefined,
                          };
                          setDateRange(normalizedRange);
                          setIsCalendarOpen(false);
                          if (activeRow) {
                            openDetail(activeRow);
                          }
                        } else {
                          setDateRange(undefined);
                          if (activeRow) {
                            openDetail(activeRow);
                          }
                        }
                      }}
                      numberOfMonths={2}
=======
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
>>>>>>> 6a1ec26 (Animation Fixed)
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

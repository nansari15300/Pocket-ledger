

"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  getDocs,
  where,
} from 'firebase/firestore';
import * as React from 'react';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  BookText,
  Landmark,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  History,
  Receipt,
  Home,
  XCircle,
  X,
  Calendar as CalendarIcon,
  Printer,
  FileDigit,
  FileText as FileTextIcon,
  Filter,
  Wand2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableFooter,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";

import BsDatePicker from '@/components/ui/BsDatePicker';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, startOfDay, endOfDay, isSameDay, startOfMonth, endOfMonth, differenceInDays, getYear, getMonth } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDate } from '@/hooks/useDate';
import { openPrintDirect } from "@/lib/printDirect";
import usePermissions from '@/hooks/usePermissions';
import { Checkbox } from '@/components/ui/checkbox';
import { DaybookReport } from '@/components/reports/DaybookReport';
import { useVouchers } from '@/hooks/useVouchers';
import Link from 'next/link';
import { TransactionsTable } from '@/components/vouchers/TransactionsTable';
import { useDashboard } from '@/hooks/useDashboard';
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from '@/hooks/useAuth';
import { adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";
import { motion, AnimatePresence } from 'framer-motion';
import { AddVoucherDialog } from '@/components/vouchers/AddVoucherDialog';
import { useTransactions } from '@/hooks/use-transactions';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { useIsMobile, useCalendarMonths } from '@/hooks/use-mobile';


// Type definitions
type Voucher = {
  id: string;
  type: string;
  subType?: string;
  total?: number;
  amount?: number;
  partyId?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  staffId?: string;
  date: any;
  voucherNumber?: string;
  invoiceNumber?: string;
  narration?: string;
  title?: string;
  entries?: any[];
  lineItems?: any[];
  userId?: string;
  taxAccountId?: string;
  incomeAccountId?: string;
  expenseAccountId?: string;
};

// Helper: Safe Date Converter
const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  try {
    if (typeof date.toDate === 'function') return date.toDate();
    if (date instanceof Date) return date;
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch (e) {
    return null;
  }
};

// Helper: Calculate Debit/Credit for Journal/Contra
function getTransactionAmounts(transaction: any) {
  const t = transaction;
  const amount = Number(t.total || t.amount || 0);
  let debit = 0;
  let credit = 0;

  switch (t.type) {
    case 'sale':
    case 'direct_income':
    case 'payment_in': 
      credit = amount;
      break;
    case 'purchase':
    case 'direct_expense':
    case 'payment_out':
      debit = amount;
      break;
    case 'contra':
       debit = amount;
       credit = amount;
      break;
    case 'journal':
      if (t.entries && Array.isArray(t.entries)) {
        debit = t.entries.reduce((sum: number, e: any) => sum + Number(e.debit || 0), 0);
        credit = t.entries.reduce((sum: number, e: any) => sum + Number(e.credit || 0), 0);
      }
      break;
  }
  return { debit, credit };
}

const statCardData = [
  { title: 'Sales', icon: ShoppingBag, type: 'sale', link: '/sale', isCredit: true },
  { title: 'Purchases', icon: ShoppingCart, type: 'purchase', link: '/purchase', isCredit: false },
  { title: 'Journals', icon: BookText, type: 'journal', link: '/journal', isCredit: false },
  { title: 'Add Salary', icon: FileDigit, type: 'add_salary', link: '/add-salary', isCredit: false },
  { title: 'Contra', icon: Landmark, type: 'contra', link: '/contra', isCredit: false },
  { title: 'Direct Income', icon: TrendingUp, type: 'direct_income', link: '/incomes', isCredit: true },
  { title: 'Direct Expense', icon: TrendingDown, type: 'direct_expense', link: '/incomes', isCredit: false },
];

// --- REUSABLE DATE FILTER COMPONENT ---
const MonthYearFilter = ({ 
  dateRange, 
  setDateRange, 
  dateSystem 
}: { 
  dateRange: DateRange | undefined, 
  setDateRange: (range: DateRange | undefined) => void, 
  dateSystem: string 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'all' | 'custom'>('all');
  
  // Current Date Infos
  const today = new Date();
  const currentBs = adToBs(today);
  
  // Selection State
  const [selectedBsYear, setSelectedBsYear] = useState(currentBs.y);
  const [selectedBsMonth, setSelectedBsMonth] = useState(currentBs.m);
  const [selectedAdYear, setSelectedAdYear] = useState(getYear(today));
  const [selectedAdMonth, setSelectedAdMonth] = useState(getMonth(today)); // 0-11

  // Sync internal state with dateRange prop
  useEffect(() => {
    if (dateRange?.from) {
      setMode('custom');
      if (dateSystem === 'BS') {
        const bs = adToBs(dateRange.from);
        setSelectedBsYear(bs.y);
        setSelectedBsMonth(bs.m);
      } else {
        setSelectedAdYear(getYear(dateRange.from));
        setSelectedAdMonth(getMonth(dateRange.from));
      }
    } else {
      setMode('all');
    }
  }, [dateRange, dateSystem]);

  const bsYears = Array.from({length: 10}, (_, i) => currentBs.y - 5 + i);
  const bsMonths = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
  
  const adYears = Array.from({length: 10}, (_, i) => getYear(today) - 5 + i);
  const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const applyFilter = () => {
    if (mode === 'all') {
      setDateRange(undefined);
    } else {
      if (dateSystem === 'BS') {
        const startAd = bsToAd({ y: selectedBsYear, m: selectedBsMonth, d: 1 });
        const daysInMonth = getBSMonthDays(selectedBsYear)[selectedBsMonth - 1];
        const endAd = bsToAd({ y: selectedBsYear, m: selectedBsMonth, d: daysInMonth });
        setDateRange({ from: startAd, to: endAd });
      } else {
        const start = new Date(selectedAdYear, selectedAdMonth, 1);
        const end = endOfMonth(start);
        setDateRange({ from: start, to: end });
      }
    }
    setIsOpen(false);
  };

  const displayText = useMemo(() => {
    if (!dateRange?.from) return "All Time";
    if (dateSystem === 'BS') {
       const bs = adToBs(dateRange.from);
       return `${bsMonths[bs.m - 1]} ${bs.y}`;
    }
    return format(dateRange.from, 'MMM yyyy');
  }, [dateRange, dateSystem]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button 
            variant="outline" 
            size="sm" 
            type="button"
            className="h-7 px-2 text-xs font-normal"
            onClick={(e) => {
              // Allow PopoverTrigger to handle the click, but prevent Dialog from closing
              e.stopPropagation();
            }}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-4 z-[9999]" 
        align="end" 
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          // Prevent closing when clicking inside Dialog or on Select dropdowns
          if (
            target.closest('[data-radix-dialog-content]') || 
            target.closest('[role="dialog"]') ||
            target.closest('[data-radix-select-content]')
          ) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          // Prevent closing when clicking inside Dialog or on Select dropdowns
          if (
            target.closest('[data-radix-dialog-content]') || 
            target.closest('[role="dialog"]') ||
            target.closest('[data-radix-select-content]')
          ) {
            e.preventDefault();
          }
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Select Month/Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              {dateSystem === 'BS' ? (
                <>
                  <Select value={selectedBsYear.toString()} onValueChange={(v) => setSelectedBsYear(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      {bsYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={selectedBsMonth.toString()} onValueChange={(v) => setSelectedBsMonth(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {bsMonths.map((m, i) => <SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Select value={selectedAdYear.toString()} onValueChange={(v) => setSelectedAdYear(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      {adYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={selectedAdMonth.toString()} onValueChange={(v) => setSelectedAdMonth(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {adMonths.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}

          <Button 
            className="w-full" 
            onClick={(e) => {
              e.stopPropagation();
              applyFilter();
            }}
          >
            Ok
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
// ------------------------------------

const BankCashSummary = () => {
    const { processedAccounts, vouchers } = useVouchers();
    const { dateSystem, formatCurrency } = useDate();
    const [bankCashDateRange, setBankCashDateRange] = React.useState<DateRange | undefined>(undefined);

    // NEW (BankCashSummary - default All Time)
useEffect(() => {
  setBankCashDateRange(undefined);
}, [dateSystem]);


    const bankCashSummary = React.useMemo(() => {
        if (!processedAccounts || !vouchers) return { cashAccounts: [], bankAccounts: [], totalBankInflow: 0, totalBankOutflow: 0, totalCashInflow: 0, totalCashOutflow: 0 };
    
        const fromDate = bankCashDateRange?.from ? startOfDay(bankCashDateRange.from) : null;
        const toDate = bankCashDateRange?.to ? endOfDay(bankCashDateRange.to) : fromDate ? endOfDay(fromDate) : null;
    
        const summaryAccounts = processedAccounts.map((acc) => {
          const newAcc = { ...acc, inflow: 0, outflow: 0, balance: Number(acc.openingBalance) || 0 };
          
          const prePeriodTx = vouchers.filter(v => {
            if (!fromDate) return false;
            const txDate = safeToDate(v.date);
            return txDate && txDate < fromDate;
          });
    
          let openingForPeriod = Number(acc.openingBalance) || 0;
          prePeriodTx.forEach(v => {
            const amount = v.total || v.amount || 0;
             if (['payment_in', 'direct_income', 'sale'].includes(v.type) && v.accountId === acc.id) openingForPeriod += amount;
             if (['payment_out', 'direct_expense', 'purchase'].includes(v.type) && v.accountId === acc.id) openingForPeriod -= amount;
             if (v.type === 'contra') {
                if (v.toAccountId === acc.id) openingForPeriod += amount;
                if (v.fromAccountId === acc.id) openingForPeriod -= amount;
             }
             if (v.type === "journal" && Array.isArray(v.entries)) {
              const entry = v.entries.find((e: any) => e.accountId === acc.id);
              if (entry) openingForPeriod += Number(entry.debit || 0) - Number(entry.credit || 0);
            }
          });
          newAcc.balance = openingForPeriod;
    
          const periodTx = vouchers.filter(v => {
              if (!fromDate || !toDate) return true;
              const txDate = safeToDate(v.date);
              return txDate && txDate >= fromDate && txDate <= toDate;
          });
    
          periodTx.forEach((v) => {
            const amount = v.total || v.amount || 0;
            if (['payment_in', 'direct_income', 'sale'].includes(v.type) && v.accountId === acc.id) newAcc.inflow += amount;
            if (['payment_out', 'direct_expense', 'purchase', 'salary', 'add_salary'].includes(v.type) && v.accountId === acc.id) newAcc.outflow += amount;
            if (v.type === 'contra') {
              if (v.toAccountId === acc.id) newAcc.inflow += amount;
              if (v.fromAccountId === acc.id) newAcc.outflow += amount;
            }
            if (v.type === "journal" && Array.isArray(v.entries)) {
              const entry = v.entries.find((e: any) => e.accountId === acc.id);
              if (entry) {
                newAcc.inflow += Number(entry.debit || 0);
                newAcc.outflow += Number(entry.credit || 0);
              }
            }
          });
          
          newAcc.balance += newAcc.inflow - newAcc.outflow;
          return newAcc;
        }).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    
        const cashAccounts = summaryAccounts.filter((acc) => acc.accountType === 'Cash');
        const bankAccounts = summaryAccounts.filter((acc) => acc.accountType === 'Bank');
    
        const totalBankInflow = bankAccounts.reduce((sum, acc) => sum + acc.inflow, 0);
        const totalBankOutflow = bankAccounts.reduce((sum, acc) => sum + acc.outflow, 0);
        const totalCashInflow = cashAccounts.reduce((sum, acc) => sum + acc.inflow, 0);
        const totalCashOutflow = cashAccounts.reduce((sum, acc) => sum + acc.outflow, 0);

        return { cashAccounts, bankAccounts, totalBankInflow, totalBankOutflow, totalCashInflow, totalCashOutflow };
      }, [processedAccounts, vouchers, bankCashDateRange]);

    return (
        <Card id="bank-cash-summary-area" className="flex-1 flex flex-col min-h-0 border-foreground/20">
            <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Bank/Cash Summary</CardTitle>
                    <MonthYearFilter dateRange={bankCashDateRange} setDateRange={setBankCashDateRange} dateSystem={dateSystem} />
                </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 p-0">
                <ScrollArea className="flex-1 w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Total In</TableHead>
                        <TableHead className="text-right">Total Out</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        <AnimatePresence>
                            {bankCashSummary.bankAccounts.map(acc => (
                                <motion.tr key={acc.id} layout initial={false} exit={{ transition: { duration: 0 } }} className="border-b">

                                    <TableCell>{acc.accountName}</TableCell>
                                    <TableCell>{acc.accountType}</TableCell>
                                    <TableCell className="text-right text-green-600">{acc.inflow > 0 ? formatCurrency(acc.inflow, { noSuffix: true, duration: 2 }) : '-'}</TableCell>
                                    <TableCell className="text-right text-red-600">{acc.outflow > 0 ? formatCurrency(acc.outflow, { noSuffix: true, duration: 2 }) : '-'}</TableCell>
                                    <TableCell className={cn("text-right font-semibold", acc.balance >= 0 ? "text-green-600" : "text-red-600")}>
                                      {acc.balance !== 0 ? formatCurrency(acc.balance, { showDrCr: true, duration: 2 }) : 'Rs. 0.00 Dr'}
                                    </TableCell>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                         <TableRow className="font-bold bg-muted/50 border-b-2 border-foreground">
                            <TableCell colSpan={2}>Bank Total</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(bankCashSummary.totalBankInflow, {noSuffix: true, duration: 2})}</TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(bankCashSummary.totalBankOutflow, {noSuffix: true, duration: 2})}</TableCell>
                            <TableCell className={cn("text-right", (bankCashSummary.totalBankInflow-bankCashSummary.totalBankOutflow) >= 0 ? "text-green-600" : "text-red-600")}>
                                {formatCurrency(bankCashSummary.bankAccounts.reduce((sum, a) => sum + a.balance, 0), { showDrCr: true, duration: 2 })}
                            </TableCell>
                        </TableRow>
                          <AnimatePresence>
                            {bankCashSummary.cashAccounts.map(acc => (
                               <motion.tr key={acc.id} layout initial={false} exit={{ transition: { duration: 0 } }} className="border-b">

                                    <TableCell>{acc.accountName}</TableCell>
                                    <TableCell>{acc.accountType}</TableCell>
                                    <TableCell className="text-right text-green-600">{acc.inflow > 0 ? formatCurrency(acc.inflow, { noSuffix: true, duration: 2 }) : '-'}</TableCell>
                                    <TableCell className="text-right text-red-600">{acc.outflow > 0 ? formatCurrency(acc.outflow, { noSuffix: true, duration: 2 }) : '-'}</TableCell>
                                    <TableCell className={cn("text-right font-semibold", acc.balance >= 0 ? "text-green-600" : "text-red-600")}>
                                      {acc.balance !== 0 ? formatCurrency(acc.balance, { showDrCr: true, duration: 2 }) : 'Rs. 0.00 Dr'}
                                    </TableCell>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                         <TableRow className="font-bold bg-muted/50 border-b-2 border-foreground">
                            <TableCell colSpan={2}>Cash Total</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(bankCashSummary.totalCashInflow, {noSuffix: true, duration: 2})}</TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(bankCashSummary.totalCashOutflow, {noSuffix: true, duration: 2})}</TableCell>
                            <TableCell className={cn("text-right", (bankCashSummary.totalCashInflow - bankCashSummary.totalCashOutflow) >= 0 ? "text-green-600" : "text-red-600")}>
                                {formatCurrency(bankCashSummary.cashAccounts.reduce((sum, a) => sum + a.balance, 0), { showDrCr: true, duration: 2 })}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
        </Card>
    )
};


export default function DashboardPage() {
  const { company, companyId } = useCompany();
  const { can } = usePermissions();
  const { user } = useAuth();
  const { vouchers, loading: vouchersLoading, processedItems, processedParties, processedStaff, processedTaxes, processedAccounts, expenseAccounts } = useVouchers();
  const [showFab, setShowFab] = useState(true);
  const lastScrollY = useRef(0);
  const hideFabTimeout = useRef<NodeJS.Timeout | null>(null);
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint } = useDate();
  
  const [loading, setLoading] = React.useState(true);
  
  const [userNames, setUserNames] = React.useState<Record<string, string>>({});
  
  const [receivablesPayablesOpen, setReceivablesPayablesOpen] = React.useState(false);
  const [taxSummaryOpen, setTaxSummaryOpen] = useState(false);
  
  // Filter for Receivables & Payables Dialog
  const [receivablePayableFilter, setReceivablePayableFilter] = useState<'all' | 'party' | 'staff' | 'tax'>('all');
  const [receivablesPayablesTab, setReceivablesPayablesTab] = useState<'receivables' | 'payables'>('receivables');
  const isMobile = useIsMobile();
                    <Calendar initialFocus mode="range" defaultMonth={recentDateRange?.from} selected={asCalendarRange(recentDateRange)} onSelect={setRecentDateRange} numberOfMonths={calendarMonths} modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: 'has-transactions' }} />

                    </PopoverContent>
                </Popover>
            )}
            </div>
            <div className={cn("flex items-center space-x-2 flex-1 min-w-0", isMobile ? "order-2" : "md:order-1")}>
                <span className="text-sm font-medium shrink-0">Show:</span>
                <Select value={recentRowsPerPage} onValueChange={(v) => setRecentRowsPerPage(v)}>
                    <SelectTrigger className="h-9 flex-1 min-w-0 w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="20">Last 20</SelectItem>
                        <SelectItem value="30">Last 30</SelectItem>
                        <SelectItem value="50">Last 50</SelectItem>
                        <SelectItem value="0">All</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             {isRecentFilterActive && <Button variant="ghost" size="sm" onClick={clearRecentFilters}><XCircle className="mr-2 h-4 w-4"/>Clear Filters</Button>}
          </div>
          <span className="text-sm font-medium text-muted-foreground">Showing {recentTransactions ? recentTransactions.length : 0} Vouchers Of All {allRecentTransactions ? allRecentTransactions.length : 0} Vouchers</span>
        </div>
      </CardHeader>
      <CardContent className={cn(isMobile && "px-0")}>
        <div className={cn("pt-0", isMobile ? "px-0.5" : "p-4 sm:p-6 md:p-8")}>
        <TransactionsTable
          transactions={recentTransactions}
          context="daybook"
          onRowClick={(v) => {
            setSelectedVoucher(v);
            setIsVoucherDialogOpen(true);
          }}
          journalAccountNames={journalAccountNames}
          userNames={userNames}
          isDateChange={isDateChange}
          filters={recentFilters}
          setFilters={setRecentFilters}
          activeFilter={activeRecentFilter}
          setActiveFilter={setActiveRecentFilter}
          voucherTypes={recentVoucherTypes}
          onVoucherTypeChange={setRecentVoucherTypes}
          hideFooter={true}
          showNarration={showRecentNarration}
        />
        </div>
      </CardContent>
    </Card>
    </div>
  );

  const renderDashboardContent = () => {
    const shouldShow = (cardId: string) => visibleCard === 'all' || visibleCard === cardId;

    return (
    <div className="space-y-3">
      {shouldShow('financial-summaries') && renderFinancialSummaries(isReportsEnabled)}
      {shouldShow('bank-cash-summary') && can('view_bank_cash_summary') && <BankCashSummary />}
      {shouldShow('daybook') && can('view_daybook') && <div className="px-0.5"><DaybookReport /></div>}
      {shouldShow('recent-transactions') && can('view_recent_transactions') && renderRecentTransactions()}
      
      <Card className="col-span-full bg-muted dark:bg-green-900/20 dark:border-green-600/20 p-2 overflow-hidden relative">
        {newYearInfo && !newYearInfo.isNewYear && (
          <div className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-4 py-1 rounded-bl-lg animate-pulse">
            {newYearInfo.daysLeft} days to {newYearInfo.year}!
          </div>
        )}
        <CardHeader className="p-0 text-center">
          <p className="text-xs"></p>
          {newYearInfo?.isNewYear ? (
              <div className="flex flex-col items-center justify-center py-2">
                <motion.div
                  initial={{ scale: 0, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className="text-3xl font-bold bg-gradient-to-r from-amber-400 via-red-500 to-fuchsia-600 bg-clip-text text-transparent"
                >
                  {newYearInfo.event}
                </motion.div>
                <p className="text-sm font-semibold">{user?.displayName || user?.email}</p>
              </div>
          ) : (
             <CardTitle className="text-1xl font-bold text-green-500 dark:text-green-400">
              {greeting}, {user?.displayName || user?.email}! Welcome To Pocket-Ledger
            </CardTitle>
          )}

          <p className="text-sm text-muted-foreground font-mono">
            {liveTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} | {liveTime.toLocaleTimeString()}
          </p>
        </CardHeader>
      </Card>
    </div>
  );
  }
  
  if (vouchersLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="w-full h-32" />
        <Skeleton className="w-full h-64" />
      </div>
    );
  }

  const dashboardCards = [
    { id: 'all', title: 'All' },
    { id: 'financial-summaries', title: 'Summary' },
    { id: 'bank-cash-summary', title: 'Bank' },
    { id: 'daybook', title: 'Daybook' },
    { id: 'recent-transactions', title: 'Recent' },
  ];

  return (
    <div className="pb-[72px] p-0.5">
      <div className="p-0">
        {renderDashboardContent()}
      </div>
       
      <div className="fixed bottom-0 left-0 md:left-64 right-0 p-2 border-t bg-background/95 backdrop-blur-sm flex items-center justify-around gap-2 h-16 z-40">
        {dashboardCards.map(card => {
              const Icon = card.id === 'all' ? Home : card.id === 'financial-summaries' ? TrendingUp : card.id === 'daybook' ? FileTextIcon : card.id === 'bank-cash-summary' ? Landmark : History;
              return (
                  <Button 
                      key={card.id}
                      variant="ghost"
                      className={cn(
                          "flex-1 flex-col h-full p-2 text-muted-foreground",
                          visibleCard === card.id && "bg-primary/10 text-primary"
                      )}
                      onClick={() => setVisibleCard(card.id)}
                  >
                      <Icon className="h-5 w-5 mb-1" />
                      <span className="text-xs">{card.title}</span>
                  </Button>
              )
          })}
      </div>
       <AddVoucherDialog 
          isOpen={isVoucherDialogOpen}
          onOpenChange={setIsVoucherDialogOpen}
          voucher={selectedVoucher}
          onVoucherAction={() => setSelectedVoucher(null)}
       />
    </div>
  );
}



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
  const calendarMonths = useCalendarMonths();
  const [cashFlowFilter, setCashFlowFilter] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [cashFlowCategoryFilter, setCashFlowCategoryFilter] = useState<'all' | 'party' | 'staff' | 'tax' | 'income_expense' | 'other'>('all');
  const [receivablesDateRange, setReceivablesDateRange] = useState<DateRange | undefined>(undefined);
  const [cashFlowDateRange, setCashFlowDateRange] = useState<DateRange | undefined>(undefined);
  const [taxDateRange, setTaxDateRange] = useState<DateRange | undefined>(undefined);
  const [stockDateRange, setStockDateRange] = useState<DateRange | undefined>(undefined);
  const [taxFilter, setTaxFilter] = useState<'all' | 'input' | 'output'>('all');
  const [selectedTaxId, setSelectedTaxId] = useState<string | null>(null);

    // State for new dialogs and date pickers
    const [stockSummaryOpen, setStockSummaryOpen] = useState(false);
    const [cashFlowOpen, setCashFlowOpen] = useState(false);

    const [showRecentNarration, setShowRecentNarration] = useState(false);
  
  const [recentRowsPerPage, setRecentRowsPerPage] = React.useState('20');
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = React.useState(false);
  const [selectedVoucher, setSelectedVoucher] = React.useState<any>(null);
  const { visibleCard, setVisibleCard } = useDashboard();
  const [greeting, setGreeting] = useState('');
  
  const [recentVoucherTypes, setRecentVoucherTypes] = useState<string[]>(['all']);
  const [recentDateRange, setRecentDateRange] = React.useState<DateRange | undefined>();
  const [recentFilters, setRecentFilters] = useState<Record<string, string>>({});
  /** Recent card quick chip: click -> all-time unapproved only (date/type/column filters ignore). */
  const [recentUnapprovedOnly, setRecentUnapprovedOnly] = useState(false);
  const [activeRecentFilter, setActiveRecentFilter] = useState<string | null>(null);
  const [isDateChange, setIsDateChange] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());

  const isReportsEnabled = useFeatureAccess('reports');

  const transactionDates = useMemo(() => vouchers.map(v => safeToDate(v.date)).filter(Boolean) as Date[], [vouchers]);

  useEffect(() => {
  setReceivablesDateRange(undefined);
  setCashFlowDateRange(undefined);
  setTaxDateRange(undefined);
  setStockDateRange(undefined);
}, [dateSystem]);


  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const newYearInfo = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const currentAdYear = today.getFullYear();
    const currentBsDate = adToBs(today);
    const currentBsYear = currentBsDate.y;

    const nextAdNY = new Date(currentAdYear + 1, 0, 1);
    const daysToAdNY = differenceInDays(nextAdNY, today);
    const isAdNY = today.getMonth() === 0 && today.getDate() === 1;

    const nextBsNYAdDate = bsToAd({ y: currentBsYear + 1, m: 1, d: 1});
    const daysToBsNY = differenceInDays(startOfDay(nextBsNYAdDate), today);
    const isBsNY = currentBsDate.m === 1 && currentBsDate.d === 1;

    if (isAdNY) return { event: "Happy New Year!", isNewYear: true, daysLeft: 0, year: currentAdYear };
    if (isBsNY) return { event: `Happy New Year ${currentBsYear+1} B.S.!`, isNewYear: true, daysLeft: 0, year: currentBsYear + 1 };
    
    if (daysToAdNY >= 0 && daysToAdNY <= 10) return { event: "New Year Countdown", isNewYear: false, daysLeft: daysToAdNY, year: currentAdYear + 1 };
    if (daysToBsNY >= 0 && daysToBsNY <= 10) return { event: "Nepali New Year Countdown", isNewYear: false, daysLeft: daysToBsNY, year: currentBsYear + 1 };

    return null;
  }, [liveTime]);


  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setShowFab(false);
      } else {
        setShowFab(true);
      }
      lastScrollY.current = currentScrollY;

      if (hideFabTimeout.current) clearTimeout(hideFabTimeout.current);
      hideFabTimeout.current = setTimeout(() => setShowFab(false), 3000); 
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hideFabTimeout.current) clearTimeout(hideFabTimeout.current);
    };
  }, []);

  const journalAccountNames = useMemo(() => {
    const allEntities = [
        ...processedParties,
        ...processedAccounts,
        ...processedStaff,
        ...processedTaxes,
        ...expenseAccounts,
        ...processedItems,
    ];
    const nameMap: Record<string, string> = {};
    allEntities.forEach(e => {
        nameMap[e.id] = (e as any).accountName || (e as any).name;
    });
    return nameMap;
  }, [processedParties, processedAccounts, processedStaff, processedTaxes, expenseAccounts, processedItems]);

  const fetchUserName = React.useCallback(
    async (userId: string): Promise<string> => {
        if (!userId) return "N/A";
        if (userNames[userId] && userNames[userId] !== "Unknown") return userNames[userId];
        try {
            // User doc ID may be name_uid format, so query by uid field first
            const q = query(collection(firestore, "users"), where("uid", "==", userId));
            const snap = await getDocs(q);
            let data = snap.docs[0]?.data();
            
            if (!data) {
                // Fallback: doc ID might be uid (legacy)
                const userDoc = await getDoc(doc(firestore, "users", userId));
                if (userDoc.exists()) {
                    data = userDoc.data();
                }
            }
            
            if (data) {
                // Get displayName from user document - this is the primary field
                const displayName = data.displayName || data.name || data.email || null;
                if (displayName && displayName !== userId && !displayName.match(/^[a-zA-Z0-9_-]{20,}$/)) {
                    setUserNames(prev => ({...prev, [userId]: displayName}));
                    return displayName;
                }
            }
        } catch(e) { console.error(e) }
        return "N/A"; // Return N/A instead of Unknown
    }, [userNames]
  );
  
  React.useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(vouchersLoading);
  }, [companyId, vouchersLoading]);

  React.useEffect(() => {
    if (vouchers.length > 0) {
        const uidsToFetch = new Set(vouchers.map(v => v.userId).filter(Boolean));
        uidsToFetch.forEach(uid => {
            if (!userNames[uid]) {
                fetchUserName(uid);
            }
        });
    }
  }, [vouchers, fetchUserName, userNames]);

  // ---------- FINANCIAL SUMMARY CALCULATION (Grouped) ----------
  const financialSummary = React.useMemo(() => {
    if (loading) return { 
        totalReceivable: 0, 
        totalPayable: 0, 
        receivables: { parties: [], staff: [], taxes: [] }, 
        payables: { parties: [], staff: [], taxes: [] },
        recCount: 0,
        payCount: 0
    };
    
    let filteredVouchers = vouchers;
    if (receivablesDateRange?.from) {
        const fromDate = startOfDay(receivablesDateRange.from);
        const toDate = receivablesDateRange.to ? endOfDay(receivablesDateRange.to) : endOfDay(fromDate);
        filteredVouchers = vouchers.filter(v => {
            const txDate = safeToDate(v.date);
            return txDate && txDate >= fromDate && txDate <= toDate;
        });
    }

    // Grouped Storage
    const receivables = {
        parties: [] as { party: string, balance: number, fileUrl?: string }[],
        staff: [] as { party: string, balance: number, fileUrl?: string }[],
        taxes: [] as { party: string, balance: number, fileUrl?: string }[]
    };
    const payables = {
        parties: [] as { party: string, balance: number, fileUrl?: string }[],
        staff: [] as { party: string, balance: number, fileUrl?: string }[],
        taxes: [] as { party: string, balance: number, fileUrl?: string }[]
    };

    const addToGroup = (entity: any, type: 'party' | 'staff' | 'tax') => {
        let balance = 0;
        
        balance = Number(entity.openingBalance) || 0;

        filteredVouchers.forEach(v => {
            const amount = v.total || v.amount || 0;
             if (v.partyId === entity.id) {
                if (["sale", "payment_out", "direct_income"].includes(v.type)) balance += amount;
                else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) balance -= amount;
            } else if (v.staffId === entity.id) {
                if (v.type === 'payment_out') balance += amount;
                else if (v.type === 'payment_in') balance -= amount;
                else if (v.type === 'journal' && v.subType === 'add_salary' && v.entries?.some((e: any) => e.accountId === entity.id)) {
                    const entry = v.entries.find((e: any) => e.accountId === entity.id);
                    balance -= (entry.credit || 0);
                }
            } else if (v.taxAccountId === entity.id) {
                if (v.type === 'payment_out') balance += amount;
                else if (v.type === 'payment_in') balance -= amount;
            } else if (v.lineItems?.some((li: any) => li.taxAccountId === entity.id)) {
                const taxAmount = v.lineItems.reduce(
                    (sum: number, li: any) => li.taxAccountId === entity.id ? sum + Number(li.taxAmount || 0) : sum,
                    0
                );
                if (v.type === 'purchase') balance += taxAmount;
                else if (v.type === 'sale') balance -= taxAmount;
            }
        });
        
        if (balance > 0) {
            if(type === 'party') receivables.parties.push({party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl});
            if(type === 'staff') receivables.staff.push({party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl});
            if(type === 'tax') receivables.taxes.push({party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl});
        } else if (balance < 0) {
            if(type === 'party') payables.parties.push({party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl});
            if(type === 'staff') payables.staff.push({party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl});
            if(type === 'tax') payables.taxes.push({party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl});
        }
    }

    processedParties.forEach(p => addToGroup(p, 'party'));
    processedStaff.forEach(s => addToGroup(s, 'staff'));
    processedTaxes.forEach(t => addToGroup(t, 'tax'));

    const sortFn = (a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance);
    receivables.parties.sort(sortFn); receivables.staff.sort(sortFn); receivables.taxes.sort(sortFn);
    payables.parties.sort(sortFn); payables.staff.sort(sortFn); payables.taxes.sort(sortFn);

    const calcSum = (arr: any[]) => arr.reduce((sum, item) => sum + item.balance, 0);
    const totalReceivable = calcSum(receivables.parties) + calcSum(receivables.staff) + calcSum(receivables.taxes);
    const totalPayable = calcSum(payables.parties) + calcSum(payables.staff) + calcSum(payables.taxes);

    const recCount = receivables.parties.length + receivables.staff.length + receivables.taxes.length;
    const payCount = payables.parties.length + payables.staff.length + payables.taxes.length;

    return { totalReceivable, totalPayable, receivables, payables, recCount, payCount };
  }, [processedParties, processedStaff, processedTaxes, loading, vouchers, receivablesDateRange]);

  /** Receivables/Payables dialog footer: list jo dikh rahi hai usi ka sum (card summary alag). */
  const receivablesPayablesDialogListTotals = React.useMemo(() => {
    const include = (t: "party" | "staff" | "tax") =>
      receivablePayableFilter === "all" || receivablePayableFilter === t;
    const notOB = (p: { party: string }) => p.party !== "Opening Balance";
    const { receivables, payables } = financialSummary;
    let receivableSum = 0;
    if (include("party")) receivableSum += receivables.parties.filter(notOB).reduce((s, p) => s + (Number(p.balance) || 0), 0);
    if (include("staff")) receivableSum += receivables.staff.filter(notOB).reduce((s, p) => s + (Number(p.balance) || 0), 0);
    if (include("tax")) receivableSum += receivables.taxes.filter(notOB).reduce((s, p) => s + (Number(p.balance) || 0), 0);
    let payableSum = 0;
    if (include("party")) payableSum += payables.parties.filter(notOB).reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0);
    if (include("staff")) payableSum += payables.staff.filter(notOB).reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0);
    if (include("tax")) payableSum += payables.taxes.filter(notOB).reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0);
    return { receivableSum, payableSum };
  }, [financialSummary, receivablePayableFilter]);

  /** Dialog footer: dono total ka difference — sirf jis side ka total zyada ho wahan Balance. */
  const receivablesPayablesDialogBalance = React.useMemo(() => {
    const { receivableSum, payableSum } = receivablesPayablesDialogListTotals;
    const amount = Math.abs(receivableSum - payableSum);
    if (receivableSum > payableSum) return { amount, side: "receivable" as const };
    if (payableSum > receivableSum) return { amount, side: "payable" as const };
    return { amount: 0, side: "equal" as const };
  }, [receivablesPayablesDialogListTotals]);

  /** Outstanding dialog tables: mobile par account … truncate, Amount column poora. */
  const rpDlgTableClass = cn(isMobile && "w-full table-fixed");
  const rpDlgAccountThClass = cn(isMobile && "min-w-0 w-[58%] max-w-[58%]");
  const rpDlgAmountThClass = cn("text-right", isMobile && "w-[42%] min-w-0 whitespace-nowrap");
  const rpDlgAccountTdClass = cn(isMobile && "min-w-0 max-w-0 truncate");
  const rpDlgAmountTdRecClass = cn("text-right font-medium text-green-600 dark:text-green-500", isMobile && "whitespace-nowrap tabular-nums");
  const rpDlgAmountTdPayClass = cn("text-right font-medium text-red-600 dark:text-red-500", isMobile && "whitespace-nowrap tabular-nums");

  /** Outstanding card = list-sum (All), dialog ke default totals jaisa. */
  const receivablesPayablesCardTotals = React.useMemo(() => {
    const notOB = (p: { party: string }) => p.party !== "Opening Balance";
    const { receivables, payables } = financialSummary;
    const receivableSum =
      receivables.parties.filter(notOB).reduce((s, p) => s + (Number(p.balance) || 0), 0) +
      receivables.staff.filter(notOB).reduce((s, p) => s + (Number(p.balance) || 0), 0) +
      receivables.taxes.filter(notOB).reduce((s, p) => s + (Number(p.balance) || 0), 0);
    const payableSum =
      payables.parties.filter(notOB).reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0) +
      payables.staff.filter(notOB).reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0) +
      payables.taxes.filter(notOB).reduce((s, p) => s + Math.abs(Number(p.balance) || 0), 0);
    return { receivableSum, payableSum, net: receivableSum - payableSum };
  }, [financialSummary]);

  // --- CASH FLOW CALCULATION ---
  const cashFlowDetails = React.useMemo(() => {
    let filteredVouchers = vouchers;
    if (cashFlowDateRange?.from) {
        const fromDate = startOfDay(cashFlowDateRange.from);
        const toDate = cashFlowDateRange.to ? endOfDay(cashFlowDateRange.to) : endOfDay(fromDate);
        filteredVouchers = vouchers.filter(v => {
            const txDate = safeToDate(v.date);
            return txDate && txDate >= fromDate && txDate <= toDate;
        });
    }

    type FlowItem = { id: string; name: string; amount: number; type: string };
    const inflowMap = new Map<string, FlowItem>();
    const outflowMap = new Map<string, FlowItem>();

    const getEntityType = (v: Voucher): string => {
        if(v.partyId) return 'Party';
        if(v.staffId) return 'Staff';
        if(v.taxAccountId) return 'Tax';
        if(v.incomeAccountId || v.expenseAccountId || v.toAccountId) return 'Income/Expense';
        return 'Other';
    }

    const getEntityInfo = (v: Voucher): {id: string, name: string} => {
        if(v.partyId) return {id: v.partyId, name: processedParties.find(p=>p.id === v.partyId)?.name || 'Unknown Party'};
        if(v.staffId) return {id: v.staffId, name: processedStaff.find(s=>s.id === v.staffId)?.name || 'Unknown Staff'};
        if(v.taxAccountId) return {id: v.taxAccountId, name: processedTaxes.find(t=>t.id === v.taxAccountId)?.name || 'Unknown Tax'};
        if(v.incomeAccountId) return {id: v.incomeAccountId, name: expenseAccounts.find(e=>e.id === v.incomeAccountId)?.name || 'Unknown Income'};
        if(v.expenseAccountId) return {id: v.expenseAccountId, name: expenseAccounts.find(e=>e.id === v.expenseAccountId)?.name || 'Unknown Expense'};
        if(v.toAccountId) return {id: v.toAccountId, name: expenseAccounts.find(e=>e.id === v.toAccountId)?.name || 'Unknown Account'};
        return {id: (v as any).payeeName || 'other', name: (v as any).payeeName || 'Other'};
    }

    const aggregate = (map: Map<string, FlowItem>, v: Voucher, type: string, amount: number) => {
        const info = getEntityInfo(v);
        const key = `${getEntityType(v)}-${info.id}`;
        const existing = map.get(key);
        if (existing) {
            existing.amount += amount;
        } else {
            map.set(key, { id: info.id, name: info.name, amount: amount, type: getEntityType(v) });
        }
    };
    
    filteredVouchers.forEach(v => {
        const amt = Number(v.amount || v.total || 0);
        if (v.type === 'payment_in' || v.type === 'direct_income') aggregate(inflowMap, v, v.type, amt);
        if (v.type === 'payment_out' || v.type === 'direct_expense') aggregate(outflowMap, v, v.type, amt);
    });

    const inflow = Array.from(inflowMap.values());
    const outflow = Array.from(outflowMap.values());
    
    const totalInflow = inflow.reduce((s, i) => s + i.amount, 0);
    const totalOutflow = outflow.reduce((s, i) => s + i.amount, 0);

    const categorizedInflow = inflow.reduce((acc, item) => {
        const categoryKey = item.type.replace('/', '_').toLowerCase();
        if (!acc[categoryKey]) acc[categoryKey] = [];
        acc[categoryKey].push(item);
        return acc;
    }, {} as Record<string, FlowItem[]>);

    const categorizedOutflow = outflow.reduce((acc, item) => {
        const categoryKey = item.type.replace('/', '_').toLowerCase();
        if (!acc[categoryKey]) acc[categoryKey] = [];
        acc[categoryKey].push(item);
        return acc;
    }, {} as Record<string, FlowItem[]>);


    return { categorizedInflow, categorizedOutflow, totalInflow, totalOutflow };
  }, [vouchers, cashFlowDateRange, processedParties, processedStaff, processedTaxes, expenseAccounts]);

  const taxSummary = useMemo(() => {
    if (!processedTaxes) return { totalInput: 0, totalOutput: 0, netBalance: 0, details: [] };
    const totalInput = processedTaxes.reduce((sum, tax) => sum + tax.debit, 0);
    const totalOutput = processedTaxes.reduce((sum, tax) => sum + tax.credit, 0);
    const netBalance = totalInput - totalOutput;
    return {
      totalInput,
      totalOutput,
      netBalance,
      details: processedTaxes.map(tax => ({
        id: tax.id,
        name: tax.name,
        input: tax.debit,
        output: tax.credit,
        balance: tax.debit - tax.credit,
      }))
    };
  }, [processedTaxes]);

  // 3. STOCK SUMMARY DETAILS
  const overallStockSummary = useMemo(() => {
    let filteredVouchers = vouchers;
    if (stockDateRange?.from) {
        const fromDate = startOfDay(stockDateRange.from);
        const toDate = stockDateRange.to ? endOfDay(stockDateRange.to) : endOfDay(fromDate);
        filteredVouchers = vouchers.filter(v => {
            const txDate = safeToDate(v.date);
            if (!txDate) return false;
            // Normalize transaction date to start of day for proper comparison
            const normalizedTxDate = startOfDay(txDate);
            return normalizedTxDate >= fromDate && normalizedTxDate <= toDate;
        });
    }

    let totalValue = 0;
    const itemsWithSales = processedItems.map(item => {
        const conversions = (item.unitConversions || []) as any[];
        const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
        
        const getFactorToSmallest = (unit: string): number => {
            if (!unit || conversions.length === 0 || unit === smallestUnit) return 1;
            
            let factor = 1;
            let current = unit;
            for (let i = 0; i < 10; i++) { // safety break
                const conv = conversions.find(c => c.fromUnit === current);
                if (!conv) return 0;
                factor *= Number(conv.conversionFactor) || 1;
                current = conv.toUnit;
                if (current === smallestUnit) break;
            }
            return factor;
        };

        const purchasePriceUnit = (item as any).purchasePriceUnit || smallestUnit;
        const purchasePriceFactor = getFactorToSmallest(purchasePriceUnit);
        const purchasePriceInSmallestUnit = purchasePriceFactor > 0 ? (item.purchasePrice || 0) / purchasePriceFactor : 0;
        
        const value = (item.stockQty || 0) * purchasePriceInSmallestUnit;
        totalValue += value;

        let salesQty = 0;
        let salesValue = 0;
        let purchaseQty = 0;
        let purchaseValue = 0;

        filteredVouchers.forEach(v => {
            if (v.lineItems?.some((li: any) => li.itemId === item.id)) {
                const lineItem = v.lineItems.find((li: any) => li.itemId === item.id);
                if (lineItem) {
                    const qty = Number(lineItem.quantity) || 0;
                    const lineValue = (qty * Number(lineItem.rate)) || 0;
                    const standardizedQty = qty * getFactorToSmallest(lineItem.unit);

                    if (v.type === 'sale') {
                        salesQty += standardizedQty;
                        salesValue += lineValue;
                    } else if (v.type === 'purchase') {
                        purchaseQty += standardizedQty;
                        purchaseValue += lineValue;
                    }
                }
            }
        });

        return {
            ...item,
            qty: item.stockQty || 0,
            unit: smallestUnit,
            rate: item.purchasePrice || 0,
            value: value,
            salesQty,
            salesValue,
            purchaseQty,
            purchaseValue,
            smallestUnit,
        };
    });

    // Filter items to only show those with transactions in the selected date range
    // If date range is selected, only show items that have sales or purchases in that period
    let filteredItems = itemsWithSales;
    if (stockDateRange?.from) {
        filteredItems = itemsWithSales.filter(item => 
            item.salesQty > 0 || item.purchaseQty > 0 || item.salesValue > 0 || item.purchaseValue > 0
        );
        // Recalculate totalValue based on filtered items
        totalValue = filteredItems.reduce((sum, item) => sum + item.value, 0);
    }

    const topSaleItems = [...filteredItems].filter(i => i.salesQty > 0 || i.salesValue > 0).sort((a,b) => b.salesValue - a.salesValue).slice(0, 5);
    const topPurchaseItems = [...filteredItems].filter(i => i.purchaseQty > 0 || i.purchaseValue > 0).sort((a,b) => b.purchaseValue - a.purchaseValue).slice(0, 5);

    return { items: filteredItems, totalStockValue: totalValue, topSaleItems, topPurchaseItems };
}, [processedItems, vouchers, stockDateRange]);

  const stats = React.useMemo(() => {
    if (!vouchers) return { paymentInTotal: 0, paymentOutTotal: 0, otherStats: statCardData.map(s => ({ ...s, total: 0, count: 0 })) };

    const paymentInTotal = vouchers.filter(v => v.type === 'payment_in').reduce((sum, v) => sum + (v.total || v.amount || 0), 0);
    const paymentOutTotal = vouchers.filter(v => v.type === 'payment_out').reduce((sum, v) => sum + (v.total || v.amount || 0), 0);

    const otherStats = statCardData.map((card) => {
      const filteredVouchers = vouchers.filter((v) => {
        if (card.type === 'journal') return v.type === 'journal' && !v.subType;
        if (card.type === 'add_salary') return v.type === 'journal' && v.subType === 'add_salary';
        return v.type === card.type;
      });
      
      let total = 0;
      if (card.type === 'journal' || card.type === 'add_salary' || card.type === 'contra') {
            total = filteredVouchers.reduce((sum, v) => sum + Number(getTransactionAmounts(v).debit), 0);
      } else {
            total = filteredVouchers.reduce((sum, v) => sum + Number(v.total || v.amount || 0), 0);
      }

      return { ...card, total, count: filteredVouchers.length };
    });

    return { paymentInTotal, paymentOutTotal, otherStats };
  }, [vouchers]);
  
  // Unapproved quick filter: force all-time + all types + clear table column filters.
  const effectiveRecentDateRange = recentUnapprovedOnly ? undefined : recentDateRange;
  const effectiveRecentFilters = recentUnapprovedOnly ? {} : recentFilters;
  const effectiveRecentVoucherTypes = recentUnapprovedOnly ? ['all'] : recentVoucherTypes;
  const { daybookTransactions: allRecentTransactions } = useTransactions(
    { id: 'daybook', items: [] },
    'daybook',
    effectiveRecentDateRange,
    undefined,
    processedAccounts,
    vouchers,
    undefined,
    effectiveRecentFilters,
    effectiveRecentVoucherTypes,
    journalAccountNames,
    userNames
  );

  const recentTransactions = useMemo(() => {
    if (!allRecentTransactions) return [];
    let sorted = [...allRecentTransactions].sort((a, b) => {
        const dateA = safeToDate(a.date)?.getTime() || 0;
        const dateB = safeToDate(b.date)?.getTime() || 0;
        if (dateB !== dateA) return dateB - dateA;
        const creationA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const creationB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return creationB - creationA;
      });
    if (recentUnapprovedOnly) {
      // Approval pending = isApproved true nahin (same highlight logic as row styling).
      sorted = sorted.filter((tx) => (tx as any).isApproved !== true);
      return sorted;
    }
    const limit = Number(recentRowsPerPage);
    if (!isNaN(limit) && limit > 0) sorted = sorted.slice(0, limit);
    return sorted;
  }, [allRecentTransactions, recentRowsPerPage, recentUnapprovedOnly]);
  
  const handlePrint = () => {
    const shouldInclude = (type: 'party' | 'staff' | 'tax') => {
        if (receivablePayableFilter === 'all') return true;
        return receivablePayableFilter === type;
    };
    const calculateFilteredTotal = (list: typeof financialSummary.receivables) => {
        let sum = 0;
        if (shouldInclude('party')) sum += list.parties.reduce((s, i) => s + i.balance, 0);
        if (shouldInclude('staff')) sum += list.staff.reduce((s, i) => s + i.balance, 0);
        if (shouldInclude('tax')) sum += list.taxes.reduce((s, i) => s + i.balance, 0);
        return sum;
    };
    const printTotalReceivable = calculateFilteredTotal(financialSummary.receivables);
    const printTotalPayable = calculateFilteredTotal(financialSummary.payables);
    const excludeOpeningBalance = (arr: { party: string; balance: number }[]) => arr.filter(p => p.party !== "Opening Balance");
    const buildTableBody = (list: typeof financialSummary.receivables, typeColor: string) => {
        const body: any[] = [['Party/Staff/Tax', { text: 'Amount', alignment: 'right' }]];
        const parties = excludeOpeningBalance(list.parties);
        const staff = excludeOpeningBalance(list.staff);
        const taxes = excludeOpeningBalance(list.taxes);
        if (shouldInclude('party') && parties.length > 0) {
            body.push([{ text: 'Parties', bold: true, fillColor: '#f3f4f6' }, { text: '', fillColor: '#f3f4f6' }]);
            parties.forEach(item => body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), {noSuffix: true, noAnimation: true}), alignment: 'right' }]));
        }
        if (shouldInclude('staff') && staff.length > 0) {
            body.push([{ text: 'Staff', bold: true, fillColor: '#f3f4f6' }, { text: '', fillColor: '#f3f4f6' }]);
            staff.forEach(item => body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), {noSuffix: true, noAnimation: true}), alignment: 'right' }]));
        }
        if (shouldInclude('tax') && taxes.length > 0) {
            body.push([{ text: 'Taxes', bold: true, fillColor: '#f3f4f6' }, { text: '', fillColor: '#f3f4f6' }]);
            taxes.forEach(item => body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), {noSuffix: true, noAnimation: true}), alignment: 'right' }]));
        }
        return body;
    };
    const receivablesBody = buildTableBody(financialSummary.receivables, '#059669');
    const payablesBody = buildTableBody(financialSummary.payables, '#DC2626');
    receivablesBody.push([{ text: 'Total Receivable', bold: true, alignment: 'right'}, { text: formatCurrencyForPrint(printTotalReceivable, {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#059669' }]);
    payablesBody.push([{ text: 'Total Payable', bold: true, alignment: 'right'}, { text: formatCurrencyForPrint(Math.abs(printTotalPayable), {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#DC2626' }]);
    const printRecCount = (shouldInclude('party') ? financialSummary.receivables.parties.length : 0) + (shouldInclude('staff') ? financialSummary.receivables.staff.length : 0) + (shouldInclude('tax') ? financialSummary.receivables.taxes.length : 0);
    const printPayCount = (shouldInclude('party') ? financialSummary.payables.parties.length : 0) + (shouldInclude('staff') ? financialSummary.payables.staff.length : 0) + (shouldInclude('tax') ? financialSummary.payables.taxes.length : 0);

    // FIXED: Format Date based on System
    const asOfDate = dateSystem === 'BS' ? formatDateBS(new Date()) : formatDate(new Date());

    openPrintDirect({
        company: { name: company?.name || '', pan: company?.pan, phone: company?.phone, address: company?.address, decimalPlaces: company?.decimalPlaces, showDrCr: company?.showDrCr, showCurrencySymbol: company?.showCurrencySymbol, logoUrl: company?.logoUrl },
        dateSystem: dateSystem,
        title: `Receivables & Payables (${receivablePayableFilter.toUpperCase()})`,
        context: "daybook",
        dateRangeText: `As of ${asOfDate}`,
        vouchersCount: printRecCount + printPayCount,
        openingBalance: 0,
        transactions: [],
        showNarration: false,
        customContent: [
          {
            columns: [
              {
                width: '*',
                stack: [
                  { text: 'Receivables', style: 'subheader', color: '#059669' },
                  {
                    table: {
                      headerRows: 1,
                      widths: ['*', 'auto'],
                      body: receivablesBody
                    },
                    layout: 'lightHorizontalLines',
                    margin: [0, 5, 0, 15]
                  },
                ]
              },
              {
                width: '*',
                stack: [
                  { text: 'Payables', style: 'subheader', color: '#DC2626' },
                  {
                    table: {
                      headerRows: 1,
                      widths: ['*', 'auto'],
                      body: payablesBody
                    },
                      layout: 'lightHorizontalLines'
                  }
                ]
              }
            ],
            columnGap: 20
          }
        ]
    }, true);
  }

  const handlePrintCashFlow = () => {
      let dateRangeText = "All Time";
      if(cashFlowDateRange?.from) {
        const from = cashFlowDateRange.from;
        const to = cashFlowDateRange.to || from;
        const fromBS = formatDateBS(from);
        const toBS = formatDateBS(to);
        const fromAD = formatDate(from);
        const toAD = formatDate(to);
        if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
        else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
        else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
      }
      
      const showIn = cashFlowFilter === 'all' || cashFlowFilter === 'inflow';
      const showOut = cashFlowFilter === 'all' || cashFlowFilter === 'outflow';
      
      const inBody: any[] = [['Source', { text: 'Amount', alignment: 'right' }]];
      if(showIn) {
        Object.entries(cashFlowDetails.categorizedInflow).forEach(([category, items]) => {
          // Normalize categories for comparison: remove spaces, lowercase
          const catNormal = category.toLowerCase().replace(/\s+/g, '');
          const filterNormal = cashFlowCategoryFilter.toLowerCase().replace(/\s+/g, '');
          
          if (cashFlowCategoryFilter === 'all' || catNormal === filterNormal || (filterNormal === 'income_expense' && catNormal === 'income/expense') || (filterNormal === 'income_expense' && catNormal.includes('income'))) {
              inBody.push([{text: category.replace('_', ' / ').toUpperCase(), bold: true, fillColor: '#f3f4f6', colSpan: 2}, {}]);
              items.forEach(i => inBody.push([i.name, {text: formatCurrencyForPrint(i.amount, {noSuffix: true, noAnimation: true}), alignment: 'right'}]));
          }
        });
          inBody.push([{text: 'Total Inflow', bold: true}, {text: formatCurrencyForPrint(cashFlowDetails.totalInflow, {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#059669'}]);
      }
      
      const outBody: any[] = [['Destination', { text: 'Amount', alignment: 'right' }]];
      if(showOut) {
        Object.entries(cashFlowDetails.categorizedOutflow).forEach(([category, items]) => {
            // Normalize categories for comparison
            const catNormal = category.toLowerCase().replace(/\s+/g, '');
            const filterNormal = cashFlowCategoryFilter.toLowerCase().replace(/\s+/g, '');

            if (cashFlowCategoryFilter === 'all' || catNormal === filterNormal || (filterNormal === 'income_expense' && catNormal === 'income/expense') || (filterNormal === 'income_expense' && catNormal.includes('expense'))) {
                outBody.push([{text: category.replace('_', ' / ').toUpperCase(), bold: true, fillColor: '#f3f4f6', colSpan: 2}, {}]);
                items.forEach(i => outBody.push([i.name, {text: formatCurrencyForPrint(i.amount, {noSuffix: true, noAnimation: true}), alignment: 'right'}]));
            }
        });
          outBody.push([{text: 'Total Outflow', bold: true}, {text: formatCurrencyForPrint(cashFlowDetails.totalOutflow, {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#DC2626'}]);
      }

      openPrintDirect({
        company: { name: company?.name || '', address: company?.address, phone: company?.phone, pan: company?.pan, logoUrl: company?.logoUrl },
        dateSystem, 
        title: `Cash Flow (${cashFlowFilter.toUpperCase()} - ${cashFlowCategoryFilter.toUpperCase().replace('_', ' / ')})`, 
        dateRangeText,
        context: 'daybook', vouchersCount: 0, openingBalance: 0, transactions: [],
        customContent: [{ columns: [
            showIn ? { width: '*', stack: [{ text: 'Inflow', style: 'subheader', color: '#059669' }, { table: { widths: ['*', 'auto'], body: inBody }, layout: 'lightHorizontalLines' }] } : {width: 0, text: ''}, 
            showOut ? { width: '*', stack: [{ text: 'Outflow', style: 'subheader', color: '#DC2626' }, { table: { widths: ['*', 'auto'], body: outBody }, layout: 'lightHorizontalLines' }] } : {width: 0, text: ''}
        ], columnGap: 20 }]
    }, true);
  }

    const handlePrintTax = () => {
    let dateRangeText = "All Time";
    if(taxDateRange?.from) {
      const from = taxDateRange.from;
      const to = taxDateRange.to || from;
      const fromBS = formatDateBS(from);
      const toBS = formatDateBS(to);
      const fromAD = formatDate(from);
      const toAD = formatDate(to);
      if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
      else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
      else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }

      const showInput = taxFilter === 'all' || taxFilter === 'input';
      const showOutput = taxFilter === 'all' || taxFilter === 'output';

      const body: any[] = [['Tax Account', 
          ...(showInput ? [{ text: 'Input (Paid)', alignment: 'right' }] : []), 
          ...(showOutput ? [{ text: 'Output (Collected)', alignment: 'right' }] : []), 
          { text: 'Net', alignment: 'right' }]];
          
      taxSummary.details.forEach(t => {
          body.push([t.name, 
            ...(showInput ? [{ text: formatCurrencyForPrint(t.input, {noSuffix: true, noAnimation: true}), alignment: 'right', color: '#059669' }] : []), 
            ...(showOutput ? [{ text: formatCurrencyForPrint(t.output, {noSuffix: true, noAnimation: true}), alignment: 'right', color: '#DC2626' }] : []),
            { text: formatCurrencyForPrint(Math.abs(t.balance), {noSuffix: true, noAnimation: true}) + (t.balance >= 0 ? ' Dr' : ' Cr'), alignment: 'right', bold: true }
          ]);
      });
      openPrintDirect({
        company: { name: company?.name || '', address: company?.address, phone: company?.phone, pan: company?.pan, logoUrl: company?.logoUrl },
        dateSystem, 
        title: `Tax Summary (${taxFilter.toUpperCase()})`, 
        dateRangeText: dateRangeText,
        context: 'daybook', vouchersCount: 0, openingBalance: 0, transactions: [],
        customContent: [{ table: { widths: ['*', ...(showInput ? ['auto'] : []), ...(showOutput ? ['auto'] : []), 'auto'], body }, layout: 'lightHorizontalLines' }]
    }, true);
  }

  const handlePrintStock = () => {
      try {
          let dateRangeText = "All Time";
          if(stockDateRange?.from) {
            const from = stockDateRange.from;
            const to = stockDateRange.to || from;
            const fromBS = formatDateBS(from);
            const toBS = formatDateBS(to);
            const fromAD = formatDate(from);
            const toAD = formatDate(to);
            if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
            else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
            else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
          }

          const body: any[] = [
              [
                  { text: 'Item Name', bold: true, fontSize: 8 }, 
                  { text: 'Qty', bold: true, fontSize: 8, alignment: 'right' }, 
                  { text: 'Rate', bold: true, fontSize: 8, alignment: 'right' }, 
                  { text: 'Value', bold: true, fontSize: 8, alignment: 'right' }
              ]
          ];
          overallStockSummary.items.forEach(i => {
              body.push([
                  { text: i.name, fontSize: 7, noWrap: false }, 
                  { text: `${i.qty.toFixed(2)} ${i.unit}`, fontSize: 7, alignment: 'right' }, 
                  { text: formatCurrency(i.rate, {noSuffix: true, noAnimation: true}), fontSize: 7, alignment: 'right' }, 
                  { text: formatCurrency(i.value, {noSuffix: true, noAnimation: true}), fontSize: 7, alignment: 'right' }
              ]);
          });
          body.push([
              {text: 'Total Stock Value', bold: true, fontSize: 8, colSpan: 3}, 
              {}, 
              {}, 
              {text: formatCurrency(overallStockSummary.totalStockValue, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 8, alignment: 'right'}
          ]);

          openPrintDirect({
            company: { name: company?.name || '', address: company?.address, phone: company?.phone, pan: company?.pan, logoUrl: company?.logoUrl },
            dateSystem, title: "Stock Summary", dateRangeText: dateRangeText,
            context: 'daybook', vouchersCount: 0, openingBalance: 0, transactions: [],
            customContent: [{ 
                table: { 
                    widths: ['*', 65, 65, 75], // Flexible first column, compact fixed widths for A4 paper (total ~205 + flexible)
                    body 
                }, 
                layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0,
                    paddingLeft: () => 2,
                    paddingRight: () => 2,
                    paddingTop: () => 2,
                    paddingBottom: () => 2,
                }
            }]
          }, true);
      } catch (error) {
          console.error("Error printing stock summary:", error);
      }
  }

  const isRecentFilterActive = useMemo(
    () =>
      recentDateRange !== undefined ||
      (recentVoucherTypes.length > 0 && !recentVoucherTypes.includes('all')) ||
      Object.values(recentFilters).some(v => v) ||
      recentUnapprovedOnly,
    [recentDateRange, recentVoucherTypes, recentFilters, recentUnapprovedOnly]
  );
  const clearRecentFilters = () => {
    setRecentDateRange(undefined);
    setRecentVoucherTypes(['all']);
    setRecentFilters({});
    setRecentUnapprovedOnly(false);
  };
  const applyRecentUnapprovedFilter = () => {
    // User request: button click = all-time unapproved vouchers only.
    setRecentUnapprovedOnly(true);
    setRecentDateRange(undefined);
    setRecentVoucherTypes(['all']);
    setRecentFilters({});
    setActiveRecentFilter(null);
    setRecentRowsPerPage('0');
  };
  
  const taxBreakdownData = useMemo(() => {
    if (!selectedTaxId) return { inputs: [], outputs: [] };
    const tax = processedTaxes.find(t => t.id === selectedTaxId);
    if (!tax) return { inputs: [], outputs: [] };

    const inputs: any[] = [];
    const outputs: any[] = [];

    vouchers.forEach(v => {
      let taxAmount = 0;
      let partyName = "";
      
      // Direct Tax Payment
      if (v.taxAccountId === selectedTaxId) {
          if (v.type === 'payment_out') { // Tax Paid
              inputs.push({ voucherType: v.type, voucherNumber: v.voucherNumber, account: "Bank/Cash", taxAmount: v.amount, date: v.date });
          } else if (v.type === 'payment_in') { // Tax Refund
              outputs.push({ voucherType: v.type, voucherNumber: v.voucherNumber, account: "Bank/Cash", taxAmount: v.amount, date: v.date });
          }
      }

      // Tax from Line Items
      if (v.lineItems) {
        v.lineItems.forEach((line: any) => {
          if (line.taxAccountId === selectedTaxId && line.taxAmount) {
            taxAmount = line.taxAmount;
            const party = processedParties.find(p => p.id === v.partyId);
            partyName = party?.name || "N/A";
            
            if (v.type === 'purchase') {
              inputs.push({ voucherType: v.type, voucherNumber: v.voucherNumber, account: partyName, taxAmount, date: v.date });
            } else if (v.type === 'sale') {
              outputs.push({ voucherType: v.type, voucherNumber: v.voucherNumber, account: partyName, taxAmount, date: v.date });
            }
          }
        });
      }
    });

    return { inputs, outputs };
  }, [selectedTaxId, vouchers, processedTaxes, processedParties]);

  const displayTransactionDate = (date: any) => {
    const d = safeToDate(date);
    if (!d) return "Invalid Date";
    return dateSystem === 'AD' ? formatDate(d) : formatDateBS(d);
  };


  const renderFinancialSummaries = (reportsEnabled: boolean) => {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-0.5 px-0.5'>
        {can("view_receivable_payable_summary") && (
            <Card className="col-span-1 transition-colors border-foreground/20">
                <CardHeader className="flex flex-row items-center justify-between p-4 space-y-0">
                    <CardTitle className="text-base whitespace-nowrap text-card-foreground">Outstanding</CardTitle>
                    <MonthYearFilter dateRange={receivablesDateRange} setDateRange={setReceivablesDateRange} dateSystem={dateSystem} />
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                    <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">To Receive</span><span className="text-base font-bold text-green-600">{formatCurrency(receivablesPayablesCardTotals.receivableSum, {noSuffix: true})} <span className="text-xs">Dr</span></span></div>
                    <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">To Pay</span><span className="text-base font-bold text-red-600">{formatCurrency(receivablesPayablesCardTotals.payableSum, {noSuffix: true})} <span className="text-xs">Cr</span></span></div>
                    <div className="flex items-baseline justify-between pt-2 mt-2 border-t"><span className="text-sm font-bold">Net</span><span className={cn('text-lg font-bold', receivablesPayablesCardTotals.net >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(receivablesPayablesCardTotals.net, { showDrCr: true })}</span></div>
                    {reportsEnabled && (
                        <div className="text-right pt-2">
                            <Dialog open={receivablesPayablesOpen} onOpenChange={(open) => {
                              setReceivablesPayablesOpen(open);
                              if (!open) setReceivablesPayablesTab('receivables');
                            }}>
                                <DialogTrigger asChild>
                                    <Button variant="link" size="sm" className="h-auto p-0">View Details</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-6xl p-0 h-[90vh] rounded-lg flex flex-col">
                                    <DialogHeader className="p-4 border-b flex flex-col gap-3">
                                        {/* Title Row - Mobile: Title + Close Icon */}
                                        <div className="flex items-center justify-between">
                                            <DialogTitle className="whitespace-nowrap text-base md:text-lg">Receivables & Payables Details</DialogTitle>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-6 w-6 md:h-8 md:w-8"
                                                onClick={() => setReceivablesPayablesOpen(false)}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        
                                        {/* Filter Tabs Row */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="flex bg-muted rounded-md p-1 space-x-1 flex-1 min-w-0">
                                                {['all', 'party', 'staff', 'tax'].map((type) => (
                                                    <button 
                                                        key={type} 
                                                        onClick={() => setReceivablePayableFilter(type as any)} 
                                                        className={cn(
                                                            "px-2 md:px-3 py-1 text-xs rounded-sm transition-all capitalize font-medium whitespace-nowrap",
                                                            receivablePayableFilter === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                                        )}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrint();
                                                }} 
                                                className="flex items-center gap-2 shrink-0"
                                            >
                                                Print <Printer className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        
                                        {/* Receivables/Payables Tabs - Mobile Only */}
                                        {isMobile && (
                                            <div className="flex bg-muted rounded-md p-1 space-x-1">
                                                <button 
                                                    onClick={() => setReceivablesPayablesTab('receivables')} 
                                                    className={cn(
                                                        "px-4 py-2 text-sm rounded-sm transition-all font-medium flex-1",
                                                        receivablesPayablesTab === 'receivables' 
                                                            ? "bg-background text-green-600 shadow-sm" 
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    Receivables ({financialSummary.recCount})
                                                </button>
                                                <button 
                                                    onClick={() => setReceivablesPayablesTab('payables')} 
                                                    className={cn(
                                                        "px-4 py-2 text-sm rounded-sm transition-all font-medium flex-1",
                                                        receivablesPayablesTab === 'payables' 
                                                            ? "bg-background text-red-600 shadow-sm" 
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    Payables ({financialSummary.payCount})
                                                </button>
                                            </div>
                                        )}
                                    </DialogHeader>
                                    <>
                                    <div className={cn(
                                        "gap-4 p-4 flex-1 min-h-0",
                                        isMobile ? "flex flex-col" : "grid grid-cols-2"
                                    )}>
                                        {/* Receivables Section */}
                                        {(isMobile ? receivablesPayablesTab === 'receivables' : true) && (
                                            <div className="flex flex-col min-h-0">
                                                {!isMobile && <h3 className="text-lg font-semibold mb-2 text-green-600">Receivables ({financialSummary.recCount})</h3>}
                                                <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                    <ScrollArea className="flex-1 min-w-0">
                                                        <Table className={rpDlgTableClass}>
                                                            <TableHeader className="[&_tr]:bg-sky-100/90 dark:[&_tr]:bg-sky-950/45 [&_th]:text-sky-950 dark:[&_th]:text-sky-100">
                                                                <TableRow>
                                                                    <TableHead className={rpDlgAccountThClass}>Account</TableHead>
                                                                    <TableHead className={rpDlgAmountThClass}>Amount</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {(receivablePayableFilter === 'all' || receivablePayableFilter === 'party') && financialSummary.receivables.parties.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell className={rpDlgAccountTdClass} title={isMobile ? p.party : undefined}>{p.party}</TableCell><TableCell className={rpDlgAmountTdRecClass}>{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                {(receivablePayableFilter === 'all' || receivablePayableFilter === 'staff') && financialSummary.receivables.staff.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell className={rpDlgAccountTdClass} title={isMobile ? p.party : undefined}>{p.party}</TableCell><TableCell className={rpDlgAmountTdRecClass}>{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                {(receivablePayableFilter === 'all' || receivablePayableFilter === 'tax') && financialSummary.receivables.taxes.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell className={rpDlgAccountTdClass} title={isMobile ? p.party : undefined}>{p.party}</TableCell><TableCell className={rpDlgAmountTdRecClass}>{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                            </TableBody>
                                                        </Table>
                                                    </ScrollArea>
                                                    <div className="p-2 border-t font-bold flex justify-between bg-emerald-50/90 dark:bg-emerald-950/35"><span>Total Receivable</span><span className="text-green-700 dark:text-green-400 tabular-nums">{formatCurrency(receivablesPayablesDialogListTotals.receivableSum, {noSuffix: true})}</span></div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Payables Section */}
                                        {(isMobile ? receivablesPayablesTab === 'payables' : true) && (
                                            <div className="flex flex-col min-h-0">
                                                {!isMobile && <h3 className="text-lg font-semibold mb-2 text-red-600">Payables ({financialSummary.payCount})</h3>}
                                                <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                    <ScrollArea className="flex-1 min-w-0">
                                                        <Table className={rpDlgTableClass}>
                                                            <TableHeader className="[&_tr]:bg-sky-100/90 dark:[&_tr]:bg-sky-950/45 [&_th]:text-sky-950 dark:[&_th]:text-sky-100">
                                                                <TableRow>
                                                                    <TableHead className={rpDlgAccountThClass}>Account</TableHead>
                                                                    <TableHead className={rpDlgAmountThClass}>Amount</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {(receivablePayableFilter === 'all' || receivablePayableFilter === 'party') && financialSummary.payables.parties.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell className={rpDlgAccountTdClass} title={isMobile ? p.party : undefined}>{p.party}</TableCell><TableCell className={rpDlgAmountTdPayClass}>{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                {(receivablePayableFilter === 'all' || receivablePayableFilter === 'staff') && financialSummary.payables.staff.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell className={rpDlgAccountTdClass} title={isMobile ? p.party : undefined}>{p.party}</TableCell><TableCell className={rpDlgAmountTdPayClass}>{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                {(receivablePayableFilter === 'all' || receivablePayableFilter === 'tax') && financialSummary.payables.taxes.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell className={rpDlgAccountTdClass} title={isMobile ? p.party : undefined}>{p.party}</TableCell><TableCell className={rpDlgAmountTdPayClass}>{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                            </TableBody>
                                                        </Table>
                                                    </ScrollArea>
                                                    <div className="p-2 border-t font-bold flex justify-between bg-emerald-50/90 dark:bg-emerald-950/35"><span>Total Payable</span><span className="text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(receivablesPayablesDialogListTotals.payableSum, {noSuffix: true})}</span></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {!isMobile && receivablesPayablesDialogBalance.side !== "equal" && receivablesPayablesDialogBalance.amount > 0 && (
                                        <div className="px-4 pb-4">
                                            <div className="rounded-lg border border-border bg-gradient-to-br from-green-50/90 via-muted/40 to-red-50/90 dark:from-green-950/35 dark:via-background dark:to-red-950/35 p-3 shadow-sm">
                                                {receivablesPayablesDialogBalance.side === "receivable" && (
                                                    <div className="flex w-full flex-wrap items-baseline justify-start gap-x-2 gap-y-0">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
                                                        <span className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">{formatCurrency(receivablesPayablesDialogBalance.amount, { noSuffix: true })} <span className="text-xs font-normal">Dr</span></span>
                                                    </div>
                                                )}
                                                {receivablesPayablesDialogBalance.side === "payable" && (
                                                    <div className="flex w-full flex-wrap items-baseline justify-end gap-x-2 gap-y-0">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
                                                        <span className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(receivablesPayablesDialogBalance.amount, { noSuffix: true })} <span className="text-xs font-normal">Cr</span></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {isMobile && receivablesPayablesTab === 'receivables' && receivablesPayablesDialogBalance.side === "receivable" && receivablesPayablesDialogBalance.amount > 0 && (
                                        <div className="px-4 pb-4">
                                            <div className="rounded-lg border border-green-200/80 bg-green-50/90 dark:border-green-900 dark:bg-green-950/40 p-3 shadow-sm">
                                                <div className="flex flex-wrap items-baseline justify-start gap-x-2 gap-y-0">
                                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
                                                    <span className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{formatCurrency(receivablesPayablesDialogBalance.amount, { noSuffix: true })} <span className="text-sm font-normal">Dr</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {isMobile && receivablesPayablesTab === 'payables' && receivablesPayablesDialogBalance.side === "payable" && receivablesPayablesDialogBalance.amount > 0 && (
                                        <div className="px-4 pb-4">
                                            <div className="rounded-lg border border-red-200/80 bg-red-50/90 dark:border-red-900 dark:bg-red-950/40 p-3 shadow-sm">
                                                <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0">
                                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
                                                    <span className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(receivablesPayablesDialogBalance.amount, { noSuffix: true })} <span className="text-sm font-normal">Cr</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    </>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>
          )}
          
        {can("view_payment_in_out_summary") && (
            <Card className="col-span-1 transition-colors border-foreground/20">
              <CardHeader className="flex flex-row items-center justify-between p-4 space-y-0">
                <CardTitle className="text-base whitespace-nowrap">Cash Flow</CardTitle>
                <MonthYearFilter dateRange={cashFlowDateRange} setDateRange={setCashFlowDateRange} dateSystem={dateSystem} />
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">Payment In</span><span className="text-base font-bold text-green-600">{formatCurrency(cashFlowDetails.totalInflow, {noSuffix: true})} <span className="text-xs">Dr</span></span></div>
                <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">Payment Out</span><span className="text-base font-bold text-red-600">{formatCurrency(cashFlowDetails.totalOutflow, {noSuffix: true})} <span className="text-xs">Cr</span></span></div>
                <div className="flex items-baseline justify-between pt-2 mt-2 border-t"><span className="text-sm font-bold">Net Flow</span><span className={cn('text-lg font-bold', (cashFlowDetails.totalInflow - cashFlowDetails.totalOutflow) >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(Math.abs(cashFlowDetails.totalInflow - cashFlowDetails.totalOutflow), { noSuffix: true, duration: 2 })} <span className="text-xs">{(cashFlowDetails.totalInflow - cashFlowDetails.totalOutflow) >= 0 ? 'Dr' : 'Cr'}</span></span></div>
                {isReportsEnabled && (
                    <div className="text-right pt-2">
                        <Dialog open={cashFlowOpen} onOpenChange={setCashFlowOpen}>
                            <DialogTrigger asChild><Button variant="link" size="sm" className="h-auto p-0">View Details</Button></DialogTrigger>
                            <DialogContent className="max-w-6xl p-0 h-[90vh] rounded-lg flex flex-col">
                                <DialogHeader className="p-4 border-b flex flex-row justify-between items-center">
                                    <div className="flex flex-col"><DialogTitle>Cash Flow Details</DialogTitle></div>
                                    <div className="flex items-center gap-2 mr-12">
                                        <MonthYearFilter dateRange={cashFlowDateRange} setDateRange={setCashFlowDateRange} dateSystem={dateSystem} />
                                        <div className="flex bg-muted rounded-md p-1 mr-2 space-x-1">{['all', 'inflow', 'outflow'].map((type) => (<button key={type} onClick={() => setCashFlowFilter(type as any)} className={cn("px-3 py-1 text-xs rounded-sm transition-all capitalize font-medium", cashFlowFilter === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{type}</button>))}</div>
                                        <Button variant="outline" size="sm" onClick={handlePrintCashFlow} className="flex items-center gap-2">Print <Printer className="h-4 w-4" /></Button>
                                    </div>
                                </DialogHeader>
                                <div className="flex flex-1 min-h-0">
                                    <div className="w-64 border-r p-2 space-y-1">
                                        <Button variant={cashFlowCategoryFilter === 'all' ? 'secondary' : 'ghost'} className="w-full justify-start capitalize" onClick={() => setCashFlowCategoryFilter('all')}>All</Button>
                                        <Button variant={cashFlowCategoryFilter === 'party' ? 'secondary' : 'ghost'} className="w-full justify-start capitalize" onClick={() => setCashFlowCategoryFilter('party')}>Party</Button>
                                        <Button variant={cashFlowCategoryFilter === 'staff' ? 'secondary' : 'ghost'} className="w-full justify-start capitalize" onClick={() => setCashFlowCategoryFilter('staff')}>Staff</Button>
                                        <Button variant={cashFlowCategoryFilter === 'tax' ? 'secondary' : 'ghost'} className="w-full justify-start capitalize" onClick={() => setCashFlowCategoryFilter('tax')}>Tax</Button>
                                        <Button variant={cashFlowCategoryFilter === 'income_expense' ? 'secondary' : 'ghost'} className="w-full justify-start capitalize" onClick={() => setCashFlowCategoryFilter('income_expense')}>Income / Expense</Button>
                                        <Button variant={cashFlowCategoryFilter === 'other' ? 'secondary' : 'ghost'} className="w-full justify-start capitalize" onClick={() => setCashFlowCategoryFilter('other')}>Other</Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 flex-1 min-h-0">
                                        {(cashFlowFilter === 'all' || cashFlowFilter === 'inflow') && (
                                            <div className="flex flex-col min-h-0">
                                                <h3 className="text-lg font-semibold mb-2 text-green-600">Inflow</h3>
                                                <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                    <ScrollArea className="flex-1 min-w-0">
                                                        <Table className="w-full table-fixed">
                                                            <TableBody>
                                                                {Object.entries(cashFlowDetails.categorizedInflow).map(([category, items]) => { 
                                                                    if(cashFlowCategoryFilter !== 'all' && cashFlowCategoryFilter.replace('_', ' / ').toLowerCase() !== category.toLowerCase()) return null; 
                                                                    return ( <React.Fragment key={`in-${category}`}><TableRow className="bg-muted/50"><TableCell colSpan={2} className="font-bold text-xs uppercase">{category.replace('_', ' / ')}</TableCell></TableRow>{items.map((i) => (
                                                                    <TableRow key={i.id}>
                                                                      <TableCell className="pl-6 w-[58%] min-w-0 max-w-[58%] truncate align-middle" title={i.name}>
                                                                        {i.name}
                                                                      </TableCell>
                                                                      <TableCell className="w-[42%] text-right text-green-600 whitespace-nowrap tabular-nums align-middle pr-3 pl-1">
                                                                        {formatCurrency(i.amount, {noSuffix: true})}
                                                                      </TableCell>
                                                                    </TableRow>
                                                                  ))}</React.Fragment> )
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </ScrollArea>
                                                    <div className="p-2 border-t font-bold flex justify-between"><span>Total In</span><span className="text-green-600">{formatCurrency(cashFlowDetails.totalInflow, {noSuffix: true})}</span></div>
                                                </div>
                                            </div>
                                        )}
                                        {(cashFlowFilter === 'all' || cashFlowFilter === 'outflow') && (
                                            <div className="flex flex-col min-h-0">
                                                <h3 className="text-lg font-semibold mb-2 text-red-600">Outflow</h3>
                                                <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                    <ScrollArea className="flex-1 min-w-0">
                                                        <Table className="w-full table-fixed">
                                                            <TableBody>
                                                                {Object.entries(cashFlowDetails.categorizedOutflow).map(([category, items]) => { 
                                                                    if(cashFlowCategoryFilter !== 'all' && cashFlowCategoryFilter.replace('_', ' / ').toLowerCase() !== category.toLowerCase()) return null; 
                                                                    return ( <React.Fragment key={`out-${category}`}><TableRow className="bg-muted/50"><TableCell colSpan={2} className="font-bold text-xs uppercase">{category.replace('_', ' / ')}</TableCell></TableRow>{items.map((i) => (
                                                                    <TableRow key={i.id}>
                                                                      <TableCell className="pl-6 w-[58%] min-w-0 max-w-[58%] truncate align-middle" title={i.name}>
                                                                        {i.name}
                                                                      </TableCell>
                                                                      <TableCell className="w-[42%] text-right text-red-600 whitespace-nowrap tabular-nums align-middle pr-3 pl-1">
                                                                        {formatCurrency(i.amount, {noSuffix: true})}
                                                                      </TableCell>
                                                                    </TableRow>
                                                                  ))}</React.Fragment> )
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </ScrollArea>
                                                    <div className="p-2 border-t font-bold flex justify-between"><span>Total Out</span><span className="text-red-600">{formatCurrency(cashFlowDetails.totalOutflow, {noSuffix: true})}</span></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}
              </CardContent>
            </Card>
        )}
  
            <Card className="col-span-1 transition-colors border-foreground/20">
                <CardHeader className="flex flex-row items-center justify-between p-4 space-y-0">
                    <CardTitle className="text-base whitespace-nowrap">Tax Summary</CardTitle>
                    <MonthYearFilter dateRange={taxDateRange} setDateRange={setTaxDateRange} dateSystem={dateSystem} />
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                    <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">Input Tax (Paid)</span><span className="text-sm font-bold text-green-600">{formatCurrency(taxSummary.totalInput, {noSuffix: true})} <span className="text-xs">Dr</span></span></div>
                    <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">Output Tax (Liability)</span><span className="text-sm font-bold text-red-600">{formatCurrency(taxSummary.totalOutput, {noSuffix: true})} <span className="text-xs">Cr</span></span></div>
                    <div className="flex items-baseline justify-between pt-2 mt-2 border-t"><span className="text-sm font-bold">Net Balance</span><span className={cn('text-base font-bold', taxSummary.netBalance <= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(taxSummary.netBalance, {showDrCr: true})}</span></div>
                    {isReportsEnabled && (
                        <div className="text-right pt-2">
                             <Dialog open={taxSummaryOpen} onOpenChange={setTaxSummaryOpen}>
                                <DialogTrigger asChild><Button variant="link" size="sm" className="h-auto p-0">View Details</Button></DialogTrigger>
                                <DialogContent className="max-w-6xl p-0 h-[90vh] rounded-lg flex flex-col">
                                    <DialogHeader className="p-4 border-b flex flex-row justify-between items-center">
                                        <div className="flex flex-col"><DialogTitle>Tax Summary Details</DialogTitle></div>
                                        <div className="flex items-center gap-2 mr-12">
                                            <MonthYearFilter dateRange={taxDateRange} setDateRange={setTaxDateRange} dateSystem={dateSystem} />
                                            <div className="flex bg-muted rounded-md p-1 mr-2 space-x-1">{['all', 'input', 'output'].map((type) => (<button key={type} onClick={() => setTaxFilter(type as any)} className={cn("px-3 py-1 text-xs rounded-sm transition-all capitalize font-medium", taxFilter === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{type}</button>))}</div>
                                            <Button variant="outline" size="sm" onClick={handlePrintTax} className="flex items-center gap-2">Print <Printer className="h-4 w-4" /></Button>
                                        </div>
                                    </DialogHeader>
                                    <div className="flex flex-1 min-h-0">
                                        <div className="w-[300px] border-r flex flex-col min-h-0">
                                            <div className="p-2 font-semibold bg-muted/20 border-b">Tax Heads</div>
                                            <ScrollArea className="flex-1">
                                                {taxSummary.details.map((tax) => (
                                                    <div key={tax.id} onClick={() => setSelectedTaxId(tax.id)} className={cn("p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors flex justify-between items-center", selectedTaxId === tax.id ? "bg-muted" : "")}>
                                                        <span className="font-medium">{tax.name}</span>
                                                        <span className={cn("text-xs font-bold", tax.balance >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(Math.abs(tax.balance), {noSuffix: true})} {tax.balance >= 0 ? 'Dr' : 'Cr'}</span>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                            <div className="p-2 border-t bg-muted/20 text-sm font-bold flex justify-between"><span>Net Balance</span><span className={taxSummary.netBalance >= 0 ? "text-green-600" : "text-red-600"}>{formatCurrency(taxSummary.netBalance, {showDrCr: true})}</span></div>
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-0 min-h-0 divide-x">
                                             <div className="flex flex-col min-h-0">
                                                <h3 className="text-base font-semibold p-3 text-center text-green-600 border-b bg-green-50/50">Input (Paid)</h3>
                                                <ScrollArea className="flex-1">
                                                    <Table>
                                                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Voucher</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Tax</TableHead></TableRow></TableHeader>
                                                        <TableBody>
                                                            {(taxFilter === 'all' || taxFilter === 'input') && taxBreakdownData.inputs.map((tx, i) => (
                                                                <TableRow key={`in-${i}`}>
                                                                    <TableCell className="text-xs">{displayTransactionDate(tx.date)}</TableCell>
                                                                    <TableCell>{tx.voucherNumber}</TableCell>
                                                                    <TableCell>{tx.account}</TableCell>
                                                                    <TableCell className="text-right">{formatCurrency(tx.taxAmount, {noSuffix: true})}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                        <TableFooter>
                                                          <TableRow>
                                                            <TableCell colSpan={3} className="text-right font-bold">Total Input</TableCell>
                                                            <TableCell className="text-right font-bold text-green-600">{formatCurrency(taxBreakdownData.inputs.reduce((s, t) => s + t.taxAmount, 0), {noSuffix: true})}</TableCell>
                                                          </TableRow>
                                                        </TableFooter>
                                                    </Table>
                                                </ScrollArea>
                                            </div>
                                             <div className="flex flex-col min-h-0">
                                                <h3 className="text-base font-semibold p-3 text-center text-red-600 border-b bg-red-50/50">Output (Collected)</h3>
                                                <ScrollArea className="flex-1">
                                                    <Table>
                                                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Voucher</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Tax</TableHead></TableRow></TableHeader>
                                                        <TableBody>
                                                            {(taxFilter === 'all' || taxFilter === 'output') && taxBreakdownData.outputs.map((tx, i) => (
                                                                <TableRow key={`out-${i}`}>
                                                                    <TableCell className="text-xs">{displayTransactionDate(tx.date)}</TableCell>
                                                                    <TableCell>{tx.voucherNumber}</TableCell>
                                                                    <TableCell>{tx.account}</TableCell>
                                                                    <TableCell className="text-right">{formatCurrency(tx.taxAmount, {noSuffix: true})}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                         <TableFooter>
                                                          <TableRow>
                                                            <TableCell colSpan={3} className="text-right font-bold">Total Output</TableCell>
                                                            <TableCell className="text-right font-bold text-red-600">{formatCurrency(taxBreakdownData.outputs.reduce((s, t) => s + t.taxAmount, 0), {noSuffix: true})}</TableCell>
                                                          </TableRow>
                                                        </TableFooter>
                                                    </Table>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>
  
            <Card className="col-span-1 lg:col-span-2 transition-colors border-foreground/20">
                <CardHeader className="flex flex-row items-center justify-between p-4 space-y-0">
                    <CardTitle className="text-base whitespace-nowrap">Stock Summary</CardTitle>
                    <MonthYearFilter dateRange={stockDateRange} setDateRange={setStockDateRange} dateSystem={dateSystem} />
                </CardHeader>
                <CardContent className="p-4 pt-0 flex flex-col min-h-0">
                    <ScrollArea className="flex-1 max-h-[min(55vh,380px)] pr-3 -mr-1">
                        <div className="space-y-6 pb-4">
                            <div className="text-center pt-2">
                                <p className="text-xs text-muted-foreground">Total Stock Value</p>
                                <div className="flex items-center justify-center gap-2">
                                    <p className={cn('text-2xl font-bold whitespace-nowrap', overallStockSummary.totalStockValue >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(overallStockSummary.totalStockValue, {noSuffix: true, duration: 2})}</p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-xs font-semibold mb-2 text-center">Top 5 Sale Items</h4>
                                    <div className="space-y-2">
                                        {overallStockSummary && overallStockSummary.topSaleItems.map((item, index) => (
                                        <div key={`sale-top-${item.id}-${index}`} className="flex justify-between items-center text-sm border-t pt-2 gap-2">
                                            <span className="font-semibold min-w-0 truncate">{item.name}</span>
                                            <div className="text-right shrink-0 whitespace-nowrap">
                                            <p className="font-bold text-green-600">{formatCurrency(item.salesValue, {noSuffix: true, duration: 2})}</p>
                                            <p className="text-xs text-muted-foreground">{item.salesQty.toFixed(2)} {item.smallestUnit}</p>
                                            </div>
                                        </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold mb-2 text-center">Top 5 Purchase Items</h4>
                                    <div className="space-y-2">
                                        {overallStockSummary && overallStockSummary.topPurchaseItems.map((item, index) => (
                                        <div key={`purchase-top-${item.id}-${index}`} className="flex justify-between items-center text-sm border-t pt-2 gap-2">
                                            <span className="font-semibold min-w-0 truncate">{item.name}</span>
                                            <div className="text-right shrink-0 whitespace-nowrap">
                                            <p className="font-bold text-red-600">{formatCurrency(item.purchaseValue, {noSuffix: true, duration: 2})}</p>
                                            <p className="text-xs text-muted-foreground">{item.purchaseQty.toFixed(2)} {item.smallestUnit}</p>
                                            </div>
                                        </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    {isReportsEnabled && (
                        <div className="text-right pt-2">
                            <Dialog open={stockSummaryOpen} onOpenChange={setStockSummaryOpen}>
                                <DialogTrigger asChild><Button variant="link" size="sm" className="h-auto p-0">View Details</Button></DialogTrigger>
                                <DialogContent 
                                    className="max-w-4xl p-0 h-[90vh] rounded-lg flex flex-col"
                                    onInteractOutside={(e) => {
                                        const target = e.target as HTMLElement;
                                        // Prevent closing when clicking on Popover or Select dropdowns
                                        if (
                                            target.closest('[data-radix-popper-content-wrapper]') ||
                                            target.closest('[data-radix-popover-content]') ||
                                            target.closest('[role="dialog"]') ||
                                            target.closest('[data-radix-select-content]') ||
                                            target.closest('[data-radix-select-viewport]') ||
                                            document.querySelector('[data-radix-popover-content]')?.contains(target)
                                        ) {
                                            e.preventDefault();
                                        }
                                    }}
                                    onPointerDownOutside={(e) => {
                                        const target = e.target as HTMLElement;
                                        // Prevent closing when clicking on Popover or Select dropdowns
                                        if (
                                            target.closest('[data-radix-popper-content-wrapper]') ||
                                            target.closest('[data-radix-popover-content]') ||
                                            target.closest('[role="dialog"]') ||
                                            target.closest('[data-radix-select-content]') ||
                                            target.closest('[data-radix-select-viewport]') ||
                                            document.querySelector('[data-radix-popover-content]')?.contains(target)
                                        ) {
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    <DialogHeader className="p-4 border-b flex flex-row justify-between items-center">
                                        <div className="flex flex-col"><DialogTitle>Stock Summary Details</DialogTitle></div>
                                        <div 
                                            className="flex items-center gap-2 mr-12" 
                                            onClick={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                                                <MonthYearFilter dateRange={stockDateRange} setDateRange={setStockDateRange} dateSystem={dateSystem} />
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintStock();
                                                }} 
                                                className="flex items-center gap-2"
                                            >
                                                Print <Printer className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </DialogHeader>
                                    <div className="flex-1 p-4 flex flex-col min-h-0">
                                        <div className="border rounded-lg flex-1 flex flex-col min-h-0">
                                            <Table><TableHeader><TableRow><TableHead>Item Name</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader></Table>
                                            <ScrollArea className="flex-1">
                                                <Table>
                                                    <TableBody>
                                                        {overallStockSummary.items.map((item, i) => ( <TableRow key={i}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="text-right">{item.qty.toFixed(2)} {item.unit}</TableCell><TableCell className="text-right">{formatCurrency(item.rate, {noSuffix: true})}</TableCell><TableCell className="text-right font-bold">{formatCurrency(item.value, {noSuffix: true})}</TableCell></TableRow> ))}
                                                    </TableBody>
                                                </Table>
                                            </ScrollArea>
                                            <Table><TableFooter><TableRow><TableCell className="font-bold" colSpan={3}>Total Stock Value</TableCell><TableCell className="text-right font-bold text-green-600">{formatCurrency(overallStockSummary.totalStockValue, {noSuffix: true})}</TableCell></TableRow></TableFooter></Table>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>
  
        {can("view_voucher_type_summaries") && stats.otherStats.map((stat) => (
            <Card key={stat.type} className="hover:bg-muted/50 transition-colors border-foreground/20">
              <CardHeader className="p-3 flex-row items-center justify-between">
                  <CardTitle className="text-sm whitespace-nowrap">{stat.title}</CardTitle>
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                  {stat.type === 'journal' || stat.type === 'add_salary' || stat.type === 'contra' ? (
                      <div className='text-xl font-bold text-blue-600'>{formatCurrency(stat.total, { noSuffix: true, duration: 2 })}</div>
                  ) : (
                      <div className={cn('text-xl font-bold', stat.isCredit ? 'text-green-600' : 'text-red-600')}>
                          {formatCurrency(stat.total, { noSuffix: true, duration: 2 })}
                      </div>
                  )}
                  <p className="text-xs text-muted-foreground">{stat.count} transaction(s)</p>
              </CardContent>
            </Card>
        ))}
  
        {can("view_entity_counts_summary") && (
          <>
            <Card className="border-foreground/20"><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Parties</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedParties.length}</CardContent></Card>
            <Card className="border-foreground/20"><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Staff</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedStaff.length}</CardContent></Card>
            <Card className="border-foreground/20"><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Bank/Cash Acc</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedAccounts.length}</CardContent></Card>
            <Card className="border-foreground/20"><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Items</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedItems.length}</CardContent></Card>
            <Card className="border-foreground/20"><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Vouchers</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{vouchers.length}</CardContent></Card>
          </>
        )}
      </div>
    );
  }
  
  const renderRecentTransactions = () => (
    <div className={cn(isMobile && "mx-0.5")}>
    <Card className={cn("border-2 border-foreground/20", isMobile && "px-0")}>
      <CardHeader className={cn(isMobile && "px-0.5")}>
        <div className="flex flex-col gap-2">
          <CardTitle className="text-center w-full">Recent Transactions</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn("flex items-center space-x-2", isMobile ? "order-1" : "md:order-2")}>
            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                <BsDatePicker isRange valueAD={recentDateRange} onChangeAD={(range) => setRecentDateRange(range as DateRange | undefined)} transactionDates={transactionDates} />
            )}
            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                <Popover>
                    <PopoverTrigger asChild>
                    <Button id="recent-date" variant={"outline"} className={cn("w-auto justify-start text-left font-normal h-9", !recentDateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {recentDateRange?.from ? (recentDateRange.to ? <>{format(recentDateRange.from, "LLL dd, y")} - {format(recentDateRange.to, "LLL dd, y")}</> : format(recentDateRange.from, "LLL dd, y")) : (<span>Date range</span>)}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
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
                <Button
                  type="button"
                  size="sm"
                  variant={recentUnapprovedOnly ? "default" : "outline"}
                  className="h-9 whitespace-nowrap"
                  onClick={() => {
                    if (recentUnapprovedOnly) setRecentUnapprovedOnly(false);
                    else applyRecentUnapprovedFilter();
                  }}
                >
                  Unapproved
                </Button>
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

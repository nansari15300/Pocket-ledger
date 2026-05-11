
'use client';

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
  updateDoc,
  collection,
  query,
  getDocs,
  where,
} from 'firebase/firestore';
import * as React from 'react';
import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
  X,
  Calendar as CalendarIcon,
  Printer,
  FileDigit,
  FileText as FileTextIcon,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  StickyNote,
  Factory,
  HandCoins,
  BarChart3,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
import type { DateRange } from "@/components/ui/ad-calendar";
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
import { useIsMobile, useCalendarMonths, useMobileView } from '@/hooks/use-mobile';
import { openPrintDirect } from "@/lib/printDirect";
import usePermissions from '@/hooks/usePermissions';
import { Checkbox } from '@/components/ui/checkbox';
import { DaybookReport } from '@/components/reports/DaybookReport';
import { useVouchers } from '@/hooks/useVouchers';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TransactionsTable } from '@/components/vouchers/TransactionsTable';
import {
  getOppositeAccountLabel,
  getTransactionQuickSearchHaystack,
} from "@/components/vouchers/transactionTableShared";
import { useDashboard } from '@/hooks/useDashboard';
import AdCalendar from "@/components/ui/ad-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { useAuth } from '@/hooks/useAuth';
import { adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";
import { motion, AnimatePresence } from 'framer-motion';
import { AddVoucherDialog } from '@/components/vouchers/AddVoucherDialog';
import { HistoryDialog } from '@/components/vouchers/HistoryDialog';
import { LinkAdvancesToVoucherDialog } from '@/components/vouchers/LinkAdvancesToVoucherDialog';
import { LinkPaymentToTxnsDialog } from '@/components/vouchers/LinkPaymentToTxnsDialog';
import { toast } from 'sonner';
import { useTransactions } from '@/hooks/use-transactions';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { useSidebar } from "@/components/ui/sidebar";
import { FinancialSummaryCards } from '@/components/reports/FinancialSummaryCards';
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { isDashboardRedirectGuardActive } from "@/lib/protectFromUnwantedDashboardRedirect";
import { orderedCashFlowCategories } from "@/lib/cashFlowCategoryOrder";
import {
  voucherCountsAsDashboardPaySalary,
  voucherCountsAsDashboardPaymentOutExcludingPaySalary,
} from "@/lib/dashboardPaySalaryStat";
import { computeReceivablesPayablesFinancialSummary } from "@/lib/receivablesPayablesFinancialSummary";
import { useServerReceivablesPayablesSummary } from "@/hooks/useServerReceivablesPayablesSummary";
import { RecurringAutoSummaryCard } from "@/components/dashboard/RecurringAutoSummaryCard";

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
  { title: 'Payment In', icon: ArrowDownCircle, type: 'payment_in', link: '/payment-in', isCredit: true },
  { title: 'Payment Out', icon: ArrowUpCircle, type: 'payment_out_excl_pay_salary', link: '/payment-out', isCredit: false },
  { title: 'Pay Salary', icon: HandCoins, type: 'pay_salary', link: '/add-salary', isCredit: false },
  { title: 'Notes', icon: StickyNote, type: 'note', link: '/notes', isCredit: true },
  { title: 'Production', icon: Factory, type: 'production', link: '/production', isCredit: true },
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
  // NEW (MonthYearFilter)
const [mode, setMode] = useState<'all' | 'custom'>('all');
  
  // Current Date Infos
  const today = new Date();
  const currentBs = adToBs(today);
  
  // Selection State
  const [selectedBsYear, setSelectedBsYear] = useState(currentBs.y);
  const [selectedBsMonth, setSelectedBsMonth] = useState(currentBs.m);
  const [selectedAdYear, setSelectedAdYear] = useState(getYear(today));
  const [selectedAdMonth, setSelectedAdMonth] = useState(getMonth(today)); // 0-11

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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs font-normal"
            onClick={(e) => {
                e.stopPropagation(); // Prevents clicking the card background
                setIsOpen(true);
            }}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 z-50" align="end" onClick={(e) => e.stopPropagation()}>
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

          <Button className="w-full" onClick={applyFilter}>Ok</Button>
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
        if (!processedAccounts || !vouchers) return { cashAccounts: [], bankAccounts: [], totalBankInflow: 0, totalBankOutflow: 0, totalCashInflow: 0, totalCashOutflow: 0, totalClosingBalance: 0 };
    
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
        // Combined Bank + Cash closing balance for quick dashboard visibility.
        const totalClosingBalance = [...bankAccounts, ...cashAccounts].reduce((sum, acc) => sum + acc.balance, 0);

        return { cashAccounts, bankAccounts, totalBankInflow, totalBankOutflow, totalCashInflow, totalCashOutflow, totalClosingBalance };
      }, [processedAccounts, vouchers, bankCashDateRange]);

    return (
        <Card
            id="bank-cash-summary-area"
            // Dashboard top cards: give each card a different soft ribbon tone.
            // Bold border requested for dashboard cards while preserving ribbon tint.
            // APK WebView compatibility: force same top ribbon class used by header/sidebar so stripe is always visible.
            className="app-chrome-top-ribbon pl-dashboard-ribbon-sky flex-1 flex flex-col min-h-0 border-2 border-sky-300/70"
        >
            <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <CardTitle className="text-sm font-medium">Bank/Cash Summary</CardTitle>
                      {/* Show combined closing balance (Bank + Cash) beside summary title. */}
                      <span className={cn("text-xs sm:text-sm font-semibold whitespace-nowrap", bankCashSummary.totalClosingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                        Closing: {formatCurrency(bankCashSummary.totalClosingBalance, { showDrCr: true, noAnimation: true })}
                      </span>
                    </div>
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

/**
 * Recent search: sirf card/table dikhane wale text + amounts/dates — poori object walk nahi
 * (warna "rcpt" jaise substring kisi hidden field me lag kar Sale row bhi aa jata tha).
 * Space = alag words; har word ko AND (sab kahi na kahi match hone chahiye).
 */
function transactionMatchesRecentQuickSearch(
  tx: any,
  qLower: string,
  journalAccountNames: Record<string, string>,
  userNames: Record<string, string>
): boolean {
  if (!qLower) return true;
  const tokens = qLower
    .split(/\s+/)
    .map((t) => t.replace(/,/g, "").trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const names = { ...journalAccountNames, ...userNames };
  const pieces: string[] = [];

  pieces.push(getTransactionQuickSearchHaystack(tx, names));
  pieces.push(getOppositeAccountLabel(tx, names, "daybook", undefined, undefined) || "");
  if (typeof tx?.title === "string" && tx.type === "note") pieces.push(tx.title);

  const uid = tx?.userId;
  if (uid && userNames[uid]) pieces.push(userNames[uid]);

  for (const key of ["debit", "credit", "total", "amount", "balance", "runningBalance", "outstanding"] as const) {
    const v = tx[key];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) {
      pieces.push(String(n), n.toFixed(2), n.toLocaleString("en-IN"));
      pieces.push(n.toLocaleString());
    }
  }

  const d =
    tx?.date && (typeof tx.date.toDate === "function" ? tx.date.toDate() : new Date(tx.date));
  if (d && !isNaN(d.getTime())) {
    pieces.push(d.toISOString(), d.toLocaleDateString(), d.toLocaleString());
  }

  const hay = pieces.join(" ").toLowerCase().replace(/,/g, " ");

  const numericFields = ["debit", "credit", "total", "amount", "balance", "runningBalance", "outstanding"].map(
    (k) => Number(tx[k])
  );

  for (const tok of tokens) {
    if (!tok) continue;
    if (hay.includes(tok)) continue;
    const qNum = Number(tok.replace(/,/g, ""));
    if (Number.isFinite(qNum) && numericFields.some((n) => Number.isFinite(n) && Math.abs(n - qNum) < 0.000001)) {
      continue;
    }
    return false;
  }
  return true;
}

function DashboardPageContent() {
  const { company, companyId, setCompanyId } = useCompany();
  const { can } = usePermissions();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { vouchers, loading: vouchersLoading, processedItems, processedParties, processedStaff, processedTaxes, processedAccounts, expenseAccounts } = useVouchers();
  const pendingEditVoucherRef = useRef<{ companyId: string; voucherId: string } | null>(null);
  const [showFab, setShowFab] = useState(true);
  const lastScrollY = useRef(0);
  const hideFabTimeout = useRef<NodeJS.Timeout | null>(null);
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint } = useDate();
  const isMobile = useIsMobile();
  /** Phone detect: APK/WebView me PC mode + width≥768 par `isMobile` false ho jata hai — Recent header phir bhi compact hona chahiye. */
  const { isRealMobile } = useMobileView();
  const recentTransactionsCompact = isMobile || isRealMobile;
  const calendarMonths = useCalendarMonths();
  
  const [loading, setLoading] = React.useState(true);
  
  const [userNames, setUserNames] = React.useState<Record<string, string>>({});
  
  const [receivablesPayablesOpen, setReceivablesPayablesOpen] = React.useState(false);
  const [taxSummaryOpen, setTaxSummaryOpen] = useState(false);
  
  // Filter for Receivables & Payables Dialog
  const [receivablePayableFilter, setReceivablePayableFilter] = useState<'all' | 'party' | 'staff' | 'tax'>('all');
  const [cashFlowFilter, setCashFlowFilter] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [cashFlowCategoryFilter, setCashFlowCategoryFilter] = useState<'all' | 'party' | 'staff' | 'tax' | 'income_expense' | 'other'>('all');
  const [receivablesDateRange, setReceivablesDateRange] = useState<DateRange | undefined>(undefined);

  /** Print / page-level R/P: same server aggregation as FinancialSummaryCards (duplicate API — range alag ho sakta hai). */
  const {
    summary: pageServerRpSummary,
    loading: pageServerRpLoading,
    useClientFallback: pageServerRpClientFb,
    preferServer: pagePreferServerRp,
  } = useServerReceivablesPayablesSummary({
    companyId: company?.id,
    storageOption: company?.storageOption,
    receivablesDateRange,
    enabled: true,
  });

  const [cashFlowDateRange, setCashFlowDateRange] = useState<DateRange | undefined>(undefined);
  const [taxDateRange, setTaxDateRange] = useState<DateRange | undefined>(undefined);
  const [stockDateRange, setStockDateRange] = useState<DateRange | undefined>(undefined);
  const [taxFilter, setTaxFilter] = useState<'all' | 'input' | 'output'>('all');
  const [selectedTaxId, setSelectedTaxId] = useState<string | null>(null);

    // State for new dialogs and date pickers
    const [stockSummaryOpen, setStockSummaryOpen] = useState(false);
    const [cashFlowOpen, setCashFlowOpen] = useState(false);

    const [showRecentNarration, setShowRecentNarration] = useState(true);
  
  const [recentRowsPerPage, setRecentRowsPerPage] = React.useState('20');
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = React.useState(false);
  const [selectedVoucher, setSelectedVoucher] = React.useState<any>(null);
  /** Auto recurring Dr/Cr popup: row → template source body voucher (Recent table jaisa) */
  const openRecurringBodyVoucher = React.useCallback(
    (bodyVoucherId: string) => {
      const vid = String(bodyVoucherId || "").trim();
      if (!vid) return;
      const v = vouchers.find((x) => String((x as { id?: string }).id) === vid);
      if (v) {
        setSelectedVoucher(v);
        setIsVoucherDialogOpen(true);
      } else {
        toast.info("Voucher not loaded", {
          description: "This voucher may be outside the current list. Open it from Daybook or refresh.",
        });
      }
    },
    [vouchers],
  );
  const [historyVoucher, setHistoryVoucher] = React.useState<any>(null);
  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = React.useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = React.useState<any>(null);
  const { visibleCard, setVisibleCard } = useDashboard();
  /** Chart se wapas: jis tab par user tha (All/Summary/…) — doosra Chart click pe wahi restore, warna state same reh jata tha. */
  const visibleCardBeforeChartsRef = useRef<string>("financial-summaries");
  /** Desktop: rail `w-64` open / `w-16` collapsed — footer `fixed` inset is sidebar ke hisaab se shift hona chahiye. */
  const { isOpen: sidebarRailOpen } = useSidebar();
  const [greeting, setGreeting] = useState('');
  
  const [recentVoucherTypes, setRecentVoucherTypes] = useState<string[]>(['all']);
  const [recentDateRange, setRecentDateRange] = React.useState<DateRange | undefined>();
  const [isRecentCalendarOpen, setIsRecentCalendarOpen] = React.useState(false);
  const [tempRecentDateRange, setTempRecentDateRange] = React.useState<DateRange | undefined>(undefined);
  const [recentFilters, setRecentFilters] = useState<Record<string, string>>({});
  /** Recent card header: client-side quick filter (voucher no / narration / names) — pool + "Showing" counts isi se. */
  const [recentQuickSearch, setRecentQuickSearch] = useState('');
  /** Recent card quick chip: click -> all-time unapproved only (date/type/column filters ignore). */
  const [recentUnapprovedOnly, setRecentUnapprovedOnly] = useState(false);
  const [activeRecentFilter, setActiveRecentFilter] = useState<string | null>(null);
  const [isDateChange, setIsDateChange] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());

  const isReportsEnabled = useFeatureAccess('reports');

  const transactionDates = useMemo(() => vouchers.map(v => safeToDate(v.date)).filter(Boolean) as Date[], [vouchers]);

  // Open voucher in edit mode when navigating from alert link (dashboard?editVoucher=id&companyId=cid)
  useEffect(() => {
    const editVoucherId = searchParams.get('editVoucher');
    const urlCompanyId = searchParams.get('companyId');
    if (editVoucherId && urlCompanyId) {
      pendingEditVoucherRef.current = { companyId: urlCompanyId, voucherId: editVoucherId };
      setCompanyId(urlCompanyId);
    }
  }, [searchParams, setCompanyId]);

  useEffect(() => {
    const pending = pendingEditVoucherRef.current;
    if (!pending || companyId !== pending.companyId || !pending.voucherId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, `companies/${pending.companyId}/vouchers`, pending.voucherId));
        if (snap.exists()) {
          const d = snap.data();
          const dateVal = d.date;
          const voucher = {
            id: snap.id,
            ...d,
            date: dateVal?.toDate ? dateVal.toDate() : dateVal,
          };
          setSelectedVoucher(voucher);
          setIsVoucherDialogOpen(true);
        } else {
          toast.info('Voucher not found', { description: 'It may have been deleted.' });
        }
      } catch (e) {
        console.error('Failed to open voucher from alert link', e);
        toast.error('Failed to open voucher');
      } finally {
        pendingEditVoucherRef.current = null;
        // companyId / searchParams deps se effect dubara — URL pehle hi /dashboard ho to replace mat chalao
        // APK mobile approve guard active ho to bhi /dashboard push mat karo (user ko original page par rakho).
        if (
          !isDashboardRedirectGuardActive() &&
          shouldReplaceWithMasterDetailCanonical("/dashboard")
        ) {
          router.replace("/dashboard");
        }
      }
    })();
  }, [companyId, router]);

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

  /** Welcome card clock line: app `dateSystem` ke mutabiq aaj ki tariikh — AD/BS label zaroor dikhein (pehle sirf locale AD tha). */
  const welcomeSystemDateTimeLine = useMemo(() => {
    const d = liveTime;
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    const weekday = format(d, "EEEE");
    const timePart = d.toLocaleTimeString();
    if (dateSystem === "AD") {
      return `${weekday}, ${formatDate(d)} (AD) | ${timePart}`;
    }
    if (dateSystem === "BS") {
      return `${weekday}, ${formatDateBS(d)} (BS) | ${timePart}`;
    }
    return `${weekday} · AD ${formatDate(d)} · BS ${formatDateBS(d)} | ${timePart}`;
  }, [liveTime, dateSystem, formatDate, formatDateBS]);

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

  // ---------- FINANCIAL SUMMARY CALCULATION (Grouped) — shared + optional server aggregate ----------
  const needPageClientRp =
    !pagePreferServerRp ||
    pageServerRpClientFb ||
    (!pageServerRpSummary && !pageServerRpLoading);

  const pageClientFinancialSummary = React.useMemo(() => {
    if (!needPageClientRp) {
      return computeReceivablesPayablesFinancialSummary({
        vouchers,
        processedParties,
        processedStaff,
        processedTaxes,
        receivablesDateRange,
        loading: true,
      });
    }
    return computeReceivablesPayablesFinancialSummary({
      vouchers,
      processedParties,
      processedStaff,
      processedTaxes,
      receivablesDateRange,
      loading: !!loading,
    });
  }, [
    needPageClientRp,
    loading,
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    receivablesDateRange,
  ]);

  const financialSummary = React.useMemo(() => {
    if (pagePreferServerRp && !pageServerRpClientFb && pageServerRpSummary) {
      return pageServerRpSummary;
    }
    if (pagePreferServerRp && !pageServerRpClientFb && pageServerRpLoading) {
      return computeReceivablesPayablesFinancialSummary({
        vouchers,
        processedParties,
        processedStaff,
        processedTaxes,
        receivablesDateRange,
        loading: true,
      });
    }
    return pageClientFinancialSummary;
  }, [
    pagePreferServerRp,
    pageServerRpClientFb,
    pageServerRpSummary,
    pageServerRpLoading,
    pageClientFinancialSummary,
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    receivablesDateRange,
  ]);

  const netBalance = financialSummary.totalReceivable + financialSummary.totalPayable;

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
        if(v.incomeAccountId || v.expenseAccountId) return 'Income/Expense';
        return 'Other';
    }

    const getEntityInfo = (v: Voucher): {id: string, name: string} => {
        if(v.partyId) return {id: v.partyId, name: processedParties.find(p=>p.id === v.partyId)?.name || 'Unknown Party'};
        if(v.staffId) return {id: v.staffId, name: processedStaff.find(s=>s.id === v.staffId)?.name || 'Unknown Staff'};
        if(v.taxAccountId) return {id: v.taxAccountId, name: processedTaxes.find(t=>t.id === v.taxAccountId)?.name || 'Unknown Tax'};
        if(v.incomeAccountId) return {id: v.incomeAccountId, name: expenseAccounts.find(e=>e.id === v.incomeAccountId)?.name || 'Unknown Income'};
        if(v.expenseAccountId) return {id: v.expenseAccountId, name: expenseAccounts.find(e=>e.id === v.expenseAccountId)?.name || 'Unknown Expense'};
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

    Object.values(categorizedInflow).forEach((arr) =>
      arr.sort((a, b) => Number(b.amount) - Number(a.amount))
    );
    Object.values(categorizedOutflow).forEach((arr) =>
      arr.sort((a, b) => Number(b.amount) - Number(a.amount))
    );

    return { categorizedInflow, categorizedOutflow, totalInflow, totalOutflow };
  }, [vouchers, cashFlowDateRange, processedParties, processedStaff, processedTaxes, expenseAccounts]);

  const taxSummary = useMemo(() => {
    if (!processedTaxes) return { totalInput: 0, totalOutput: 0, netBalance: 0, details: [] };
    const totalInput = processedTaxes.reduce((sum, tax) => sum + tax.debit, 0);
    const totalOutput = processedTaxes.reduce((sum, tax) => sum + tax.credit, 0);
    const netBalance = totalInput - totalOutput;
    const details = processedTaxes.map(tax => ({
      id: tax.id,
      name: tax.name,
      input: tax.debit,
      output: tax.credit,
      balance: tax.debit - tax.credit,
    }));
    details.sort((a, b) => Number(b.input) + Number(b.output) - (Number(a.input) + Number(a.output)));
    return {
      totalInput,
      totalOutput,
      netBalance,
      details,
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

    filteredItems = [...filteredItems].sort((a, b) => Number(b.value) - Number(a.value));

    const topSaleItems = [...filteredItems].filter(i => i.salesQty > 0 || i.salesValue > 0).sort((a,b) => b.salesValue - a.salesValue).slice(0, 5);
    const topPurchaseItems = [...filteredItems].filter(i => i.purchaseQty > 0 || i.purchaseValue > 0).sort((a,b) => b.purchaseValue - a.purchaseValue).slice(0, 5);

    return { items: filteredItems, totalStockValue: totalValue, topSaleItems, topPurchaseItems };
}, [processedItems, vouchers, stockDateRange]);

  const stats = React.useMemo(() => {
    if (!vouchers) return { otherStats: statCardData.map(s => ({ ...s, total: 0, count: 0 })) };

    const otherStats = statCardData.map((card) => {
      const filteredVouchers = vouchers.filter((v) => {
        if (card.type === 'journal') return v.type === 'journal' && !v.subType;
        if (card.type === 'add_salary') return v.type === 'journal' && v.subType === 'add_salary';
        if (card.type === 'pay_salary') return voucherCountsAsDashboardPaySalary(v);
        if (card.type === 'payment_out_excl_pay_salary') return voucherCountsAsDashboardPaymentOutExcludingPaySalary(v);
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

    return { otherStats };
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

  const recentSortedBase = useMemo(() => {
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
      sorted = sorted.filter((tx) => (tx as any).isApproved !== true);
    }
    return sorted;
  }, [allRecentTransactions, recentUnapprovedOnly]);

  const recentPoolBeforeLimit = useMemo(() => {
    const q = recentQuickSearch.trim().toLowerCase();
    if (!q) return recentSortedBase;
    return recentSortedBase.filter((tx) =>
      transactionMatchesRecentQuickSearch(tx, q, journalAccountNames, userNames)
    );
  }, [recentSortedBase, recentQuickSearch, journalAccountNames, userNames]);

  const recentTransactions = useMemo(() => {
    if (recentUnapprovedOnly) return recentPoolBeforeLimit;
    const limit = Number(recentRowsPerPage);
    if (!isNaN(limit) && limit > 0) return recentPoolBeforeLimit.slice(0, limit);
    return recentPoolBeforeLimit;
  }, [recentPoolBeforeLimit, recentRowsPerPage, recentUnapprovedOnly]);
  
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
    const buildTableBody = (list: typeof financialSummary.receivables) => {
        const body: any[] = [['Party/Staff/Tax', { text: 'Amount', alignment: 'right' }]];
        const rows: { party: string; balance: number }[] = [];
        if (shouldInclude('party')) rows.push(...excludeOpeningBalance(list.parties));
        if (shouldInclude('staff')) rows.push(...excludeOpeningBalance(list.staff));
        if (shouldInclude('tax')) rows.push(...excludeOpeningBalance(list.taxes));
        rows.sort((a, b) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0));
        rows.forEach(item =>
            body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), { noSuffix: true, noAnimation: true }), alignment: 'right' }])
        );
        return body;
    };
    const receivablesBody = buildTableBody(financialSummary.receivables);
    const payablesBody = buildTableBody(financialSummary.payables);
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
        orderedCashFlowCategories(cashFlowDetails.categorizedInflow).forEach(([category, items]) => {
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
        orderedCashFlowCategories(cashFlowDetails.categorizedOutflow).forEach(([category, items]) => {
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
  }

  const isRecentFilterActive = useMemo(
    () =>
      recentDateRange !== undefined ||
      (recentVoucherTypes.length > 0 && !recentVoucherTypes.includes('all')) ||
      Object.values(recentFilters).some(v => v) ||
      recentUnapprovedOnly ||
      recentQuickSearch.trim() !== '',
    [recentDateRange, recentVoucherTypes, recentFilters, recentUnapprovedOnly, recentQuickSearch]
  );
  const clearRecentFilters = () => {
    setRecentDateRange(undefined);
    setRecentVoucherTypes(['all']);
    setRecentFilters({});
    setRecentUnapprovedOnly(false);
    setRecentQuickSearch('');
  };
  const applyRecentUnapprovedFilter = () => {
    // User request: button click = all-time unapproved vouchers only.
    setRecentUnapprovedOnly(true);
    setRecentDateRange(undefined);
    setRecentVoucherTypes(['all']);
    setRecentFilters({});
    setRecentQuickSearch('');
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
      
      // Tax from Journal Entries (for TDS etc.)
      if (v.type === 'journal' && v.entries) {
        const taxEntry = v.entries.find((e: any) => e.accountId === selectedTaxId);

        if (taxEntry) {
          // Find the other side of the entry to use as the 'Account' name
          const otherEntry = v.entries.find((e: any) => e.accountId !== selectedTaxId);
          const accountName = journalAccountNames[otherEntry?.accountId] || 'Journal Entry';

          if (taxEntry.debit > 0) { // Tax Paid (Input)
            inputs.push({
              voucherType: v.type,
              voucherNumber: v.voucherNumber,
              account: accountName,
              taxAmount: taxEntry.debit,
              date: v.date
            });
          } else if (taxEntry.credit > 0) { // Tax Liability Created (Output)
            outputs.push({
              voucherType: v.type,
              voucherNumber: v.voucherNumber,
              account: accountName,
              taxAmount: taxEntry.credit,
              date: v.date
            });
          }
        }
      }
    });

    return { inputs, outputs };
  }, [selectedTaxId, vouchers, processedTaxes, processedParties, journalAccountNames]);

  const displayTransactionDate = (date: any) => {
    const d = safeToDate(date);
    if (!d) return "Invalid Date";
    return dateSystem === 'AD' ? formatDate(d) : formatDateBS(d);
  };

  /** Mobile: poori range date-trigger button mein mat dikhao — title ke neeche ek line; strip/control row ki height stable. */
  const recentTransactionsMobileRangeLine = useMemo(() => {
    if (!recentDateRange?.from) return null;
    const from = recentDateRange.from;
    const to = recentDateRange.to;
    const adPart = to ? `${formatDate(from)} – ${formatDate(to)}` : formatDate(from);
    const bsPart = to ? `${formatDateBS(from)} – ${formatDateBS(to)}` : formatDateBS(from);
    if (dateSystem === 'AD') return adPart;
    if (dateSystem === 'BS') return bsPart;
    return `${adPart} · ${bsPart}`;
  }, [recentDateRange, dateSystem, formatDate, formatDateBS]);


  const renderFinancialSummaries = (reportsEnabled: boolean, showVoucherDateCharts = false) => {
    return (
      <FinancialSummaryCards
        vouchers={vouchers}
        processedParties={processedParties}
        processedStaff={processedStaff}
        processedTaxes={processedTaxes}
        processedAccounts={processedAccounts}
        processedItems={processedItems}
        expenseAccounts={expenseAccounts}
        loading={loading}
        showDetails={reportsEnabled}
        compact={false}
        showVoucherDateCharts={showVoucherDateCharts}
        recurringSummarySlot={
          !showVoucherDateCharts && (visibleCard === "all" || visibleCard === "financial-summaries") ? (
            <RecurringAutoSummaryCard
              layout="gridCell"
              placement={visibleCard === "financial-summaries" ? "summary" : "with-all"}
              onOpenBodyVoucher={openRecurringBodyVoucher}
            />
          ) : undefined
        }
      />
    );
  };
  
  const renderRecentTransactions = () => (
    <div className="w-full max-w-full">
    <Card
      className={cn(
        "border-2 w-full border-violet-300/70 pl-dashboard-ribbon-violet",
        recentTransactionsCompact && "px-0"
      )}
    >
      {/* Compact: CardHeader default `p-6` hata kar chhoti strip — sirf text jitni height */}
      <CardHeader
        className={cn(
          "px-2 sm:px-4",
          recentTransactionsCompact && "space-y-1 px-2 py-1.5 sm:px-4",
          // Recent tab + mobile: `main` scroll par title/date upar chipke rahein — `sticky` ka scrollport wahi `<main>` hai (layout).
          recentTransactionsCompact &&
            visibleCard === "recent-transactions" &&
            "sticky top-0 z-20 border-b border-gray-300 bg-gray-200 py-2 shadow-sm dark:border-gray-600 dark:bg-gray-800"
        )}
      >
        <div className={cn("flex flex-col", recentTransactionsCompact ? "gap-1" : "gap-2")}>
          {/* Mobile: title compact rakho; date-range ko button row ke just upar dikhana hai. */}
          <div
            className={cn(
              "flex w-full flex-col items-center justify-center",
              recentTransactionsCompact && "gap-0 py-0"
            )}
          >
            <CardTitle
              className={cn(
                "w-full text-center",
                recentTransactionsCompact && recentDateRange?.from && "text-sm font-semibold leading-none",
                recentTransactionsCompact && !recentDateRange?.from && "text-base font-semibold leading-none"
              )}
            >
              Recent Transactions
            </CardTitle>
          </div>
          {/* User request: upar sirf title + date range line hi rahe. */}
          {recentTransactionsCompact && (
            <p
              className="w-full max-w-full truncate px-1 text-center text-[11px] font-bold leading-tight text-foreground"
              title={recentTransactionsMobileRangeLine ?? "Date range"}
            >
              {recentTransactionsMobileRangeLine ?? "Date range"}
            </p>
          )}
          {/* Compact mobile me controls niche fixed panel me jayenge; yahan desktop/non-compact controls hi rakho. */}
          {!recentTransactionsCompact && (
          <div
            className={cn(
              "flex items-center gap-2 min-h-9",
              recentTransactionsCompact ? "flex-nowrap overflow-x-auto" : "flex-wrap"
            )}
          >
            <div className={cn("flex shrink-0 items-center gap-2 h-9", recentTransactionsCompact ? "order-1" : "md:order-2")}>
            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                <BsDatePicker
                  isRange
                  valueAD={recentDateRange}
                  onChangeAD={(range) => setRecentDateRange(range as DateRange | undefined)}
                  transactionDates={transactionDates}
                  className="h-9 max-w-[min(100%,9rem)] sm:max-w-none"
                  hideTriggerIcon={recentTransactionsCompact}
                  rangeEmptyLabel={recentTransactionsCompact ? "Change date" : undefined}
                  children={
                    recentTransactionsCompact ? (
                      <span className="min-w-0 truncate">Change date</span>
                    ) : undefined
                  }
                />
            )}
            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                <Popover open={isRecentCalendarOpen} onOpenChange={(open) => {
                  setIsRecentCalendarOpen(open);
                  if (open) setTempRecentDateRange(recentDateRange);
                  else setTempRecentDateRange(undefined);
                }}>
                    <PopoverTrigger asChild>
                    <Button
                      id="recent-date"
                      variant={"outline"}
                      className={cn(
                        "h-9 justify-start text-left font-normal",
                        recentTransactionsCompact ? "w-auto max-w-[min(100%,9rem)] min-w-0 shrink-0" : "w-auto",
                        !recentDateRange && "text-muted-foreground"
                      )}
                    >
                        {!recentTransactionsCompact && <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />}
                        {/* Mobile: trigger par lambi range mat — range title ke neeche */}
                        {recentTransactionsCompact ? (
                          <span className="min-w-0 truncate">Change date</span>
                        ) : recentDateRange?.from ? (
                          recentDateRange.to ? (
                            <>
                              {formatDate(recentDateRange.from)} - {formatDate(recentDateRange.to)}
                            </>
                          ) : (
                            formatDate(recentDateRange.from)
                          )
                        ) : (
                          <span>Date range</span>
                        )}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                    <AdCalendar
                      rangePresetSlot={
                        <DateRangePresetRow
                          country={company?.country}
                          onApply={(r) => {
                            setTempRecentDateRange(r);
                            setRecentDateRange(r);
                            setIsRecentCalendarOpen(false);
                          }}
                        />
                      }
                      valueAD={tempRecentDateRange ?? recentDateRange}
                      isRange
                      numberOfMonths={calendarMonths}
                      transactionDates={transactionDates}
                      onSelect={(adDate) => {
                        const range = tempRecentDateRange ?? recentDateRange;
                        if (!range?.from || (range.from && range.to)) {
                          setTempRecentDateRange({ from: adDate, to: undefined });
                        } else if (adDate < range.from) {
                          const next = { from: adDate, to: range.from };
                          setTempRecentDateRange(next);
                          setRecentDateRange(next);
                          setIsRecentCalendarOpen(false);
                        } else {
                          const next = { from: range.from, to: adDate };
                          setTempRecentDateRange(next);
                          setRecentDateRange(next);
                          setIsRecentCalendarOpen(false);
                        }
                      }}
                    />
                    </PopoverContent>
                </Popover>
            )}
            </div>
            <div className={cn("flex items-center gap-2 flex-1 min-w-0 h-9", recentTransactionsCompact ? "order-2" : "md:order-1")}>
                {!recentTransactionsCompact && <span className="text-sm font-medium shrink-0">Show:</span>}
                <Select value={recentRowsPerPage} onValueChange={(v) => setRecentRowsPerPage(v)}>
                    <SelectTrigger className="h-9 flex-1 min-w-0 w-full max-w-[140px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="20">Last 20</SelectItem>
                        <SelectItem value="30">Last 30</SelectItem>
                        <SelectItem value="50">Last 50</SelectItem>
                        <SelectItem value="0">All</SelectItem>
                    </SelectContent>
                </Select>
                {!recentTransactionsCompact && (
                <label className="flex items-center gap-2 h-9 cursor-pointer shrink-0">
                  <Checkbox id="recent-show-narration" checked={showRecentNarration} onCheckedChange={(c) => setShowRecentNarration(!!c)} className="h-4 w-4" />
                  <span className="text-sm whitespace-nowrap">Show Narration</span>
                </label>
                )}
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
                {/* Clear icon ko Unapproved ke right dikhana hai; unapproved active hone par bhi force-visible. */}
                {(isRecentFilterActive || recentUnapprovedOnly) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={clearRecentFilters}
                    aria-label="Clear Filters"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
            </div>
          </div>
          )}
          {/* Count row: compact mobile ke liye niche fixed panel; yahan desktop/non-compact hi. */}
          {!recentTransactionsCompact && (
          <div className="flex h-9 w-full min-w-0 items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 font-medium text-muted-foreground',
                recentTransactionsCompact ? 'truncate text-sm' : 'text-sm'
              )}
              title={
                recentTransactionsCompact
                  ? `${recentTransactions.length} Vouchers Of ${recentPoolBeforeLimit.length}`
                  : `Showing ${recentTransactions.length} Vouchers Of All ${recentPoolBeforeLimit.length} Vouchers`
              }
            >
              {recentTransactionsCompact
                ? `${recentTransactions.length} Vouchers Of ${recentPoolBeforeLimit.length}`
                : `Showing ${recentTransactions.length} Vouchers Of All ${recentPoolBeforeLimit.length} Vouchers`}
            </span>
            <div className="relative h-9 w-[min(42vw,11rem)] shrink-0 sm:w-44">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                enterKeyHint="search"
                placeholder="Search"
                value={recentQuickSearch}
                onChange={(e) => setRecentQuickSearch(e.target.value)}
                className="h-9 py-1 pl-8 pr-2 text-sm"
                aria-label="Search recent vouchers"
              />
            </div>
          </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {/* Mobile: 2px horizontal gap so Recent transaction cards match Daybook spacing */}
        <div className={cn("w-full overflow-x-auto", recentTransactionsCompact && "px-[2px]")}>
        <TransactionsTable
          transactions={recentTransactions}
          context="daybook"
          onRowClick={(v) => {
            setSelectedVoucher(v);
            setIsVoucherDialogOpen(true);
          }}
          onHistoryVoucher={(v) => setHistoryVoucher(v)}
          onAddLink={(v) => {
            const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(v?.type);
            if (isPaymentType) setLinkPaymentVoucher(v);
            else setLinkAdvancesVoucher(v);
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
          transactionCardSearchHighlight={recentQuickSearch}
        />
        </div>
      </CardContent>
    </Card>
    </div>
  );

  const renderDashboardContent = () => {
    const shouldShow = (cardId: string) => visibleCard === 'all' || visibleCard === cardId;
    return (
    <div className="space-y-[5px]">
      {/* Keep consistent 5px spacing between dashboard cards/sections. */}
      {(visibleCard === "all" || visibleCard === "financial-summaries") && renderFinancialSummaries(isReportsEnabled, false)}
      {visibleCard === "dashboard-charts" && renderFinancialSummaries(isReportsEnabled, true)}
      {shouldShow('bank-cash-summary') && can('view_bank_cash_summary') && <BankCashSummary />}
      {/* Dashboard cards (Daybook, Bank, Recent) are gated by role permissions. If shared user doesn't see a card, check Settings → role permissions (e.g. View Daybook). */}
      {shouldShow('daybook') && can('view_daybook') && <div className="px-0.5"><DaybookReport /></div>}
      {shouldShow('recent-transactions') && can('view_recent_transactions') && renderRecentTransactions()}
      
      <Card className="col-span-full border-2 border-amber-300/70 pl-dashboard-ribbon-amber p-2 overflow-hidden relative">
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
              {greeting}, {user?.displayName || user?.email}! Welcome To Pocket Ledger
            </CardTitle>
          )}

          <p className="text-sm text-muted-foreground font-mono">
            {welcomeSystemDateTimeLine}
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
    { id: 'dashboard-charts', title: 'Chart' },
  ];
  /** User request: footer buttons solid, high-contrast alag-alag colors me dikhe */
  const footerToneClassByCard: Record<string, string> = {
    all: "border-slate-400 bg-slate-200 text-slate-800 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100",
    "financial-summaries": "border-orange-500 bg-orange-300 text-orange-950 dark:border-orange-400 dark:bg-orange-700 dark:text-orange-50",
    "bank-cash-summary": "border-emerald-500 bg-emerald-300 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-700 dark:text-emerald-50",
    daybook: "border-sky-500 bg-sky-300 text-sky-950 dark:border-sky-400 dark:bg-sky-700 dark:text-sky-50",
    "recent-transactions": "border-violet-500 bg-violet-300 text-violet-950 dark:border-violet-400 dark:bg-violet-700 dark:text-violet-50",
    "dashboard-charts": "border-fuchsia-500 bg-fuchsia-300 text-fuchsia-950 dark:border-fuchsia-400 dark:bg-fuchsia-800 dark:text-fuchsia-50",
  };

  /** Recent compact: gray controls + footer tabs ke beech gap hatane ke liye footer top padding band + `bottom` offset = sirf row height. */
  const isRecentCompactFooter =
    recentTransactionsCompact && visibleCard === "recent-transactions";
  /* Mobile: pehle `2+4+32` galat tha — `pt-1` `h-8` ke andar (border-box); asli ≈ 2+32=34. Recent compact: footer top pt band + `bottom` = sirf row (`h-8`/`h-[38px]`). */
  const footerReservePx = isMobile
    ? isRecentCompactFooter
      ? 32
      : 34
    : isRecentCompactFooter
      ? 38
      : 2 + 4 + 38;
  /** Compact recent: bottom controls panel (2 rows) footer ke upar fixed rahe, content overlap na kare. */
  const recentBottomControlsReservePx =
    recentTransactionsCompact && visibleCard === "recent-transactions" ? 74 : 0;

  return (
    <div className="px-0.5 pt-0.5" style={{ paddingBottom: footerReservePx + recentBottomControlsReservePx }}>
      <div className="p-0 min-h-0">
        {renderDashboardContent()}
      </div>

      {/* User request: top me sirf title+date; baaki controls ko footer ke upar fixed niche panel me rakho. */}
      {recentTransactionsCompact && visibleCard === "recent-transactions" && (
        <div
          className={cn(
            // Footer / upar Recent card jaisa: `98vw`+center se zyada wide hota tha — `px-0.5` + main column bounds taaki txn cards / sticky header ke barabar width.
            "fixed left-0 right-0 z-50 box-border px-0.5",
            !isMobile && (sidebarRailOpen ? "md:left-64" : "md:left-16")
          )}
          style={{ bottom: `${footerReservePx}px` }}
        >
          {/* Bottom controls: solid gray + opaque; `border-b-0` — niche emerald footer se flush, double border line na dikhe. */}
          <div className="w-full max-w-full box-border space-y-1 overflow-x-hidden border border-b-0 border-gray-300 bg-gray-200 px-1 py-1 dark:border-gray-600 dark:bg-gray-800">
            {/* Row 1: date change + rows + unapproved + clear */}
            {/* Controls row: wrap allow karo so small screens par content clip na ho. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex min-w-0 items-center gap-2 h-8">
                {(dateSystem === 'BS' || dateSystem === 'Both') && (
                  <BsDatePicker
                    isRange
                    valueAD={recentDateRange}
                    onChangeAD={(range) => setRecentDateRange(range as DateRange | undefined)}
                    transactionDates={transactionDates}
                    className="h-8 max-w-[8rem]"
                    hideTriggerIcon={true}
                    rangeEmptyLabel={"Change date"}
                    children={<span className="min-w-0 truncate">Change date</span>}
                  />
                )}
                {(dateSystem === 'AD' || dateSystem === 'Both') && (
                  <Popover open={isRecentCalendarOpen} onOpenChange={(open) => {
                    setIsRecentCalendarOpen(open);
                    if (open) setTempRecentDateRange(recentDateRange);
                    else setTempRecentDateRange(undefined);
                  }}>
                    <PopoverTrigger asChild>
                      <Button
                        id="recent-date-bottom"
                        variant={"outline"}
                        className="h-8 w-auto max-w-[8rem] min-w-0 shrink-0 justify-start text-left font-normal"
                      >
                        <span className="min-w-0 truncate">Change date</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <AdCalendar
                        rangePresetSlot={
                          <DateRangePresetRow
                            country={company?.country}
                            onApply={(r) => {
                              setTempRecentDateRange(r);
                              setRecentDateRange(r);
                              setIsRecentCalendarOpen(false);
                            }}
                          />
                        }
                        valueAD={tempRecentDateRange ?? recentDateRange}
                        isRange
                        numberOfMonths={calendarMonths}
                        transactionDates={transactionDates}
                        onSelect={(adDate) => {
                          const range = tempRecentDateRange ?? recentDateRange;
                          if (!range?.from || (range.from && range.to)) {
                            setTempRecentDateRange({ from: adDate, to: undefined });
                          } else if (adDate < range.from) {
                            const next = { from: adDate, to: range.from };
                            setTempRecentDateRange(next);
                            setRecentDateRange(next);
                            setIsRecentCalendarOpen(false);
                          } else {
                            const next = { from: range.from, to: adDate };
                            setTempRecentDateRange(next);
                            setRecentDateRange(next);
                            setIsRecentCalendarOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1 h-8">
                <Select value={recentRowsPerPage} onValueChange={(v) => setRecentRowsPerPage(v)}>
                  <SelectTrigger className="h-8 min-w-0 w-full max-w-[112px]">
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
                  className="h-8 whitespace-nowrap"
                  onClick={() => {
                    if (recentUnapprovedOnly) setRecentUnapprovedOnly(false);
                    else applyRecentUnapprovedFilter();
                  }}
                >
                  Unapproved
                </Button>
                {(isRecentFilterActive || recentUnapprovedOnly) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={clearRecentFilters}
                    aria-label="Clear Filters"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {/* Row 2: count + search */}
            <div className="flex h-8 w-full min-w-0 items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground"
                title={`${recentTransactions.length} Vouchers Of ${recentPoolBeforeLimit.length}`}
              >
                {`${recentTransactions.length} Vouchers Of ${recentPoolBeforeLimit.length}`}
              </span>
              <div className="relative h-8 w-[min(42vw,11rem)] shrink-0 sm:w-44">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  enterKeyHint="search"
                  placeholder="Search"
                  value={recentQuickSearch}
                  onChange={(e) => setRecentQuickSearch(e.target.value)}
                  className="h-8 py-1 pl-8 pr-2 text-sm"
                  aria-label="Search recent vouchers"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 px-0.5 pb-0",
          // Recent compact: top pad mat — gray fixed panel aur emerald footer ke beech safed gap.
          !isRecentCompactFooter && "pt-0.5",
          !isMobile && (sidebarRailOpen ? "md:left-64" : "md:left-16")
        )}
      >
        {/* User request: footer tabs ko ek hi green container me rakho; desktop row icon+label, mobile icon hide */}
        <div
          className={cn(
            "pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-emerald flex items-stretch justify-center gap-0.5 px-1 pb-0",
            !isRecentCompactFooter && "pt-1",
            // User request: desktop/PC me footer buttons ~20% taller; mobile unchanged.
            isMobile ? "h-8" : "h-[38px]"
          )}
        >
          {dashboardCards.map((card) => {
            const Icon =
              card.id === "all"
                ? Home
                : card.id === "financial-summaries"
                  ? TrendingUp
                  : card.id === "daybook"
                    ? FileTextIcon
                    : card.id === "bank-cash-summary"
                      ? Landmark
                      : card.id === "dashboard-charts"
                        ? BarChart3
                      : History;
            return (
              <Button
                key={card.id}
                variant="ghost"
                className={cn(
                  // Height compact: footer ko approx 50% reduce karo without breaking alignment
                  "h-full min-h-0 min-w-0 flex-1 rounded-md border-2 px-1 py-0.5 text-muted-foreground",
                  footerToneClassByCard[card.id] ?? "border-emerald-200/65 bg-white/55 dark:border-emerald-800/45 dark:bg-background/35",
                  isMobile ? "justify-center text-center" : "justify-center flex-row items-center gap-1.5",
                  // Active/focus state strong: selected button clearly pop kare
                  visibleCard === card.id && "ring-2 ring-primary/70 shadow-md saturate-125",
                  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                )}
                onClick={() => {
                  if (card.id === "dashboard-charts") {
                    if (visibleCard === "dashboard-charts") {
                      setVisibleCard(visibleCardBeforeChartsRef.current);
                      return;
                    }
                    if (visibleCard !== "dashboard-charts") {
                      visibleCardBeforeChartsRef.current = visibleCard;
                    }
                    setVisibleCard("dashboard-charts");
                    return;
                  }
                  setVisibleCard(card.id);
                }}
              >
                {!isMobile && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="text-[9px] font-medium leading-tight sm:text-[10px]">{card.title}</span>
              </Button>
            );
          })}
        </div>
      </div>
       <AddVoucherDialog 
          isOpen={isVoucherDialogOpen}
          onOpenChange={setIsVoucherDialogOpen}
          voucher={selectedVoucher}
          onVoucherAction={() => setSelectedVoucher(null)}
       />
       <HistoryDialog voucher={historyVoucher} isOpen={!!historyVoucher} onOpenChange={(open) => !open && setHistoryVoucher(null)} onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)} />
       {linkAdvancesVoucher && (
         <LinkAdvancesToVoucherDialog
           isOpen={!!linkAdvancesVoucher}
           onOpenChange={(open: boolean) => !open && setLinkAdvancesVoucher(null)}
           mode={linkAdvancesVoucher.type === "purchase" || linkAdvancesVoucher.type === "purchase_service" ? "purchase" : "sale"}
           targetVoucherId={linkAdvancesVoucher.id}
           targetPartyId={linkAdvancesVoucher.partyId ?? ""}
           targetPartyName={processedParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.name ?? "Party"}
           partyOpeningBalance={processedParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.openingBalance ?? 0}
           balanceKind="all"
           onDone={() => setLinkAdvancesVoucher(null)}
         />
       )}
       {linkPaymentVoucher && (
         <LinkPaymentToTxnsDialog
           isOpen={!!linkPaymentVoucher}
           onOpenChange={(open: boolean) => !open && setLinkPaymentVoucher(null)}
           variant={linkPaymentVoucher.type === "payment_out" || linkPaymentVoucher.type === "direct_expense" ? "payment_out" : "payment_in"}
           partyId={linkPaymentVoucher.partyId ?? null}
           partyName={processedParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.name ?? "Party"}
           receivedAmount={Number(linkPaymentVoucher.amount ?? linkPaymentVoucher.total ?? 0)}
           existingAllocations={Array.isArray(linkPaymentVoucher.allocations) ? linkPaymentVoucher.allocations : []}
           paymentInId={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
           paymentOutId={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
           paymentInVoucherNumber={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
           paymentInDate={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
           paymentOutVoucherNumber={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
           paymentOutDate={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
           partyOpeningBalance={processedParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.openingBalance ?? 0}
           onDone={async (allocations, _amount) => {
             if (!companyId || !linkPaymentVoucher?.id) return;
             try {
               await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, linkPaymentVoucher.id), { allocations });
               toast.success("Allocations updated.");
               setLinkPaymentVoucher(null);
             } catch (e: any) {
               toast.error(e?.message || "Failed to update allocations.");
             }
           }}
         />
       )}
    </div>
  );
}

function DashboardPageLoading() {
  return (
    // Loading shell: `min-h-screen`/`100vh` Windows taskbar overlap — dvh = visible viewport (Electron static app)
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="text-center text-muted-foreground">Loading dashboard...</div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<DashboardPageLoading />}>
      <DashboardPageContent />
    </Suspense>
  );
}

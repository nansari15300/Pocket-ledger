
"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Account } from "@/components/bank-cash/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Edit,
  Printer,
  Landmark,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  FileText,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Search,
  Wrench,
  Crown,
  Columns3,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { format, startOfDay, endOfDay, isSameDay } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerDescription as MobileDialogDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import AdCalendar from "@/components/ui/ad-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import { ScrollArea } from "../ui/scroll-area";
import { EditAccountDialog } from "../bank-cash/EditAccountDialog";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "../ui/input";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { useTransactionVisibleColumns, COLUMN_LABELS } from "../vouchers/transactionColumnVisibility";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Checkbox } from "../ui/checkbox";
import { useTransactions } from "@/hooks/use-transactions";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "../ui/badge";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountDetailsProps {
  account: Account;
  onAccountUpdated: (updatedAccount: Partial<Account>) => void;
  onAccountDeleted: (deletedId: string) => void;
  dateRange?: DateRange | undefined;
  onDateRangeChange: (value: DateRange | undefined) => void;
  onBack?: () => void;
  allAccounts?: any[];
  userNames?: Record<string, string>;
  transactions?: any[];
}

export function AccountDetails({
  account: initialAccount,
  onAccountUpdated,
  onAccountDeleted,
  dateRange,
  onDateRangeChange,
  onBack,
  allAccounts,
  userNames,
  transactions
}: AccountDetailsProps) {
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatRunning } =
    useDate();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { vouchers, processedParties, processedStaff, processedExpenseAccounts, journalAccountNames } = useVouchers();
  const { user } = useAuth();
  const { can } = usePermissions();
  const effectiveBalanceMode = "statement" as const;

  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "contra">(null);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  const BANK_SPEND_WISE_VIEW_KEY = "bank-cash-spendWiseView";
  const [spendWiseView, setSpendWiseViewState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(BANK_SPEND_WISE_VIEW_KEY) === "true";
    } catch {
      return false;
    }
  });
  const setSpendWiseView = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSpendWiseViewState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(BANK_SPEND_WISE_VIEW_KEY, next ? "true" : "false");
      } catch {}
      return next;
    });
  }, []);
  const openingModalRef = useRef(false);

  // Desktop Calendar State
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  
  // Local State for Calendar Buffer
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);

  // Sync tempDateRange when prop changes
  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  const canViewSpecialBalance = can('view_special_account_balance');
  const showMaskedBalance = initialAccount.isSpecial && !canViewSpecialBalance;

  const account = useMemo(() => {
    if (!allAccounts) return initialAccount;
    return allAccounts.find(p => p.id === initialAccount.id) || initialAccount;
  }, [allAccounts, initialAccount]);

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    vouchers.forEach((v) => {
        const isRelevant =
            v.accountId === account.id ||
            v.toAccountId === account.id ||
            v.fromAccountId === account.id ||
            (v.entries && v.entries.some((e: any) => e.accountId === account.id));

        if (isRelevant) {
            const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
            if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                dates.add(startOfDay(dateValue).getTime());
            }
        }
    });
    return Array.from(dates).map(d => new Date(d));
  }, [vouchers, account.id]);

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen =
    isMobile &&
    (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen || isEditAccountDialogOpen);

  const openModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("modal", "1");
    params.set("modalts", String(Date.now()));
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("modal");
    params.delete("modalts");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams, router]);

  const modalParam = searchParams.get("modal");
  const urlModalOpen = isMobile && modalParam === "1" && anyMobilePopupOpen;
  const closeUrlModal = useCallback(() => {
    setMobileFooterDialogOpen(null);
    setIsCalendarOpen(false);
    setIsVoucherDialogOpen(false);
    setSelectedVoucher(null);
    setIsNoteOpen(false);
    setIsEditAccountDialogOpen(false);
    closeModalInUrl();
  }, [closeModalInUrl]);
  useUrlModalBack(urlModalOpen, closeUrlModal);

  useEffect(() => {
    if (!isMobile) return;
    if (modalParam === "1") openingModalRef.current = false;
    if (modalParam !== "1" && anyMobilePopupOpen && !openingModalRef.current) {
      setMobileFooterDialogOpen(null);
      setIsCalendarOpen(false);
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      setIsNoteOpen(false);
      setIsEditAccountDialogOpen(false);
      closeModalInUrl();
    }
  }, [isMobile, modalParam, anyMobilePopupOpen, closeModalInUrl]);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const handleEditVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

  const handleTransactionOpen = useCallback((voucher: any) => {
    handleEditVoucher(voucher);
  }, [handleEditVoucher]);
  
  let { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions(account, 'account', dateRange, undefined, allAccounts, transactions, undefined, filters, undefined, undefined, userNames);

  // If special account and user can't see balance, filter transactions to only show their own.
  if (account.isSpecial && !canViewSpecialBalance) {
      processedTransactions = processedTransactions.filter(t => t.userId === user?.uid);
      openingBalanceForPeriod = 0; // Don't show opening balance
      periodDr = processedTransactions.reduce((sum, t) => sum + (t.debit || 0), 0);
      periodCr = processedTransactions.reduce((sum, t) => sum + (t.credit || 0), 0);
      closingBalance = periodDr - periodCr;
  }

  const spendWiseEnabled = (company as any)?.spendWiseEnabled === true;
  const displayTransactions = useMemo(() => {
    if (!spendWiseView || !spendWiseEnabled || !vouchers?.length) return processedTransactions;
    const byId = new Map(processedTransactions.map((t: any) => [t.id, t]));
    const inRangeIds = new Set(processedTransactions.map((t: any) => t.id));
    const accountId = account.id;
    const isInVoucher = (v: any) =>
      (v.type === "payment_in" && v.accountId === accountId) ||
      (v.type === "direct_income" && v.accountId === accountId) ||
      (v.type === "contra" && v.toAccountId === accountId);
    const linkedOutFilter = (v: any, inId: string) => {
      const hasAccount =
        (v.type === "payment_out" && v.accountId === accountId) ||
        (v.type === "direct_expense" && v.accountId === accountId) ||
        (v.type === "contra" && v.fromAccountId === accountId);
      return hasAccount && Array.isArray(v.linkedPaymentInIds) && v.linkedPaymentInIds.includes(inId);
    };
    const inVouchers = vouchers
      .filter((v: any) => {
        if (!isInVoucher(v) || v.isDeleted) return false;
        if (inRangeIds.has(v.id)) return true;
        return vouchers.some((o: any) => linkedOutFilter(o, v.id) && inRangeIds.has(o.id));
      })
      .sort((a: any, b: any) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return da.getTime() - db.getTime();
      });
    const voucherToInRow = (v: any) => {
      const existing = byId.get(v.id);
      if (existing) return existing;
      const amount = Number(v.amount ?? v.total ?? 0) || 0;
      return { id: v.id, date: v.date, type: v.type, voucherNumber: v.voucherNumber, debit: amount, credit: 0, userId: v.userId, narration: v.narration, accountId: v.accountId, ...v };
    };
    const voucherToOutRow = (v: any) => {
      const existing = byId.get(v.id);
      if (existing) return existing;
      const amount = Number(v.total ?? v.amount ?? 0) || 0;
      return {
        id: v.id, date: v.date, type: v.type, voucherNumber: v.voucherNumber,
        debit: 0, credit: amount,
        userId: v.userId, narration: v.narration, accountId: v.accountId, ...v,
      };
    };
    const rows: any[] = [];
    let groupColorIndex = 0;
    let rowKeySeed = 0;
    const nextColor = () => (groupColorIndex++) % 4;
    const nextRowKey = () => `r-${rowKeySeed++}`;

    inVouchers.forEach((pi: any) => {
      const t = voucherToInRow(pi);
      const linkedOuts = vouchers.filter((v: any) => linkedOutFilter(v, pi.id));
      const hasLinkedGroup = linkedOuts.length > 0;
      const colorIdx = nextColor();
      const groupRunning = (t.debit || 0) - (t.credit || 0);
      if (hasLinkedGroup) {
        rows.push({
          ...t,
          _rowKey: nextRowKey(),
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: false,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
      } else {
        rows.push({
          ...t,
          _rowKey: nextRowKey(),
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: true,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
        rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-pi-${pi.id}`, _rowKey: nextRowKey() });
      }
      linkedOuts.forEach((po: any, idx: number) => {
        const outRow = voucherToOutRow(po);
        const prevRunning = rows.length > 0 ? (rows[rows.length - 1] as any)._spendWiseRunningBalance : 0;
        const fullAmount = Number(po.total ?? po.amount ?? 0) || Math.abs((outRow.debit || 0) - (outRow.credit || 0)) || 0;
        const linkedAmounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
        const linkedAmount = linkedAmounts?.[pi.id] != null ? Number(linkedAmounts[pi.id]) : fullAmount / (po.linkedPaymentInIds?.length || 1);
        const amountDelta = (outRow.credit || 0) > (outRow.debit || 0) ? -linkedAmount : linkedAmount;
        const nextRunning = typeof prevRunning === "number" ? prevRunning + amountDelta : prevRunning;
        rows.push({
          ...outRow,
          _rowKey: nextRowKey(),
          _spendWiseChild: true,
          _spendWiseGroupFirst: false,
          _spendWiseGroupLast: idx === linkedOuts.length - 1,
          _spendWiseRunningBalance: nextRunning,
          _spendWiseGroupColorIndex: colorIdx,
          _spendWiseLinkedAmount: linkedAmount,
        });
      });
      if (hasLinkedGroup) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-in-${pi.id}`, _rowKey: nextRowKey() });
    });
    const addedIds = new Set(rows.filter((r: any) => r.id && !(r as any)._spendWiseSpacer).map((r: any) => r.id));
    const unlinked = processedTransactions.filter((t: any) => !addedIds.has(t.id));
    unlinked.forEach((t: any, idx: number) => {
      const colorIdx = nextColor();
      const voucherBalance = (t.debit || 0) - (t.credit || 0);
      rows.push({
        ...t,
        _rowKey: nextRowKey(),
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: true,
        _spendWiseRunningBalance: voucherBalance,
        _spendWiseGroupColorIndex: colorIdx,
      });
      if (idx < unlinked.length - 1) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-unlinked-${t.id}`, _rowKey: nextRowKey() });
    });
    return rows.length ? rows : processedTransactions;
  }, [spendWiseView, spendWiseEnabled, processedTransactions, vouchers, account.id]);

  const displayTransactionCount = useMemo(
    () => displayTransactions.filter((t: any) => !(t as any)._spendWiseSpacer).length,
    [displayTransactions]
  );

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);

  const clearFilters = () => {
    if(onDateRangeChange) {
      onDateRangeChange(undefined);
    }
    setFilters({});
  };

  const totalPages =
    rowsPerPage > 0 ? Math.ceil(displayTransactions.length / rowsPerPage) : 1;
  const paginatedTransactions =
    rowsPerPage > 0
      ? displayTransactions.slice(
          (currentPage - 1) * rowsPerPage,
          currentPage * rowsPerPage
        )
      : displayTransactions;

  const buildDateRangeText = () => {
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
    return dateRangeText;
  };

  const handlePrintStatement = async () => {
    if (!company) return;
    const toastId = toast.loading("Preparing print...");
    try {
      await openPrintDirect({
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
        title: `Account Statement: ${account.accountName}`,
        context: "account",
        contextId: account.id,
        dateSystem: dateSystem,
        dateRangeText: buildDateRangeText(),
        vouchersCount: processedTransactions.length,
        openingBalance: openingBalanceForPeriod,
        transactions: processedTransactions,
        showNarration: showNarration,
        billWise: false,
      }, true);
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };

  const handlePrintBillWise = async () => {
    if (!company) return;
    const toastId = toast.loading("Preparing print...");
    try {
      await openPrintDirect({
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
        title: `Bill Wise Account Statement: ${account.accountName}`,
        context: "account",
        contextId: account.id,
        dateSystem: dateSystem,
        dateRangeText: buildDateRangeText(),
        vouchersCount: processedTransactions.length,
        openingBalance: openingBalanceForPeriod,
        transactions: processedTransactions,
        showNarration: showNarration,
        billWise: true,
        openingBalanceOutstanding: showMaskedBalance ? undefined : openingBalanceOutstanding,
        openingBalanceLinkedVoucherNos: showMaskedBalance ? undefined : openingBalanceLinkedVoucherNos,
      }, true);
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };
  
  const balanceText = useMemo(() => {
    if (closingBalance === 0) return "Settled";
    return closingBalance >= 0 ? "Dr" : "Cr";
  }, [closingBalance]);
  
  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!onDateRangeChange) return;
    if (!range?.from || (range.from && range.to)) {
      if (onDateRangeChange) onDateRangeChange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      if (onDateRangeChange) onDateRangeChange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      if (onDateRangeChange) onDateRangeChange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
    }
  };
  
  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return displayTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return displayTransactions.filter(t => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        t.voucherNumber?.toLowerCase().includes(lowerCaseSearch) ||
        t.type.replace(/_/g, " ").toLowerCase().includes(lowerCaseSearch) ||
        t.narration?.toLowerCase().includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [displayTransactions, mobileSearchTerm, formatDate, formatDateBS]);

  // Mobile: show last 10 by default (no date filter), all when date filter applied. When no date filter, keep full groups (don't cut a group).
  const mobileTransactionsToShow = useMemo(() => {
    const hasDateFilter = !!dateRange && (dateRange.from != null || dateRange.to != null);
    if (hasDateFilter) return filteredMobileTransactions;
    const list = filteredMobileTransactions;
    if (list.length <= 10) return list;
    const isSpacer = (r: any) => !!(r as any)._spendWiseSpacer;
    const inGroup = (r: any) => typeof (r as any)._spendWiseGroupColorIndex === "number";
    const last10Indices: number[] = [];
    for (let i = list.length - 1; i >= 0 && last10Indices.length < 10; i--) {
      if (isSpacer(list[i])) continue;
      last10Indices.unshift(i);
    }
    const showIndices = new Set<number>();
    for (const idx of last10Indices) {
      const row = list[idx];
      if (inGroup(row)) {
        let start = idx;
        while (start > 0 && (isSpacer(list[start - 1]) || inGroup(list[start - 1]))) {
          start--;
          if (!isSpacer(list[start]) && (list[start] as any)._spendWiseGroupFirst) break;
        }
        let end = idx;
        while (end < list.length - 1 && (isSpacer(list[end + 1]) || inGroup(list[end + 1]))) {
          end++;
          if (!isSpacer(list[end]) && (list[end] as any)._spendWiseGroupLast) break;
        }
        for (let j = start; j <= end; j++) showIndices.add(j);
      } else {
        showIndices.add(idx);
      }
    }
    return list.filter((_, i) => showIndices.has(i));
  }, [filteredMobileTransactions, dateRange]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) return "Last 10 Txns";
    return buildDateRangeText();
  }, [dateRange, dateSystem, formatDateBS]);

  const accountNamesMap = useMemo(
    () => ({
      ...Object.fromEntries((allAccounts || []).map((a) => [a.id, a.accountName])),
      ...Object.fromEntries((processedParties || []).map((p) => [p.id, p.name])),
      ...Object.fromEntries((processedStaff || []).map((s) => [s.id, s.name])),
      ...Object.fromEntries((processedExpenseAccounts || []).map((e) => [e.id, e.name])),
    }),
    [allAccounts, processedParties, processedStaff, processedExpenseAccounts]
  );

  const handleMobileBack = useCallback(() => {
    if (mobileFooterDialogOpen) {
      setMobileFooterDialogOpen(null);
      closeModalInUrl();
      return;
    }
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
      closeModalInUrl();
      return;
    }
    if (isVoucherDialogOpen) {
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      closeModalInUrl();
      return;
    }
    if (isEditAccountDialogOpen) {
      setIsEditAccountDialogOpen(false);
      closeModalInUrl();
      return;
    }
    if (isNoteOpen) {
      setIsNoteOpen(false);
      setNoteEntityId(null);
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isEditAccountDialogOpen, isNoteOpen, closeModalInUrl, onBack]);

  const renderMobileView = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      {/* No pb-24 here: scroll area extends to footer; inner content has pb-24 so last row clears footer */}
      {/* Row 1: Bank Account Details (left) | Showing x of y voucher(s) (right) - same as Party Details */}
      <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleMobileBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-base font-bold truncate flex-1 min-w-0">Bank Account Details</h1>
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
          Showing {mobileTransactionsToShow.length} of {filteredMobileTransactions.length} voucher(s)
        </span>
      </div>
      {/* Row 2: Last 10 Txns or date range label - same as Party Details */}
      <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
        <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
        {dateRange != null && (dateRange.from != null || dateRange.to != null) && onDateRangeChange && (
          <button
            type="button"
            onClick={() => onDateRangeChange(undefined)}
            className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Clear date filter"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Balance row */}
      <div className="px-3 py-3 border-b flex-shrink-0">
        <p className={cn("text-2xl font-bold flex justify-center items-baseline gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
          {showMaskedBalance ? (
            "*****"
          ) : closingBalance === 0 ? (
            "Settled"
          ) : (
            <>
              <span>{formatCurrency(Math.abs(closingBalance), { noSuffix: true })}</span>
              <span className="text-lg">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
            </>
          )}
        </p>
      </div>
      {/* Account dropdown + Edit icon + Search - same size (equal width & height) */}
      <div className="p-2 border-b flex-shrink-0">
        <div className="flex items-stretch gap-2">
          {allAccounts && allAccounts.length > 0 && (
            <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
              <Combobox
                options={allAccounts.map((p) => ({ value: p.id, label: p.accountName }))}
                value={account?.id || ""}
                onChange={(value) => {
                  if (value && value !== account.id) router.push(`/bank-cash/${value}`);
                }}
                placeholder="Select an account"
              />
            </div>
          )}
          {account.id !== "all" && (!account.isSpecial || can("manage_special_bank_accounts")) && (
            <EditAccountDialog
              account={account}
              allAccounts={allAccounts}
              onAccountUpdated={onAccountUpdated}
              onAccountDeleted={onAccountDeleted}
              hasTransactions={processedTransactions.length > 0}
              isOpen={isEditAccountDialogOpen}
              onOpenChange={(open) => {
                setIsEditAccountDialogOpen(open);
                if (open) {
                  openingModalRef.current = true;
                  openModalInUrl();
                } else {
                  closeModalInUrl();
                }
              }}
            >
              <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                <Edit className="h-4 w-4" />
              </Button>
            </EditAccountDialog>
          )}
          <div className="flex-1 min-w-0 h-9 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
            <Input
              placeholder="Search transactions"
              className="pl-8 h-9 text-sm w-full min-w-0"
              value={mobileSearchTerm}
              onChange={(e) => setMobileSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>
      {/* Transaction list - fills to footer line; inner pb-24 so last row scrolls above fixed footer */}
      <div className={cn("flex-1 min-h-0 overflow-auto", spendWiseView && spendWiseEnabled && "p-[2px]")}>
        <div className="pb-24">
          <TransactionsTable
            transactions={mobileTransactionsToShow}
            context="account"
            contextId={account.id}
            openingBalance={openingBalanceForPeriod}
            openingBalanceOutstanding={showMaskedBalance ? undefined : openingBalanceOutstanding}
            openingBalanceLinkedVoucherNos={showMaskedBalance ? undefined : openingBalanceLinkedVoucherNos}
            showNarration={showNarration}
            visibleColumns={visibleColumns}
            journalAccountNames={journalAccountNames}
            userNames={userNames}
            accountNames={accountNamesMap}
            onRowClick={handleTransactionOpen}
            filters={filters}
            setFilters={setFilters}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            periodDr={showMaskedBalance ? undefined : periodDr}
            periodCr={showMaskedBalance ? undefined : periodCr}
            closingBalance={showMaskedBalance ? undefined : closingBalance}
            isBalanceMasked={showMaskedBalance}
            scrollOnlyTransactions
          />
        </div>
      </div>
      
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
             {spendWiseEnabled && (
               <Button
                 type="button"
                 variant={spendWiseView ? "default" : "outline"}
                 size="sm"
                 className={cn(
                   "flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0",
                   !spendWiseView && "bg-violet-600 hover:bg-violet-700 text-white border-0"
                 )}
                 onClick={() => setSpendWiseView(!spendWiseView)}
               >
                 {spendWiseView ? "Statement" : "Spend wise"}
               </Button>
             )}
             <Button
               className="flex-1 h-6 min-w-0 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
               onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_in"); openModalInUrl(); }}
             >
               Receive
             </Button>
             <Button
               className="flex-1 h-6 min-w-0 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
               onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_out"); openModalInUrl(); }}
             >
               Pay
             </Button>
             <Button
               className="flex-1 h-6 min-w-0 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
               onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("contra"); openModalInUrl(); }}
             >
               Contra
             </Button>
            <Drawer
              open={isCalendarOpen}
              onOpenChange={(open) => {
                if (open) {
                  openingModalRef.current = true;
                  openModalInUrl();
                } else {
                  closeModalInUrl();
                }
                setIsCalendarOpen(open);
              }}
            >
              <DrawerTrigger asChild>
                <Button className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium px-1 bg-pink-600 hover:bg-pink-700 text-white"><CalendarIcon className="h-3.5 w-3.5 shrink-0" /></Button>
              </DrawerTrigger>
              <DrawerContent>
                 <DrawerHeader className="p-4 text-left">
                    <DrawerTitle>Select Date Range</DrawerTitle>
                    <MobileDialogDescription>
                        Select a starting and ending date for the transaction list.
                    </MobileDialogDescription>
                </DrawerHeader>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                    {(dateSystem === 'BS' || dateSystem === 'Both') && (
                       <NepaliCalendar
                          onSelect={handleNepaliSelect}
                          valueAD={dateRange}
                          isRange={true}
                          numberOfMonths={calendarMonths}
                        />
                    )}
                    {(dateSystem === 'AD' || dateSystem === 'Both') && (
                      <div className="flex-1 w-full min-w-0">
                        <AdCalendar
                          valueAD={dateRange}
                          isRange
                          numberOfMonths={calendarMonths}
                          transactionDates={transactionDates}
                          onSelect={(adDate) => {
                            const range = dateRange;
                            if (!range?.from || (range.from && range.to)) {
                              onDateRangeChange?.({ from: adDate, to: undefined });
                            } else if (adDate < range.from) {
                              onDateRangeChange?.({ from: adDate, to: range.from });
                              setIsCalendarOpen(false);
                            } else {
                              onDateRangeChange?.({ from: range.from, to: adDate });
                              setIsCalendarOpen(false);
                            }
                          }}
                        />
                      </div>
                    )}
                 </div>
                 <DrawerFooter className="p-4 pt-2">
                    <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
        </div>
    </div>
  );

  const renderDesktopView = () => {
    return (
     <div className="h-full flex flex-col">
        {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
              <Avatar className="h-12 w-12 text-lg flex-shrink-0">
                <AvatarImage src={account.fileUrl} alt={account.accountName} />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {account.isSpecial ? <Crown className="h-6 w-6 text-amber-500" /> : <Landmark className="h-6 w-6" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{account.accountName}</h2>
                {account.id !== 'all' && (!account.isSpecial || can('manage_special_bank_accounts')) && (
                  <EditAccountDialog
                    account={account}
                    allAccounts={allAccounts}
                    onAccountUpdated={onAccountUpdated}
                    onAccountDeleted={onAccountDeleted}
                    hasTransactions={processedTransactions.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditAccountDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0 flex justify-center items-baseline gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {showMaskedBalance ? (
                    "*****"
                  ) : closingBalance === 0 ? (
                    "Settled"
                  ) : (
                    <>
                      <span>{formatCurrency(Math.abs(closingBalance), { showDrCr: false })}</span>
                      <span className="text-sm">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={onDateRangeChange}
                  transactionDates={transactionDates}
                  className="w-auto"
                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn("justify-start text-left font-normal h-10 px-2 w-auto flex-shrink-0", !dateRange && "text-muted-foreground")}
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
                    <AdCalendar
                      valueAD={tempDateRange}
                      isRange
                      numberOfMonths={calendarMonths}
                      transactionDates={transactionDates}
                      onSelect={(adDate) => {
                        const range = tempDateRange;
                        if (!range?.from || (range.from && range.to)) {
                          setTempDateRange({ from: adDate, to: undefined });
                        } else if (adDate < range.from) {
                          const next = { from: adDate, to: range.from };
                          setTempDateRange(next);
                          onDateRangeChange(next);
                          setIsDesktopCalendarOpen(false);
                        } else {
                          const next = { from: range.from, to: adDate };
                          setTempDateRange(next);
                          onDateRangeChange(next);
                          setIsDesktopCalendarOpen(false);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {isFilterActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 flex-shrink-0">
                  <XCircle className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
              {spendWiseEnabled && (
                <Button
                  variant={spendWiseView ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpendWiseView(!spendWiseView)}
                  className="flex-shrink-0 h-10"
                >
                  {spendWiseView ? "Statement" : "Spend wise"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsNoteOpen(true)} className="flex-shrink-0 h-10">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrintStatement} className="flex-shrink-0 h-10 w-10">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* TABLE AREA - Statement = running balance; Bill wise = per-row outstanding (same as PartyDetails) */}
        <div className="flex-1 flex flex-col min-h-0 overflow-x-auto scrollbar-slim-dim">
          <div className={cn("py-4 flex-1 flex flex-col min-h-0 min-w-0", spendWiseView && spendWiseEnabled && "p-[2px]")}>
            <TransactionsTable
              key={`account-${account.id}-${effectiveBalanceMode}`}
              transactions={paginatedTransactions}
              context="account"
              contextId={account.id}
              openingBalance={showMaskedBalance ? 0 : openingBalanceForPeriod}
              openingBalanceOutstanding={showMaskedBalance ? undefined : openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={showMaskedBalance ? undefined : openingBalanceLinkedVoucherNos}
              openingBalanceActions={
                account.id !== "all" && (!account.isSpecial || can("manage_special_bank_accounts")) ? (
                  <EditAccountDialog
                    account={account}
                    allAccounts={allAccounts}
                    onAccountUpdated={onAccountUpdated}
                    onAccountDeleted={onAccountDeleted}
                    hasTransactions={processedTransactions.length > 0}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </EditAccountDialog>
                ) : null
              }
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              journalAccountNames={journalAccountNames}
              userNames={userNames}
              accountNames={accountNamesMap}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={showMaskedBalance ? undefined : periodDr}
              periodCr={showMaskedBalance ? undefined : periodCr}
              closingBalance={showMaskedBalance ? undefined : closingBalance}
              isBalanceMasked={showMaskedBalance}
              scrollOnlyTransactions
            />
          </div>
        </div>
        {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{displayTransactionCount} transaction(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-account" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-account" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 flex-shrink-0">
                    <Columns3 className="h-4 w-4" />
                    Columns
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 p-2">
                  {(Object.keys(COLUMN_LABELS) as TransactionColumnKey[])
                    .filter((key) => key !== "status")
                    .map((key) => (
                      <DropdownMenuItem
                        key={key}
                        onSelect={(e) => e.preventDefault()}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          id={`col-${key}-account`}
                          checked={visibleColumns[key] !== false}
                          onCheckedChange={(c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-account`} className="text-sm font-medium flex-1 cursor-pointer">
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <p className="text-sm font-medium flex-shrink-0">Rows per page</p>
              <Select
                value={`${rowsPerPage}`}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value) || 0);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={`${rowsPerPage}`} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>
                  ))}
                  <SelectItem value="0">All</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm font-medium flex-shrink-0">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center space-x-1 flex-shrink-0">
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
  }

  return (
    <>
      <div className={cn("h-full", isMobile && "flex flex-col min-h-0")}>
        {isMobile ? renderMobileView() : renderDesktopView()}
      </div>
      <Dialog
        open={isNoteOpen}
        onOpenChange={(open) => {
          setIsNoteOpen(open);
          if (!open) {
            setNoteEntityId(null);
            closeModalInUrl();
          } else if (isMobile) {
            openingModalRef.current = true;
            openModalInUrl();
          }
        }}
      >
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for {account.accountName}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onAccountUpdated(account);
                setIsNoteOpen(false);
              }}
              initialContext="Bank/Cash"
              initialEntityId={account.id}
            />
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        defaultTab={mobileFooterDialogOpen ?? "payment_in"}
        isOpen={mobileFooterDialogOpen !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setMobileFooterDialogOpen(null);
            closeModalInUrl();
          }
        }}
      />
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsVoucherDialogOpen(!!open);
          if (!open) {
            setSelectedVoucher(null);
            if (isMobile) closeModalInUrl();
          }
        }}
        voucher={selectedVoucher}
        onVoucherUpdated={() => setSelectedVoucher(null)}
      />
    </>
  );
}

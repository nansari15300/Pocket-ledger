
"use client";

import * as React from "react";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Edit, Printer, Users, Calendar as CalendarIcon, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FilePlus, XCircle, MoreVertical, ArrowLeft, Scroll, DollarSign, ChevronDown, Crown, Columns3, Search } from "lucide-react";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { useTransactionVisibleColumns, COLUMN_LABELS } from "../vouchers/transactionColumnVisibility";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, format } from "date-fns";
import AdCalendar from "../ui/ad-calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { useCompany } from "@/hooks/useCompany";
import { EditAccountGroupDialog } from "@/components/bank-cash/EditAccountGroupDialog";
import { AccountFilterDropdown } from "@/components/bank-cash/AccountFilterDropdown";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import { useTransactions } from "@/hooks/use-transactions";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { useVouchers } from "@/hooks/useVouchers";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from "@/lib/firebase";
import usePermissions from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
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
import NepaliCalendar from "../ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";


const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function AccountGroupDetails({ 
  group,
  allGroups,
  accounts,
  onGroupUpdated, 
  onGroupDeleted,
  onAccountUpdated,
  dateRange,
  onDateRangeChange,
  onBack,
  userNames,
}: { 
  group: AccountGroup, 
  allGroups: AccountGroup[],
  accounts: Account[],
  onGroupUpdated: () => void, 
  onGroupDeleted: () => void,
  onAccountUpdated: () => void,
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames?: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { company } = useCompany();
  const { vouchers, processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts, journalAccountNames } = useVouchers();
  const { can } = usePermissions();
  const { user } = useAuth();
  const spendWiseEnabled = (company as { spendWiseEnabled?: boolean } | null)?.spendWiseEnabled === true;
  const BANK_GROUP_SPEND_WISE_VIEW_KEY = "bank-group-spendWiseView";
  const [spendWiseView, setSpendWiseViewState] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem(BANK_GROUP_SPEND_WISE_VIEW_KEY);
      return stored !== "false";
    } catch {
      return true;
    }
  });
  const setSpendWiseView = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSpendWiseViewState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(BANK_GROUP_SPEND_WISE_VIEW_KEY, next ? "true" : "false");
      } catch {}
      return next;
    });
  }, []);
  const accountsInGroup = useMemo(() => accounts.filter((a) => a.groupId === group.id), [accounts, group.id]);
  const accountIdsInGroup = useMemo(() => accountsInGroup.map((a) => a.id), [accountsInGroup]);
  const childGroups = useMemo(() => allGroups.filter((g) => (g as any).parentId === group.id), [allGroups, group.id]);

  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "contra">(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const openingModalRef = useRef(false);

  const containsSpecialAccount = useMemo(() => accounts.some(acc => acc.isSpecial), [accounts]);
  const canViewSpecialBalance = can('view_special_account_balance');
  const isBalanceMasked = containsSpecialAccount && !canViewSpecialBalance;


  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);
  
  let { openingBalanceForPeriod, processedTransactions, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions({ ...group, items: accounts }, "group", dateRange, undefined, processedAccounts, undefined, undefined, filters, undefined, undefined, userNames);

  // If special account and user can't see balance, filter transactions to only show their own.
  if (containsSpecialAccount && !canViewSpecialBalance) {
      processedTransactions = processedTransactions.filter(t => t.userId === user?.uid);
      openingBalanceForPeriod = 0; // Don't show opening balance
      periodDr = processedTransactions.reduce((sum, t) => sum + (t.debit || 0), 0);
      periodCr = processedTransactions.reduce((sum, t) => sum + (t.credit || 0), 0);
      closingBalance = periodDr - periodCr;
  }

  const displayTransactions = useMemo(() => {
    if (!spendWiseView || !spendWiseEnabled || !vouchers?.length) return processedTransactions;
    const inRangeIds = new Set(processedTransactions.map((t: any) => t.id));
    const byId = new Map(processedTransactions.map((t: any) => [t.id, t]));
    const accountIdSet = new Set(accountIdsInGroup);
    const isInVoucher = (v: any) =>
      (v.type === "payment_in" && accountIdSet.has(v.accountId)) ||
      (v.type === "direct_income" && accountIdSet.has(v.accountId)) ||
      (v.type === "contra" && accountIdSet.has(v.toAccountId));
    const linkedOutFilter = (v: any, inId: string) => {
      const hasAccount =
        (v.type === "payment_out" && accountIdSet.has(v.accountId)) ||
        (v.type === "direct_expense" && accountIdSet.has(v.accountId)) ||
        (v.type === "contra" && accountIdSet.has(v.fromAccountId));
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
    const rows: any[] = [];
    let groupColorIndex = 0;
    const nextColor = () => (groupColorIndex++) % 4;

    const voucherToInRow = (v: any) => {
      const existing = byId.get(v.id);
      if (existing) return existing;
      const amount = Number(v.amount ?? v.total ?? 0) || 0;
      return { id: v.id, date: v.date, type: v.type, voucherNumber: v.voucherNumber, debit: amount, credit: 0, userId: v.userId, narration: v.narration, accountId: v.accountId, ...v };
    };
    const voucherToRow = (po: any) => {
      const existing = byId.get(po.id);
      if (existing) return existing;
      const amount = Number(po.total ?? po.amount ?? 0) || 0;
      return {
        id: po.id,
        date: po.date,
        type: po.type,
        voucherNumber: po.voucherNumber,
        debit: 0,
        credit: amount,
        userId: po.userId,
        narration: po.narration,
        accountId: po.accountId,
        ...po,
      };
    };

    inVouchers.forEach((pi: any) => {
      const t = voucherToInRow(pi);
      const linkedOuts = vouchers.filter((v: any) => linkedOutFilter(v, pi.id));
      const hasLinkedGroup = linkedOuts.length > 0;
      const colorIdx = nextColor();
      const groupRunning = (t.debit || 0) - (t.credit || 0);
      if (hasLinkedGroup) {
        rows.push({
          ...t,
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: false,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
      } else {
        rows.push({
          ...t,
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: true,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
        rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-pi-${pi.id}` });
      }
      linkedOuts.forEach((po: any, idx: number) => {
        const outRow = voucherToRow(po);
        const prevRunning = rows.length > 0 ? (rows[rows.length - 1] as any)._spendWiseRunningBalance : 0;
        const fullAmount = Number(po.total ?? po.amount ?? 0) || Math.abs((outRow.debit || 0) - (outRow.credit || 0)) || 0;
        const linkedAmounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
        const linkedAmount = linkedAmounts?.[pi.id] != null ? Number(linkedAmounts[pi.id]) : fullAmount / (po.linkedPaymentInIds?.length || 1);
        const amountDelta = (outRow.credit || 0) > (outRow.debit || 0) ? -linkedAmount : linkedAmount;
        const nextRunning = typeof prevRunning === "number" ? prevRunning + amountDelta : prevRunning;
        rows.push({
          ...outRow,
          _spendWiseChild: true,
          _spendWiseGroupFirst: false,
          _spendWiseGroupLast: idx === linkedOuts.length - 1,
          _spendWiseRunningBalance: nextRunning,
          _spendWiseGroupColorIndex: colorIdx,
          _spendWiseLinkedAmount: linkedAmount,
        });
      });
      if (hasLinkedGroup) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-in-${pi.id}` });
    });
    const addedIds = new Set(rows.filter((r: any) => r.id && !(r as any)._spendWiseSpacer).map((r: any) => r.id));
    const unlinked = processedTransactions.filter((t: any) => !addedIds.has(t.id));
    unlinked.forEach((t: any, idx: number) => {
      const colorIdx = nextColor();
      const voucherBalance = (t.debit || 0) - (t.credit || 0);
      rows.push({
        ...t,
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: true,
        _spendWiseRunningBalance: voucherBalance,
        _spendWiseGroupColorIndex: colorIdx,
      });
      if (idx < unlinked.length - 1) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-unlinked-${t.id}` });
    });
    return rows.length ? rows : processedTransactions;
  }, [spendWiseView, spendWiseEnabled, processedTransactions, vouchers, accountIdsInGroup]);

  const displayTransactionCount = useMemo(
    () => displayTransactions.filter((t: any) => !(t as any)._spendWiseSpacer).length,
    [displayTransactions]
  );

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    processedTransactions.forEach((v: any) => {
        const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
            dates.add(startOfDay(dateValue).getTime());
        }
    });
    return Array.from(dates).map(d => new Date(d));
  }, [processedTransactions]);

  const isFilterActive = dateRange !== undefined || Object.values(filters).some(v => v);
  
  const clearFilters = () => {
    onDateRangeChange(undefined);
    setTempDateRange(undefined);
    setFilters({});
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

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen =
    isMobile &&
    (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen);

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
    setNoteEntityId(null);
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
      setNoteEntityId(null);
      closeModalInUrl();
    }
  }, [isMobile, modalParam, anyMobilePopupOpen, closeModalInUrl]);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const buildDateRangeText = () => {
    const from = dateRange?.from;
    const to = dateRange?.to;
    if (!from) return "All Time";
    const fromBS = formatDateBS(from);
    const toBS = to ? formatDateBS(to) : fromBS;
    const fromAD = formatDate(from);
    const toAD = to ? formatDate(to) : fromAD;
    if (dateSystem === "AD") return `AD: ${fromAD} to ${toAD}`;
    if (dateSystem === "BS") return `BS: ${fromBS} to ${toBS}`;
    return `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
  };

  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return displayTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return displayTransactions.filter((t: any) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        t.voucherNumber?.toLowerCase().includes(lowerCaseSearch) ||
        t.type?.replace(/_/g, " ").toLowerCase().includes(lowerCaseSearch) ||
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

  const dateRangeLabel = buildDateRangeText();

  const groupDropdownOptions = useMemo(
    () => allGroups.map((g) => ({ value: g.id, label: g.name })),
    [allGroups]
  );

  const accountNamesMap = useMemo(
    () => ({
      ...Object.fromEntries((processedAccounts || []).map((a) => [a.id, a.accountName])),
      ...Object.fromEntries((processedParties || []).map((p) => [p.id, p.name])),
      ...Object.fromEntries((processedStaff || []).map((s) => [s.id, s.name])),
      ...Object.fromEntries((processedTaxes || []).map((t) => [t.id, t.name])),
      ...Object.fromEntries((processedExpenseAccounts || []).map((e) => [e.id, e.name])),
    }),
    [processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts]
  );

  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!onDateRangeChange) return;
    if (!range?.from || (range.from && range.to)) {
      onDateRangeChange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      onDateRangeChange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      onDateRangeChange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
    }
  };

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
    if (isNoteOpen) {
      setIsNoteOpen(false);
      setNoteEntityId(null);
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, closeModalInUrl, onBack]);

  const totalPages = rowsPerPage > 0 ? Math.max(1, Math.ceil(displayTransactions.length / rowsPerPage)) : 1;
  const paginatedTransactions = rowsPerPage > 0
    ? displayTransactions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
    : displayTransactions;
  
  const handleOpenNoteDialog = (accountId?: string) => {
    if (accounts.length === 1) {
        setNoteEntityId(accounts[0].id);
    } else if (accountId) {
        setNoteEntityId(accountId);
    }
    setIsNoteOpen(true);
  };
  
    const handlePrint = async () => {
    if (!company) return;
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;

      if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else
        dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
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
        title: `Group Statement: ${group.name}`,
        context: 'group',
        contextId: group.id,
        dateSystem: dateSystem,
        dateRangeText: dateRangeText,
        vouchersCount: processedTransactions.length,
        openingBalance: isBalanceMasked ? 0 : openingBalanceForPeriod, 
        transactions: processedTransactions,
        showNarration: showNarration,
        userNames: userNames,
      }, true);
    } catch (e) {
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };

  if (isMobile) {
    return (
      <>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
          {/* Mobile: scroll area extends to footer; inner pb-24 so last row clears fixed footer */}
          <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={handleMobileBack} className="flex-shrink-0 h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h1 className="text-base font-bold truncate flex-1 min-w-0">Bank Group Details</h1>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              Showing {mobileTransactionsToShow.filter((t: any) => !(t as any)._spendWiseSpacer).length} of {filteredMobileTransactions.filter((t: any) => !(t as any)._spendWiseSpacer).length} voucher(s)
            </span>
          </div>
          <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {!dateRange || (dateRange.from == null && dateRange.to == null) ? "Last 10 Txns" : dateRangeLabel}
            </span>
            {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
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
          <div className="px-3 py-3 border-b flex-shrink-0">
            <p className={cn("text-2xl font-bold flex justify-center items-baseline gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {isBalanceMasked ? (
                "*****"
              ) : (
                <>
                  <span>{formatCurrency(Math.abs(closingBalance), { showDrCr: false })}</span>
                  <span className="text-lg">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
                </>
              )}
            </p>
          </div>
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                <Combobox
                  options={groupDropdownOptions}
                  value={group?.id || ""}
                  onChange={(value) => {
                    if (value && value !== group.id) router.push(`/bank-cash/group/${value}`);
                  }}
                  placeholder="Select group"
                />
              </div>
              {group.id !== "ungrouped" && (
                <EditAccountGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditAccountGroupDialog>
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
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="pb-24">
            <TransactionsTable
              transactions={mobileTransactionsToShow}
              context="group"
              contextId={group.id}
              groupEntityType="account"
              openingBalance={isBalanceMasked ? 0 : openingBalanceForPeriod}
              openingBalanceOutstanding={isBalanceMasked ? undefined : openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={isBalanceMasked ? undefined : openingBalanceLinkedVoucherNos}
              openingBalanceActions={undefined}
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              journalAccountNames={journalAccountNames}
              accountNames={accountNamesMap}
              userNames={userNames}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={isBalanceMasked ? undefined : periodDr}
              periodCr={isBalanceMasked ? undefined : periodCr}
              closingBalance={isBalanceMasked ? undefined : closingBalance}
              isBalanceMasked={isBalanceMasked}
              scrollOnlyTransactions
            />
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          {spendWiseEnabled && (
            <Button
              type="button"
              className={cn("flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0", spendWiseView ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "bg-violet-600 hover:bg-violet-700 text-white border-0")}
              variant={spendWiseView ? "default" : "outline"}
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
              <Button className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium px-1 bg-pink-600 hover:bg-pink-700 text-white">
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="p-4 text-left">
                <DrawerTitle>Select Date Range</DrawerTitle>
                <MobileDialogDescription>Select a starting and ending date for the transaction list.</MobileDialogDescription>
              </DrawerHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                {(dateSystem === "BS" || dateSystem === "Both") && (
                  <NepaliCalendar
                    onSelect={handleNepaliSelect}
                    valueAD={dateRange}
                    isRange={true}
                    numberOfMonths={calendarMonths}
                  />
                )}
                {(dateSystem === "AD" || dateSystem === "Both") && (
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
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
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
              <DialogTitle>Add a New Note for an Account in {group.name}</DialogTitle>
              <DialogDescription>
                {accounts.length > 1 ? "Select which account this note applies to." : "Record a new note for this account."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              {accounts.length > 1 && !noteEntityId && (
                <div className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">Select an account for the note:</p>
                  {accounts.map((acc) => (
                    <Button key={acc.id} variant="outline" onClick={() => setNoteEntityId(acc.id)}>
                      {acc.accountName}
                    </Button>
                  ))}
                </div>
              )}
              {noteEntityId && (
                <CreateNoteForm
                  onVoucherAction={() => {
                    onAccountUpdated();
                    setIsNoteOpen(false);
                    setNoteEntityId(null);
                  }}
                  initialContext="Bank/Cash"
                  initialEntityId={noteEntityId}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
        <AddVoucherDialog
          isOpen={isVoucherDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setIsVoucherDialogOpen(false);
              setSelectedVoucher(null);
              closeModalInUrl();
            } else {
              setIsVoucherDialogOpen(true);
            }
          }}
          voucher={selectedVoucher}
          onVoucherUpdated={() => setSelectedVoucher(null)}
        />
      </>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <Avatar className="h-12 w-12 text-lg flex-shrink-0">
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {getInitials(group.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{group.name}</h2>
                {containsSpecialAccount && <Crown className="h-5 w-5 text-amber-500 flex-shrink-0" />}
                {group.id !== 'ungrouped' && (
                  <EditAccountGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditAccountGroupDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0 flex items-baseline justify-end gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {isBalanceMasked ? (
                    "*****"
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
              {(dateSystem === 'BS' || dateSystem === 'Both') && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={(range) => onDateRangeChange(range as DateRange | undefined)}
                  transactionDates={transactionDates}
                  className="w-auto"
                />
              )}
              {(dateSystem === 'AD' || dateSystem === 'Both') && (
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
                          onDateRangeChange?.(next);
                          setIsDesktopCalendarOpen(false);
                        } else {
                          const next = { from: range.from, to: adDate };
                          setTempDateRange(next);
                          onDateRangeChange?.(next);
                          setIsDesktopCalendarOpen(false);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {isFilterActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 flex-shrink-0">
                  <XCircle className="mr-2 h-4 w-4"/>Clear Filters
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between flex-shrink-0 h-10">
                    <span className="truncate">Members ({accounts.length})</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[200px] max-h-60 overflow-y-auto">
                  {accounts.map(p => (
                    <DropdownMenuItem key={p.id} disabled>
                      {p.accountName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
              <Button variant="outline" size="sm" onClick={() => handleOpenNoteDialog()} className="flex-shrink-0 h-10">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrint} className="flex-shrink-0 h-10 w-10">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className={cn("flex-1 flex flex-col min-h-0", spendWiseView && spendWiseEnabled ? "min-w-0" : "overflow-x-auto scrollbar-slim-dim")}>
          <div className={cn("py-4 flex-1 flex flex-col min-h-0 min-w-0", spendWiseView && spendWiseEnabled && "p-[2px]")}>
            <TransactionsTable
              transactions={paginatedTransactions}
              context="group"
              contextId={group.id}
              groupEntityType="account"
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              openingBalance={isBalanceMasked ? 0 : openingBalanceForPeriod}
              openingBalanceOutstanding={isBalanceMasked ? undefined : openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={isBalanceMasked ? undefined : openingBalanceLinkedVoucherNos}
              openingBalanceActions={
                group.id !== "ungrouped" ? (
                  <EditAccountGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </EditAccountGroupDialog>
                ) : null
              }
              journalAccountNames={journalAccountNames}
              accountNames={accountNamesMap}
              userNames={userNames}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={isBalanceMasked ? undefined : periodDr}
              periodCr={isBalanceMasked ? undefined : periodCr}
              closingBalance={isBalanceMasked ? undefined : closingBalance}
              isBalanceMasked={isBalanceMasked}
            />
            {paginatedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found for the selected period.
              </div>
            )}
          </div>
        </div>
        {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{displayTransactionCount} transaction(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-account-group" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-account-group" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                          id={`col-${key}-account-group`}
                          checked={visibleColumns[key] !== false}
                          onCheckedChange={(c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-account-group`} className="text-sm font-medium flex-1 cursor-pointer">
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
                  setRowsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={`${rowsPerPage}`} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
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
     <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
                <DialogTitle>Add a New Note for an Account in {group.name}</DialogTitle>
                <DialogDescription>
                    {accounts.length > 1 ? "Select which account this note applies to." : "Record a new note for this account."}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
                {accounts.length > 1 && !noteEntityId && (
                     <div className="flex flex-col gap-2 p-4">
                        <p className="font-semibold">Select an account for the note:</p>
                        {accounts.map(acc => (
                            <Button key={acc.id} variant="outline" onClick={() => setNoteEntityId(acc.id)}>
                                {acc.accountName}
                            </Button>
                        ))}
                    </div>
                )}
                {noteEntityId && (
                    <CreateNoteForm 
                    onVoucherAction={() => {
                            onAccountUpdated();
                            setIsNoteOpen(false);
                            setNoteEntityId(null);
                        }}
                        initialContext="Bank/Cash"
                        initialEntityId={noteEntityId}
                    />
                )}
            </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open) => {
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

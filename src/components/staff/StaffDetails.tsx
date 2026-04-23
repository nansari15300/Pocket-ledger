
"use client";

import * as React from "react";
import { openPrintDirect } from "@/lib/printDirect";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Edit,
  Printer,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  FileText,
  Briefcase,
  MoreVertical,
  XCircle,
  ArrowLeft,
  Columns3,
  ChevronDown,
  Search,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { format, startOfDay, endOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { EntityLedgerOpeningHints } from "@/components/common/EntityLedgerOpeningHints";
import { EditStaffDialog } from "./EditStaffDialog";
import { EntityAlarmPopup } from "@/components/messages/EntityAlarmPopup";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import { HistoryDialog } from "../vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "../vouchers/LinkAdvancesToVoucherDialog";
import { LinkPaymentToTxnsDialog } from "../vouchers/LinkPaymentToTxnsDialog";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useTransactionVisibleColumns, COLUMN_LABELS, useShowNotes } from "../vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "../ui/badge";
import { toast } from "sonner";

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function StaffDetails({
  staff: initialStaff,
  allGroups,
  allStaff,
  onStaffUpdated,
  onStaffDeleted,
  dateRange: parentDateRange,
  onDateRangeChange: parentOnDateRangeChange,
  onShowAll,
  isAllVouchersView,
  context,
  onBack,
  transactions,
  userNames,
}: {
  staff: Staff;
  allGroups?: StaffGroup[];
  allStaff?: Staff[];
  onStaffUpdated: (updatedStaff: Partial<Staff>) => void;
  onStaffDeleted: (deletedId: string) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  onShowAll?: () => void;
  isAllVouchersView?: boolean;
  context?: string;
  userNames?: Record<string, string>;
  onBack?: () => void;
  transactions?: any[];
}) {
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatRunning } =
    useDate();
  const {
    vouchers,
    processedStaff,
    processedAccounts,
    processedParties,
    processedExpenseAccounts,
    processedTaxes,
    journalAccountNames,
  } = useVouchers();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(parentDateRange);
  const [isDateChange, setIsDateChange] = useState(false);
    
  const staff = useMemo(() => {
    if (!processedStaff) return initialStaff;
    return processedStaff.find(s => s.id === initialStaff.id) || initialStaff;
  }, [processedStaff, initialStaff]);

  const mobileSearchNames = useMemo(
    () => ({ ...journalAccountNames, ...(userNames || {}) }),
    [journalAccountNames, userNames]
  );

  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const { balanceMode, setBalanceMode } = useBalanceMode();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "add_salary">(null);
  const [isEditStaffDialogOpen, setIsEditStaffDialogOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  const openingModalRef = useRef(false);

  // Desktop Calendar State
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  
  // Local State for Calendar Buffer
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);

  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
    parentOnDateRangeChange(newRange);
  };
  
  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    vouchers.forEach((v) => {
      if (
        v.staffId === staff.id ||
        (v.entries && v.entries.some((e: any) => e.accountId === staff.id))
      ) {
        const dateValue = v.date?.toDate
          ? v.date.toDate()
          : new Date(v.date);
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
          dates.add(startOfDay(dateValue).getTime());
        }
      }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [vouchers, staff.id]);


  const {
    processedTransactions,
    openingBalanceForPeriod,
    periodDr,
    periodCr,
    closingBalance,
    openingBalanceOutstanding,
    openingBalanceLinkedVoucherNos,
  } = useTransactions(staff, 'staff', dateRange, undefined, allStaff, transactions, context, filters, undefined, undefined, userNames);


  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);
  // Books opening + (date par filter) view-start: table first opening row se align
  const hasLedgerDateFilter = Boolean(dateRange?.from != null || dateRange?.to != null);
  const masterStaffOpening = Number(staff.openingBalance) || 0;

  const clearFilters = () => {
    handleDateRangeChange(undefined);
    setTempDateRange(undefined);
    setFilters({});
  };

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen =
    isMobile &&
    (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen || isEditStaffDialogOpen || !!historyVoucher || !!linkAdvancesVoucher || !!linkPaymentVoucher);

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
    setIsEditStaffDialogOpen(false);
    setHistoryVoucher(null);
    setLinkAdvancesVoucher(null);
    setLinkPaymentVoucher(null);
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
      setIsEditStaffDialogOpen(false);
      setHistoryVoucher(null);
      setLinkAdvancesVoucher(null);
      setLinkPaymentVoucher(null);
    }
  }, [isMobile, modalParam, anyMobilePopupOpen]);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const handleEditVoucher = useCallback((voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  }, [openModalInUrl]);

  const handleHistoryVoucher = useCallback((voucher: any) => {
    openingModalRef.current = true;
    setHistoryVoucher(voucher);
    openModalInUrl();
  }, [openModalInUrl]);

  const handleAddLink = useCallback((voucher: any) => {
    openingModalRef.current = true;
    const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(voucher?.type);
    if (isPaymentType) {
      setLinkPaymentVoucher(voucher);
    } else {
      setLinkAdvancesVoucher(voucher);
    }
    openModalInUrl();
  }, [openModalInUrl]);

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
      closeModalInUrl();
      return;
    }
    if (isEditStaffDialogOpen) {
      setIsEditStaffDialogOpen(false);
      closeModalInUrl();
      return;
    }
    if (historyVoucher) {
      setHistoryVoucher(null);
      closeModalInUrl();
      return;
    }
    if (linkPaymentVoucher) {
      setLinkPaymentVoucher(null);
      closeModalInUrl();
      return;
    }
    if (linkAdvancesVoucher) {
      setLinkAdvancesVoucher(null);
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, isEditStaffDialogOpen, historyVoucher, linkPaymentVoucher, linkAdvancesVoucher, closeModalInUrl, onBack]);

  // PC: preference; mobile: hamesha notes (includeNotesInTable)
  const displayTransactions = useMemo(
    () => (includeNotesInTable ? processedTransactions : processedTransactions.filter((t: any) => t.type !== "note")),
    [processedTransactions, includeNotesInTable]
  );

  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(DEFAULT_TRANSACTION_SORT_ORDER);
  const sortedTransactions = useMemo(
    () =>
      recomputeRunningBalanceTopToBottom(
        sortTransactionsWithFiscalMergeForCompany(displayTransactions, sortBy, sortOrder, undefined, company),
        openingBalanceForPeriod
      ),
    [displayTransactions, sortBy, sortOrder, openingBalanceForPeriod, company]
  );
  
  // Desktop pagination: page 1 latest-side; opening row values should follow visible page.
  const desktopPaginationMeta = useMemo(() => {
    const list = sortedTransactions;
    const total = list.length;
    if (rowsPerPage <= 0) {
      const pageDr = list.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
      const pageCr = list.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
      return {
        totalPages: 1,
        pageTransactions: list,
        beforeCount: 0,
        afterCount: 0,
        openingForPage: openingBalanceForPeriod,
        periodDrForPage: pageDr,
        periodCrForPage: pageCr,
        closingForPage: openingBalanceForPeriod + pageDr - pageCr,
      };
    }
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    const pageTransactions = list.slice(start, Math.max(start, end));
    const previousTx = start > 0 ? list[start - 1] : null;
    const previousRunningBalance =
      previousTx != null
        ? (typeof previousTx.balance === "number"
            ? previousTx.balance
            : typeof previousTx.runningBalance === "number"
              ? previousTx.runningBalance
              : undefined)
        : undefined;
    const openingForPage =
      typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)
        ? previousRunningBalance
        : openingBalanceForPeriod;
    const periodDrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      totalPages: totalPagesLocal,
      pageTransactions,
      beforeCount: start,
      afterCount: Math.max(0, total - end),
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [sortedTransactions, rowsPerPage, currentPage, openingBalanceForPeriod]);
  const totalPages = desktopPaginationMeta.totalPages;
  const paginatedTransactions = desktopPaginationMeta.pageTransactions;

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

  const handlePrintStatement = () => {
    if (!company) return;
    // Match print with current table columns and note visibility.
    const printVisibleColumns = visibleColumns;
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
      title: `Staff Statement: ${staff.name}`,
      context: "staff",
      contextId: staff.id,
      dateSystem: dateSystem,
      dateRangeText: buildDateRangeText(),
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (staff as any).openingBalanceDate,
      openingBalanceNarration: staff.openingBalanceNarration ?? null,
      transactions: displayTransactions,
      showNarration: showNarration,
      includeNotes: includeNotesInTable,
      visibleColumns: printVisibleColumns,
      userNames: userNames,
      billWise: false,
    }, true);
  };

  const handlePrintBillWise = () => {
    if (!company) return;
    // Bill-wise print keeps Status column visible by design.
    const printVisibleColumns = { ...visibleColumns, status: true };
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
      title: `Bill Wise Staff Statement: ${staff.name}`,
      context: "staff",
      contextId: staff.id,
      dateSystem: dateSystem,
      dateRangeText: buildDateRangeText(),
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (staff as any).openingBalanceDate,
      openingBalanceNarration: staff.openingBalanceNarration ?? null,
      transactions: displayTransactions,
      showNarration: showNarration,
      includeNotes: includeNotesInTable,
      visibleColumns: printVisibleColumns,
      userNames: userNames,
      billWise: true,
      openingBalanceOutstanding,
      openingBalanceLinkedVoucherNos,
    }, true);
  };


  useEffect(() => {
    if (isMobile && dateRange?.from) {
      const from = formatDate(dateRange.from);
      const to = dateRange.to ? formatDate(dateRange.to) : from;
      setMobileSearchTerm(from === to ? from : `${from} to ${to}`);
      setIsDateSearchMode(true);
    }
  }, [dateRange, isMobile, formatDate]);
  
    const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    if (!adDate) return;

    const normalizedAdDate = new Date(adDate.getFullYear(), adDate.getMonth(), adDate.getDate(), 12, 0, 0, 0); 
    const range = tempDateRange;
    let newRange: DateRange | undefined;
    
    if (!range?.from || (range.from && range.to)) {
      newRange = { from: normalizedAdDate, to: undefined };
    } else {
      if (normalizedAdDate < range.from) {
        newRange = { from: normalizedAdDate, to: range.from };
      } else {
        newRange = { from: range.from, to: normalizedAdDate };
      }
    }

    setTempDateRange(newRange);

    if (newRange.from && newRange.to) {
        handleDateRangeChange(newRange);
        setIsCalendarOpen(false);
        setIsDesktopCalendarOpen(false);
    }
  };
  
  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return sortedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return sortedTransactions.filter(t => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "staff", staff.id).includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS, mobileSearchNames, staff.id]);
  const mobileTransactionsToShow = useMemo(() => {
    const list = filteredMobileTransactions;
    if (rowsPerPage <= 0) return list;
    const total = list.length;
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return list.slice(start, Math.max(start, end));
  }, [filteredMobileTransactions, currentPage, rowsPerPage]);
  const mobilePagerEdgeCounts = useMemo(() => {
    const total = filteredMobileTransactions.length;
    if (rowsPerPage <= 0) return { before: 0, after: 0 };
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return { before: start, after: Math.max(0, total - end) };
  }, [filteredMobileTransactions.length, currentPage, rowsPerPage]);
  const mobilePaginationMeta = useMemo(() => {
    const list = filteredMobileTransactions as any[];
    if (rowsPerPage <= 0) {
      const pageDr = list.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
      const pageCr = list.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
      return {
        openingForPage: openingBalanceForPeriod,
        periodDrForPage: pageDr,
        periodCrForPage: pageCr,
        closingForPage: openingBalanceForPeriod + pageDr - pageCr,
      };
    }
    const total = list.length;
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    const pageTransactions = list.slice(start, Math.max(start, end));
    const previousTx = start > 0 ? list[start - 1] : null;
    const previousRunningBalance =
      previousTx != null
        ? (typeof previousTx.balance === "number"
            ? previousTx.balance
            : typeof previousTx.runningBalance === "number"
              ? previousTx.runningBalance
              : undefined)
        : undefined;
    const openingForPage =
      typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)
        ? previousRunningBalance
        : openingBalanceForPeriod;
    const periodDrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [filteredMobileTransactions, rowsPerPage, currentPage, openingBalanceForPeriod]);

  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(filteredMobileTransactions.length / rowsPerPage) : 1;
    const safeTotal = Math.max(1, total);
    setCurrentPage((prev) => Math.min(Math.max(1, prev), safeTotal));
  }, [dateRange, filteredMobileTransactions.length, rowsPerPage]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) {
      return rowsPerPage > 0 ? `Last ${rowsPerPage} Txns` : "All Txns";
    }
    return buildDateRangeText();
  }, [dateRange, rowsPerPage]);

  const accountNamesMap = useMemo(
    () => ({
      ...Object.fromEntries((processedAccounts || []).map((a: any) => [a.id, a.accountName])),
      ...Object.fromEntries((processedParties || []).map((p: any) => [p.id, p.name])),
      ...Object.fromEntries((processedStaff || []).map((s: any) => [s.id, s.name])),
      ...Object.fromEntries((processedExpenseAccounts || []).map((e: any) => [e.id, e.name])),
      ...Object.fromEntries((processedTaxes || []).map((t: any) => [t.id, t.name])),
    }),
    [processedAccounts, processedParties, processedStaff, processedExpenseAccounts, processedTaxes]
  );

  const renderMobileView = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      {/* Mobile: scroll area extends to footer; inner pb-24 so last row clears fixed footer */}
      {/* Top row: Party-style header (label + selected account name). */}
      {onBack ? (
        <div className="flex flex-shrink-0 items-center gap-1.5 border-b px-2 py-1">
          <Button variant="ghost" size="icon" onClick={handleMobileBack} className="h-7 w-7 flex-shrink-0" aria-label="Back">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <h1 className="shrink-0 text-base font-bold text-muted-foreground">Staff details</h1>
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={staff.name}>
            {staff.name}
          </span>
        </div>
      ) : null}
      {/* Row 2: Last 10 Txns or date range label */}
      <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {dateRangeLabel}
        </span>
        {dateRange != null &&
          (dateRange.from != null || dateRange.to != null) && (
            <button
              type="button"
              onClick={() => handleDateRangeChange(undefined)}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Clear date filter"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
      </div>
      {/* Balance - same as bank mobile: amount + Dr/Cr */}
      <div className="px-3 py-2 border-b flex-shrink-0">
        <p className={cn("text-2xl font-bold flex justify-center items-baseline gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
          {closingBalance === 0 ? (
            "Settled Up"
          ) : (
            <>
              <span>{formatCurrency(Math.abs(closingBalance), { noSuffix: true })}</span>
              <span className="text-lg">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
            </>
          )}
        </p>
      </div>
      {/* Staff dropdown + Edit + Search */}
      <div className="p-2 border-b flex-shrink-0">
        <div className="flex items-stretch gap-2">
          {allStaff && allStaff.length > 0 && (
            <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
              <Combobox
                options={allStaff.map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={staff?.id || ""}
                onChange={(value) => {
                  if (value && value !== staff.id) {
                    router.push(`/staff?selected=${value}`);
                  }
                }}
                placeholder="Select staff"
              />
            </div>
          )}
          <EditStaffDialog
            staff={staff}
            allGroups={allGroups}
            onStaffUpdated={onStaffUpdated}
            onStaffDeleted={() => onStaffDeleted(staff.id)}
            isOpen={isEditStaffDialogOpen}
            onOpenChange={(open: boolean) => {
              setIsEditStaffDialogOpen(open);
              if (open) {
                openingModalRef.current = true;
                openModalInUrl();
              } else {
                closeModalInUrl();
              }
            }}
          >
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-8 flex-shrink-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </EditStaffDialog>
          <div className="flex-1 min-w-0 h-9 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
            <Input
              placeholder="Search transactions"
              className="pl-8 h-9 text-sm w-full min-w-0"
              value={mobileSearchTerm}
              onChange={(e) => {
                setMobileSearchTerm(e.target.value);
                setCurrentPage(1);
                if (!e.target.value) {
                  setIsDateSearchMode(false);
                }
              }}
            />
          </div>
        </div>
      </div>
      {/* Transactions list - extends to footer line */}
      {/* scroll-touch + inline style for APK/WebView touch scroll */}
      <div
        className="flex-1 min-h-0 overflow-auto scroll-touch"
        style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className="pb-24">
        <TransactionsTable
          transactions={mobileTransactionsToShow}
          context="staff"
          contextId={staff.id}
          openingBalance={mobilePaginationMeta.openingForPage}
          openingBalanceOutstanding={openingBalanceOutstanding}
          openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
          openingBalanceNarration={staff.openingBalanceNarration}
          openingBalanceAttachmentUrls={staff.documentFileUrls}
          openingBalanceDate={(staff as any).openingBalanceDate}
          openingBalanceActions={undefined}
          showNarration={showNarration}
          visibleColumns={
            balanceMode === "bill_wise"
              ? { ...visibleColumns, status: true }
              : visibleColumns
          }
          journalAccountNames={{}}
          accountNames={accountNamesMap}
          periodDr={mobilePaginationMeta.periodDrForPage}
          periodCr={mobilePaginationMeta.periodCrForPage}
          closingBalance={mobilePaginationMeta.closingForPage}
          onRowClick={handleEditVoucher}
          onHistoryVoucher={handleHistoryVoucher}
          onAddLink={handleAddLink}
          userNames={userNames}
          filters={filters}
          setFilters={setFilters}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          isAllVouchersView={isAllVouchersView}
          hideDebitColumn={false}
          hideCreditColumn={false}
          scrollOnlyTransactions
        />
        </div>
      </div>
      <MobileTransactionsPager
        className="flex-shrink-0 mb-12"
        currentPage={currentPage}
        totalItems={filteredMobileTransactions.length}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(nextRows) => {
          setRowsPerPage(nextRows);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
        edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
      />
      <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
        <Button
          type="button"
          className={cn("flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0", balanceMode === "bill_wise" ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "bg-violet-600 hover:bg-violet-700 text-white border-0")}
          onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
          data-theme-btn={balanceMode === "bill_wise" ? "statement" : "bill-wise"}
        >
          {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
        </Button>
        <AddVoucherDialog
          defaultTab="payment_out"
          defaultVoucherData={{ payeeType: "staff", staffId: staff.id }}
          isOpen={mobileFooterDialogOpen === "payment_out"}
          onOpenChange={(open: boolean) => {
            if (open) {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("payment_out");
              openModalInUrl();
            } else if (mobileFooterDialogOpen === "payment_out") {
              setMobileFooterDialogOpen(null);
              closeModalInUrl();
            }
          }}
        >
          <Button className="flex-1 h-6 min-w-0 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
            Pay Salary
          </Button>
        </AddVoucherDialog>
        <AddVoucherDialog
          defaultTab="add_salary"
          isOpen={mobileFooterDialogOpen === "add_salary"}
          onOpenChange={(open: boolean) => {
            if (open) {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("add_salary");
              openModalInUrl();
            } else if (mobileFooterDialogOpen === "add_salary") {
              setMobileFooterDialogOpen(null);
              closeModalInUrl();
            }
          }}
        >
          <Button className="flex-1 h-6 min-w-0 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium">
            Add Salary
          </Button>
        </AddVoucherDialog>
        <Drawer
          open={isCalendarOpen}
          onOpenChange={(open: boolean) => {
            setIsCalendarOpen(open);
            if (open) {
              openingModalRef.current = true;
              openModalInUrl();
            } else {
              closeModalInUrl();
            }
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
              <MobileDialogDescription>
                Select a starting and ending date for the transaction list.
              </MobileDialogDescription>
            </DrawerHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <NepaliCalendar
                  rangePresetSlot={
                    <DateRangePresetRow
                      country={company?.country}
                      onApply={(r) => {
                        handleDateRangeChange(r);
                        setIsCalendarOpen(false);
                      }}
                    />
                  }
                  onSelect={handleNepaliSelect}
                  valueAD={dateRange}
                  isRange={true}
                  numberOfMonths={calendarMonths}
                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <div className="flex-1 w-full min-w-0">
                  <AdCalendar
                    rangePresetSlot={
                      <DateRangePresetRow
                        country={company?.country}
                        onApply={(r) => {
                          handleDateRangeChange(r);
                          setIsCalendarOpen(false);
                        }}
                      />
                    }
                    valueAD={dateRange}
                    isRange
                    numberOfMonths={calendarMonths}
                    transactionDates={transactionDates}
                    onSelect={(adDate) => {
                      const range = dateRange;
                      if (!range?.from || (range.from && range.to)) {
                        handleDateRangeChange({ from: adDate, to: undefined });
                      } else if (adDate < range.from) {
                        handleDateRangeChange({ from: adDate, to: range.from });
                        setIsCalendarOpen(false);
                      } else {
                        handleDateRangeChange({ from: range.from, to: adDate });
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
    </div>
  );

  const renderDesktopView = () => (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
            {isMobile && onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Avatar className="h-12 w-12 text-lg flex-shrink-0">
              <AvatarImage src={staff.fileUrl} alt={staff.name} />
              <AvatarFallback className="bg-muted text-muted-foreground">
                <Briefcase className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 gap-0.5">
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{staff.name}</h2>
                <EditStaffDialog
                  staff={staff}
                  allGroups={allGroups}
                  onStaffUpdated={onStaffUpdated}
                  onStaffDeleted={() => onStaffDeleted(staff.id)}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" data-theme-detail="edit">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditStaffDialog>
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance < 0 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(closingBalance, { showDrCr: true })}
                </div>
              </div>
              <EntityLedgerOpeningHints
                masterOpening={masterStaffOpening}
                periodOpeningBroughtForward={openingBalanceForPeriod}
                hasDateFilter={hasLedgerDateFilter}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            {(dateSystem === 'BS' || dateSystem === 'Both') && (
              <BsDatePicker
                isRange
                valueAD={dateRange}
                onChangeAD={(range) => handleDateRangeChange(range as DateRange | undefined)}
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
                    data-theme-detail="date-range"
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
                    rangePresetSlot={
                      <DateRangePresetRow
                        country={company?.country}
                        onApply={(r) => {
                          setTempDateRange(r);
                          handleDateRangeChange(r);
                          setIsDesktopCalendarOpen(false);
                        }}
                      />
                    }
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
                        handleDateRangeChange(next);
                        setIsDesktopCalendarOpen(false);
                      } else {
                        const next = { from: range.from, to: adDate };
                        setTempDateRange(next);
                        handleDateRangeChange(next);
                        setIsDesktopCalendarOpen(false);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
            {isFilterActive && (
              <Button variant="ghost" size="icon" onClick={clearFilters} className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear date filter">
                <XCircle className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={cn("flex-shrink-0 h-10", balanceMode === "bill_wise" ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "")}
              onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
              data-theme-btn={balanceMode === "bill_wise" ? "statement" : "bill-wise"}
            >
              {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNoteOpen(true)}
              className="flex-shrink-0 h-10"
              data-theme-detail="add-note"
            >
              <FilePlus className="mr-2 h-4 w-4" />
              Add Note
            </Button>
            {onShowAll && (
              <Button variant="outline" size="sm" onClick={onShowAll} className="flex-shrink-0 h-10">
                All Vouchers
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={balanceMode === "bill_wise" ? handlePrintBillWise : handlePrintStatement}
              className="flex-shrink-0 h-10 w-10"
              data-theme-detail="print"
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {/* TABLE AREA - flex layout so table footer (Total / Closing Balance) stays visible */}
      <div className="flex-1 flex flex-col min-h-0 overflow-x-auto">
        <div className="py-4 flex-1 flex flex-col min-h-0 min-w-0">
                <TransactionsTable
                  key={`staff-${staff.id}-${currentPage}-${rowsPerPage}`}
                  transactions={paginatedTransactions}
                  context="staff"
                  contextId={staff.id}
                  openingBalance={desktopPaginationMeta.openingForPage}
                  openingBalanceOutstanding={openingBalanceOutstanding}
                  openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
                  openingBalanceNarration={staff.openingBalanceNarration}
                  openingBalanceAttachmentUrls={staff.documentFileUrls}
                  openingBalanceDate={(staff as any).openingBalanceDate}
                  openingBalanceActions={
                    <EditStaffDialog
                      staff={staff}
                      allGroups={allGroups}
                      allStaff={allStaff}
                      onStaffUpdated={onStaffUpdated}
                      onStaffDeleted={() => onStaffDeleted(staff.id)}
                      hasTransactions={processedTransactions.length > 0}
                    >
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </EditStaffDialog>
                  }
                  showNarration={showNarration}
                  visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
                  journalAccountNames={{}}
                  accountNames={accountNamesMap}
                  periodDr={desktopPaginationMeta.periodDrForPage}
                  periodCr={desktopPaginationMeta.periodCrForPage}
                  closingBalance={desktopPaginationMeta.closingForPage}
                  onRowClick={handleEditVoucher}
                  onHistoryVoucher={handleHistoryVoucher}
                  onAddLink={handleAddLink}
                  userNames={userNames}
                  filters={filters}
                  setFilters={setFilters}
                  activeFilter={activeFilter}
                  setActiveFilter={setActiveFilter}
                  isAllVouchersView={isAllVouchersView}
                  hideDebitColumn={false}
                  hideCreditColumn={false}
                  scrollOnlyTransactions
                />
          {paginatedTransactions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No transactions found for this staff member in the selected period.</div>
          )}
        </div>
      </div>
      {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
            <div className="flex items-center space-x-2 flex-shrink-0">
              <Checkbox id="show-narration-staff" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
              <label htmlFor="show-narration-staff" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                  .filter((key) => key !== "status" || balanceMode === "bill_wise")
                  .map((key) => {
                  const isStatusInStatement = key === "status" && balanceMode === "statement";
                  const isStatusInBillWise = key === "status" && balanceMode === "bill_wise";
                  const isStatusLocked = isStatusInStatement || isStatusInBillWise;
                  return (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`col-${key}-staff`}
                        checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                        disabled={isStatusLocked}
                        onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                      />
                      <label htmlFor={`col-${key}-staff`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                        {COLUMN_LABELS[key]}
                      </label>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Checkbox id="show-notes-staff" checked={includeNotesInTable} disabled={notesPreferenceLockedOnMobile} onCheckedChange={(c) => setShowNotes(Boolean(c))} />
              <label htmlFor="show-notes-staff" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Note</label>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            <TransactionTableSortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
              viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
            />
            <p className="text-sm font-medium flex-shrink-0 tabular-nums">({desktopPaginationMeta.beforeCount})</p>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
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
                {[15, 30, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>
                ))}
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
            <p className="text-sm font-medium flex-shrink-0 tabular-nums">({desktopPaginationMeta.afterCount})</p>
            <p className="text-sm font-medium flex-shrink-0 tabular-nums">Total Trxn {displayTransactions.length}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {staff?.id && <EntityAlarmPopup context="Staff" entityId={staff.id} />}
      <div className={cn("flex flex-col min-h-0 overflow-hidden", isMobile ? "flex-1" : "h-full")}>
        {isMobile ? renderMobileView() : renderDesktopView()}
      </div>
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for {staff.name}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onStaffUpdated({});
                setIsNoteOpen(false);
              }}
              initialContext="Staff"
              initialEntityId={staff.id}
              compactFooter
            />
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsVoucherDialogOpen(open);
          if (!open) {
            setSelectedVoucher(null);
            if (isMobile) closeModalInUrl();
          }
        }}
        voucher={selectedVoucher}
        onVoucherCreated={() => setSelectedVoucher(null)}
      />
      <HistoryDialog
        voucher={historyVoucher}
        isOpen={!!historyVoucher}
        onOpenChange={(open) => !open && setHistoryVoucher(null)}
        onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)}
      />
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
    </>
  );
}

    
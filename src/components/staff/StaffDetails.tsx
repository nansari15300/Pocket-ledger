
"use client";

import * as React from "react";
import { openPrintDirect } from "@/lib/printDirect";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { ReconciliationAccountButton } from "@/components/reconciliation/ReconciliationAccountButton";
import { Button } from "@/components/ui/button";
import { LedgerViewModePills } from "@/components/ui/LedgerViewModePills";
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
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import * as XLSX from "xlsx";
import { ReportMobileLedgerFooter } from "@/components/reports/ReportMobileLedgerFooter";
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import {
  clearPlModalParentQueryBackup,
  pathnameForModalRouterReplace,
  patchMasterDetailUrlAfterModalClose,
  persistPlModalParentQuery,
  searchParamsStringAfterClosingModal,
  searchParamsStringForModalClose,
} from "@/lib/modalUrlSync";
import { useMobileLedgerModalUrlGuard } from "@/hooks/useMobileLedgerModalUrlGuard";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { MobileDetailSummaryCollapsible } from "@/components/layout/MobileDetailSummaryCollapsible";
import AdCalendar from "@/components/ui/ad-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import { EditStaffDialog } from "./EditStaffDialog";
import { EntityAlarmPopup } from "@/components/messages/EntityAlarmPopup";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import BsDatePicker from "@/components/ui/BsDatePicker";
import {
  LEDGER_HEADER_PILL_CN,
  LEDGER_HEADER_PILL_ICON_CN,
  LEDGER_HEADER_PILL_ICON_SIZE_CN,
} from "@/lib/ledgerHeaderChrome";
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
import { LedgerDesktopFooter } from "@/components/vouchers/LedgerDesktopFooter";
import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";

import { useTransactionVisibleColumns, COLUMN_LABELS, useShowNotes } from "../vouchers/transactionColumnVisibility";
import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";
import { LedgerFooterCheckboxPill } from "@/components/vouchers/ledgerFooterChrome";
import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";
import { useLedgerUnapprovedOnlyFilter } from "@/hooks/useLedgerUnapprovedOnlyFilter";
import { LedgerUnapprovedFilterButton } from "@/components/vouchers/LedgerUnapprovedFilterButton";
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
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { applyPaymentBillWiseLinkAllocations } from "@/lib/voucherActionsClient";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { useMasterEntityLivePatch } from "@/hooks/useMasterEntityLivePatch";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { useDateRangeTimestamps } from "@/hooks/useLedgerDetailDateRange";
import { useRowsPerPageSelectControl } from "@/hooks/useRowsPerPageSelect";
import { ROWS_PER_PAGE_OPTIONS_STAFF } from "@/lib/rowsPerPageSelect";
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
  onSelectStaff,
  transactions,
  userNames,
  /** Reports / dashboard txn-count: Print·Excel·Bill wise·Date·Chart footer (staff page Pay/Add hide). */
  mobileFooterVariant = "ledger",
  mobileReportStickyTitle,
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
  onSelectStaff?: (staffId: string) => void;
  transactions?: any[];
  mobileFooterVariant?: "ledger" | "report";
  mobileReportStickyTitle?: string;
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
  const parentFromMs = parentDateRange?.from?.getTime();
  const parentToMs = parentDateRange?.to?.getTime();
  useEffect(() => {
    setDateRange((prev) => {
      if (prev?.from?.getTime() === parentFromMs && prev?.to?.getTime() === parentToMs) return prev;
      return parentDateRange;
    });
  }, [parentFromMs, parentToMs, parentDateRange]);
    
  const staff = useMemo(() => {
    if (!processedStaff) return initialStaff;
    return processedStaff.find(s => s.id === initialStaff.id) || initialStaff;
  }, [processedStaff, initialStaff]);

  const handleStaffUpdated = useMasterEntityLivePatch<Staff>({
    collection: "staff",
    entityId: initialStaff.id,
    onUpdated: onStaffUpdated,
  });

  const staffHeaderAttachmentUrl = useMemo(
    () => trimEntityFileUrlForPreview(staff.fileUrl),
    [staff.fileUrl, staff.id]
  );

  const mobileSearchNames = useMemo(
    () => ({ ...journalAccountNames, ...(userNames || {}) }),
    [journalAccountNames, userNames]
  );

  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [staff.id, isAllVouchersView]);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const { balanceMode, setBalanceMode } = useBalanceMode();
  // Report mobile: list vs running-balance chart (Party report parity).
  const [mobileReportView, setMobileReportView] = useState<"list" | "chart">("list");
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

  const handleDateRangeChange = useCallback(
    (newRange: DateRange | undefined) => {
      setDateRange(newRange);
      parentOnDateRangeChange(newRange);
    },
    [parentOnDateRangeChange]
  );

  const {
    unapprovedOnly,
    toggleUnapprovedOnly,
    filterByUnapprovedOnly,
    onDateRangeChangeWithUnapprovedReset,
  } = useLedgerUnapprovedOnlyFilter({
    onDateRangeChange: handleDateRangeChange,
    setCurrentPage,
    setFilters,
    setActiveFilter,
  });

  const { fromMs: dateRangeFromMs, toMs: dateRangeToMs } = useDateRangeTimestamps(dateRange);
  const { selectValue: rowsPerPageSelectValue, onSelectValueChange: handleRowsPerPageChange } =
    useRowsPerPageSelectControl(rowsPerPage, setRowsPerPage, setCurrentPage, ROWS_PER_PAGE_OPTIONS_STAFF, "15");
  const handleBsDateRangeChange = useCallback(
    (range?: DateRange) => {
      onDateRangeChangeWithUnapprovedReset(range);
    },
    [onDateRangeChangeWithUnapprovedReset]
  );
  
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
  const ledgerOpeningForRunning = useMemo(() => {
    if (Math.abs(openingBalanceForPeriod) < 1e-6 && Math.abs(masterStaffOpening) > 1e-6) return masterStaffOpening;
    return openingBalanceForPeriod;
  }, [openingBalanceForPeriod, masterStaffOpening]);

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
    persistPlModalParentQuery(searchParams.toString());
    const params = new URLSearchParams(searchParamsStringForModalClose(searchParams.toString()));
    params.set("modal", "1");
    params.set("modalts", String(Date.now()));
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const raw = searchParamsStringAfterClosingModal(searchParams.toString());
    const params = new URLSearchParams(raw);
    params.delete("modal");
    params.delete("modalts");
    patchMasterDetailUrlAfterModalClose(params, { entityId: staff.id });
    const q = params.toString();
    const basePath = pathnameForModalRouterReplace(pathname);
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
    clearPlModalParentQueryBackup();
  }, [pathname, searchParams, router, staff.id]);

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

  useMobileLedgerModalUrlGuard({
    isMobile,
    modalParam,
    anyPopupOpen: anyMobilePopupOpen,
    openingModalRef,
    pathname,
    searchParams,
    router,
  });

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
        sortTransactionsWithFiscalMergeForCompany(
          filterByUnapprovedOnly(displayTransactions), "date", DEFAULT_TRANSACTION_SORT_ORDER, undefined, company),
        ledgerOpeningForRunning
      ),
    [displayTransactions, filterByUnapprovedOnly, ledgerOpeningForRunning, company]
  );
  
  // Statement check mode + desktop tail paging (PartyDetails jaisa)
  const {
    statementCheck,
    desktopPaginationMeta,
    paginatedTransactions,
    totalPages,
  } = useStatementLedgerCheckModePaging({
    companyId,
    context: "staff",
    contextId: staff?.id,
    viewMode: balanceMode === "bill_wise" ? "bill_wise" : "statement",
    searchFilteredTransactions: sortedTransactions,
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning,
    pageSortBy: sortBy,
    pageSortOrder: sortOrder,
  });

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
        openingForPage: ledgerOpeningForRunning,
        periodDrForPage: pageDr,
        periodCrForPage: pageCr,
        closingForPage: ledgerOpeningForRunning + pageDr - pageCr,
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
        : ledgerOpeningForRunning;
    const periodDrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [filteredMobileTransactions, rowsPerPage, currentPage, ledgerOpeningForRunning]);

  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(filteredMobileTransactions.length / rowsPerPage) : 1;
    const safeTotal = Math.max(1, total);
    setCurrentPage((prev) => {
      const next = Math.min(Math.max(1, prev), safeTotal);
      return next === prev ? prev : next;
    });
  }, [dateRangeFromMs, dateRangeToMs, filteredMobileTransactions.length, rowsPerPage]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) {
      return rowsPerPage > 0 ? `Last ${rowsPerPage} Txns` : "All Txns";
    }
    return buildDateRangeText();
  }, [dateRange, rowsPerPage]);

  // Report sticky header title — dashboard Add Salary / all-vouchers drill-down.
  const reportStickyTitle = useMemo(() => {
    if (mobileReportStickyTitle) return mobileReportStickyTitle;
    if (context === "add_salary") return "Add Salary";
    return "Report";
  }, [mobileReportStickyTitle, context]);

  const handleExcelLedger = useCallback(() => {
    const rows = filteredMobileTransactions.map((t: Record<string, unknown>) => {
      const dRaw = (t as { date?: { toDate?: () => Date } }).date;
      const d = dRaw?.toDate ? dRaw.toDate() : new Date((t as { date?: unknown }).date as string | number | Date);
      return {
        "Date (BS)": formatDateBS(d),
        "Date (AD)": formatDate(d),
        "Voucher No.": (t as { voucherNumber?: string }).voucherNumber,
        Type:
          typeof (t as { type?: string }).type === "string"
            ? ((t as { type: string }).type || "").replace(/_/g, " ")
            : String((t as { type?: unknown }).type ?? ""),
        Narration: String((t as { narration?: string }).narration || ""),
        Debit: Number((t as { debit?: number }).debit) || 0,
        Credit: Number((t as { credit?: number }).credit) || 0,
        Balance: `${Math.abs(Number((t as { balance?: number }).balance) || 0).toFixed(2)} ${((t as { balance?: number }).balance ?? 0) >= 0 ? "Dr" : "Cr"}`,
      };
    });
    const summaryRows = [
      {
        "Date (BS)": "Opening Balance",
        Balance: `${Math.abs(openingBalanceForPeriod).toFixed(2)} ${openingBalanceForPeriod >= 0 ? "Dr" : "Cr"}`,
      },
      { "Date (BS)": "Total", Debit: periodDr, Credit: periodCr },
      {
        "Date (BS)": "Closing Balance",
        Balance: `${Math.abs(closingBalance).toFixed(2)} ${closingBalance >= 0 ? "Dr" : "Cr"}`,
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet([...rows, {}, ...summaryRows] as Record<string, unknown>[]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger");
    const safeName = (staff.name || "staff").replace(/[/\\?%*:|"<>]/g, "-");
    XLSX.writeFile(workbook, `${safeName}_ledger.xlsx`);
  }, [
    filteredMobileTransactions,
    formatDate,
    formatDateBS,
    openingBalanceForPeriod,
    periodDr,
    periodCr,
    closingBalance,
    staff.name,
  ]);

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

  const renderMobileView = () => {
    const isReportMobileChrome = mobileFooterVariant === "report";
    // All-vouchers report: staff combobox hide — sirf search + date summary.
    const hideReportStaffPicker = isReportMobileChrome && (isAllVouchersView || staff.id === "all");
    // All Salary / all-vouchers: sirf ek title — "Add Salary · All Salary Vouchers" duplicate na ho.
    const reportHeaderTitleOnly = isReportMobileChrome && (isAllVouchersView || staff.id === "all");
    const handleMobilePrint = balanceMode === "bill_wise" ? handlePrintBillWise : handlePrintStatement;

    return (
    <>
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      {/* Mobile: scroll area extends to footer; ledger uses pb-36 for fixed bars; report uses in-flow pager + mb-12 */}
      {isReportMobileChrome && onBack ? (
        <header className="sticky top-0 z-10 flex-shrink-0 border-b bg-white p-3 dark:bg-card">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleMobileBack} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {reportHeaderTitleOnly ? (
              <h1 className="min-w-0 flex-1 text-base font-bold text-muted-foreground">{reportStickyTitle}</h1>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <h1 className="shrink-0 text-base font-bold text-muted-foreground">{reportStickyTitle}</h1>
                  <span className="shrink-0 select-none text-muted-foreground/55" aria-hidden>·</span>
                  <span
                    className={cn("min-w-0 truncate text-sm font-medium", masterDetailBalanceToneClass(closingBalance))}
                    title={staff.name}
                  >
                    {staff.name}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold whitespace-nowrap",
                    closingBalance >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {formatCurrency(closingBalance, { showDrCr: true })}
                </span>
              </>
            )}
          </div>
        </header>
      ) : onBack ? (
        <div className="flex flex-shrink-0 items-center gap-1 border-b px-2 py-0.5" {...mdcNoEdgeSwipeCapture}>
          <Button variant="ghost" size="icon" onClick={handleMobileBack} className="h-6 w-6 flex-shrink-0" aria-label="Back">
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <h1 className="shrink-0 text-sm font-bold text-muted-foreground">Staff details</h1>
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={staff.name}>
            {staff.name}
          </span>
        </div>
      ) : null}
      <MobileDetailSummaryCollapsible>
      {/* Row 2: Last 10 Txns or date range label */}
      <div className="flex flex-shrink-0 items-center justify-center gap-1 border-b px-2 py-0.5">
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">
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
      <div className={mdc.balanceRow}>
        <p className={cn(mdc.balanceTextCenter, closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
          {closingBalance === 0
            ? "Settled Up"
            : formatCurrency(closingBalance, { showDrCr: true })}
        </p>
      </div>
      {/* Staff dropdown + Edit + Search */}
      <div className="flex-shrink-0 border-b px-2 py-1">
        <div className="flex items-stretch gap-1.5">
          {!hideReportStaffPicker && allStaff && allStaff.length > 0 && (
            <div className="h-8 min-w-0 flex-1 [&_button]:h-8 [&_button]:text-xs">
              <Combobox
                options={[
                  ...allStaff.map((s) => ({
                    value: s.id,
                    label: s.name,
                  })),
                  // Dropdown-only All Vouchers action: keep at list bottom instead of separate button.
                  ...(onShowAll ? [{ value: "all-vouchers", label: "All Vouchers", isSpecial: true }] : []),
                ]}
                value={isAllVouchersView ? "all-vouchers" : (staff?.id || "")}
                onChange={(value) => {
                  // Dropdown quick actions: switch selected staff or jump to create-staff page from "Add New".
                  if (value === "all-vouchers") {
                    onShowAll?.();
                    return;
                  }
                  if (value === "add-new") {
                    router.push("/staff");
                    return;
                  }
                  if (value && value !== staff.id) {
                    // Report view compatibility: prefer local selection callback over route navigation.
                    if (onSelectStaff) {
                      onSelectStaff(value);
                    } else {
                      router.push(`/staff?selected=${value}`);
                    }
                  }
                }}
                placeholder="Select staff"
                addNewLabel="+ Add New Staff"
                maxVisibleOptions={15}
              />
            </div>
          )}
          {isAllVouchersView ? (
            // All-vouchers mode safety: editing is disabled because no single staff is selected.
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              disabled
              aria-disabled="true"
            >
              <Edit className="h-4 w-4" />
            </Button>
          ) : (
            <EditStaffDialog
              staff={staff}
              allGroups={allGroups}
              onStaffUpdated={handleStaffUpdated}
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
                className="h-8 w-8 flex-shrink-0"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </EditStaffDialog>
          )}
          <div className="relative h-8 min-w-0 flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
            <Input
              placeholder="Search transactions"
              className="h-8 w-full min-w-0 pl-7 text-xs"
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
      </MobileDetailSummaryCollapsible>
      {/* Transactions list - extends to footer line */}
      {/* scroll-touch + inline style for APK/WebView touch scroll */}
      <div
        className="flex-1 min-h-0 overflow-auto scroll-touch"
        style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className={isReportMobileChrome ? "pb-2" : "pb-36"}>
        {isReportMobileChrome && mobileReportView === "chart" ? (
          <RunningBalanceFullChart
            transactions={filteredMobileTransactions}
            openingBalance={openingBalanceForPeriod}
          />
        ) : (
        <TransactionsTable
          transactions={mobileTransactionsToShow}
          context="staff"
          contextId={staff.id}
          openingBalance={mobilePaginationMeta.openingForPage}
          booksOpeningBalance={masterStaffOpening}
          ledgerDateFilterActive={hasLedgerDateFilter}
          ledgerShowBookOpeningRow={currentPage === 1}
          openingBalancePeriodStartDate={dateRange?.from}
          dateRange={dateRange}
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
          {...statementCheck.tableProps}
        />
        )}
        </div>
      </div>
      {(!isReportMobileChrome || mobileReportView === "list") &&
        (isReportMobileChrome ? (
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
        ) : (
      <div className="fixed bottom-9 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-2 py-1">
        {/* Staff-page style: keep pager fixed just above bottom action buttons. */}
        <MobileTransactionsPager
          className="mb-0"
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
          </div>
        ))}
    </div>
    {isReportMobileChrome ? (
      <>
        <ReportMobileLedgerFooter
          onPrint={handleMobilePrint}
          onExcel={handleExcelLedger}
          onDateOpen={() => {
            openingModalRef.current = true;
            setIsCalendarOpen(true);
            openModalInUrl();
          }}
          balanceMode={balanceMode}
          onBalanceModeToggle={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
          mobileView={mobileReportView}
          onViewToggle={() => setMobileReportView((v) => (v === "list" ? "chart" : "list"))}
        />
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
      </>
    ) : (
      <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
        <Button
          type="button"
          className="flex-1 h-6 min-w-0 rounded-md bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium"
          onClick={handleMobilePrint}
        >
          <Printer className="mr-1 h-3.5 w-3.5" />
          Print
        </Button>
        {/* Mobile: ek button — Statement ↔ Bill wise toggle (Party ledger jaisa). */}
        <Button
          type="button"
          className={cn(
            "flex-1 h-6 min-w-0 rounded-md text-xs font-medium",
            balanceMode === "bill_wise"
              ? "bg-orange-600 hover:bg-orange-700 text-white"
              : "bg-violet-600 hover:bg-violet-700 text-white"
          )}
          onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
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
    )}
    </>
    );
  };

  const renderDesktopView = () => (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header: Part 1 (nameâ†’balance) and Part 2 (dateâ†’print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-slim-dim">
            {isMobile && onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                <ArrowLeft className="h-3 w-3" />
              </Button>
            )}
            <EntityFileAttachmentHover fileUrl={staffHeaderAttachmentUrl} triggerClassName="inline-flex shrink-0 rounded-full">
              <ResolvedEntityAvatar
                className="h-12 w-12 text-lg flex-shrink-0"
                src={staffHeaderAttachmentUrl ?? undefined}
                alt={staff.name}
                fallbackSlot={<Briefcase className="h-6 w-6 text-muted-foreground" />}
              />
            </EntityFileAttachmentHover>
            <div className="flex flex-col min-w-0 gap-0.5">
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{staff.name}</h2>
                <EditStaffDialog
                  staff={staff}
                  allGroups={allGroups}
                  onStaffUpdated={handleStaffUpdated}
                  onStaffDeleted={() => onStaffDeleted(staff.id)}
                >
                  {/* All-vouchers mode safety: disable edit for aggregate view. */}
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" data-theme-detail="edit" disabled={Boolean(isAllVouchersView)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditStaffDialog>
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance < 0 ? "text-red-600" : "text-green-600")}>
                  {formatCurrency(closingBalance, { showDrCr: true })}
                </div>
                <ReconciliationAccountButton accountId={staff.id} />
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <LedgerUnapprovedFilterButton active={unapprovedOnly} onClick={toggleUnapprovedOnly} />
            {(dateSystem === 'BS' || dateSystem === 'Both') && (
              <BsDatePicker
                isRange
                valueAD={dateRange}
                onChangeAD={handleBsDateRangeChange}
                transactionDates={transactionDates}
                className={cn("w-auto", LEDGER_HEADER_PILL_CN)}
              />
            )}
            {(dateSystem === 'AD' || dateSystem === 'Both') && (
              <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant="chromePill"
                    className={cn("justify-start text-left font-normal px-2 w-auto", LEDGER_HEADER_PILL_CN, !dateRange && "text-muted-foreground")}
                    data-theme-detail="date-range"
                  >
                    <CalendarIcon className={cn("mr-2", LEDGER_HEADER_PILL_ICON_SIZE_CN)} />
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
                        onDateRangeChangeWithUnapprovedReset(next);
                          setIsDesktopCalendarOpen(false);
                        } else {
                          const next = { from: range.from, to: adDate };
                          setTempDateRange(next);
                          onDateRangeChangeWithUnapprovedReset(next);
                          setIsDesktopCalendarOpen(false);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
            {isFilterActive && (
              <Button variant="ghost" size="icon" onClick={clearFilters} className={cn(LEDGER_HEADER_PILL_ICON_CN, "text-muted-foreground hover:text-foreground")} aria-label="Clear date filter">
                <XCircle className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
              </Button>
            )}
            <LedgerViewModePills
              value={balanceMode}
              onChange={setBalanceMode}
              options={[
                { value: "statement", label: "Statement" },
                { value: "bill_wise", label: "Bill wise" },
              ]}
            />
            <Button
              variant="chromePill"
              size="sm"
              onClick={() => setIsNoteOpen(true)}
              className={LEDGER_HEADER_PILL_CN}
              data-theme-detail="add-note"
            >
              <FilePlus className={cn("mr-2", LEDGER_HEADER_PILL_ICON_SIZE_CN)} />
              Add Note
            </Button>
            {onShowAll && (
              <Button variant="chromePill" size="sm" onClick={onShowAll} className={LEDGER_HEADER_PILL_CN}>
                All Vouchers
              </Button>
            )}
            <Button
              variant="chromePill"
              size="icon"
              onClick={balanceMode === "bill_wise" ? handlePrintBillWise : handlePrintStatement}
              className={LEDGER_HEADER_PILL_ICON_CN}
              data-theme-detail="print"
            >
              <Printer className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
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
                  booksOpeningBalance={masterStaffOpening}
                  ledgerDateFilterActive={hasLedgerDateFilter}
                  ledgerShowBookOpeningRow={currentPage === 1}
                  openingBalancePeriodStartDate={dateRange?.from}
                  dateRange={dateRange}
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
                      onStaffUpdated={handleStaffUpdated}
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
                  {...statementCheck.tableProps}
                />
          {paginatedTransactions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No transactions found for this staff member in the selected period.</div>
          )}
        </div>
      </div>
      {/* Footer — global PC shell LedgerDesktopFooter */}
      <LedgerDesktopFooter
        left={
          <>
              <LedgerFooterCheckboxPill
                id="show-narration-staff"
                checked={showNarration}
                onCheckedChange={(checked) => (checked) => handleShowNarrationChange(Boolean(checked))}
                label="Show Narration"
              />
            <LedgerFooterColumnsMenu>
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
              </LedgerFooterColumnsMenu>
              <LedgerFooterCheckboxPill
                id="show-notes-staff"
                checked={includeNotesInTable}
                disabled={notesPreferenceLockedOnMobile}
                onCheckedChange={(c) => setShowNotes(Boolean(c))}
                label="Note"
              />
            <StatementCheckModeFooterControls
              idPrefix="staff"
              enabled={statementCheck.checkModeEnabled}
              onEnabledChange={statementCheck.setCheckModeEnabled}
              viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
              hiddenCount={statementCheck.hiddenCount}
            />
          </>
        }
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(by, order) => {
          setSortBy(by);
          setSortOrder(order);
        }}
        viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
        currentPage={currentPage}
        totalPages={totalPages}
        setCurrentPage={setCurrentPage}
        rowsPerPageSelectValue={rowsPerPageSelectValue}
        onRowsPerPageChange={handleRowsPerPageChange}
        rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS_STAFF}
        beforeCount={desktopPaginationMeta.beforeCount}
        afterCount={desktopPaginationMeta.afterCount}
        totalCount={displayTransactions.length}
      />
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
        ledgerEntityId={staff?.id}
        ledgerOpeningBalanceOutstanding={openingBalanceOutstanding}
        ledgerBooksOpeningBalanceSigned={ledgerOpeningForRunning}
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
              await applyPaymentBillWiseLinkAllocations(companyId, linkPaymentVoucher, allocations);
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

    
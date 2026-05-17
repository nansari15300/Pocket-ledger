
'use client';

import * as React from "react";
import { openPrintDirect } from "@/lib/printDirect";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Edit, Printer, Users, Calendar as CalendarIcon, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FilePlus, XCircle, MoreVertical, ArrowLeft, Scroll, DollarSign, ChevronDown, Columns3, Search } from "lucide-react";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { LedgerFooterCheckboxPill, LedgerFooterTextPill, LedgerFooterChromePill } from "@/components/vouchers/ledgerFooterChrome";
import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";
import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";
import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";


import { useTransactionVisibleColumns, COLUMN_LABELS, useShowNotes } from "../vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import {
  clearPlModalParentQueryBackup,
  pathnameForModalRouterReplace,
  patchMasterDetailUrlAfterModalClose,
  persistPlModalParentQuery,
  searchParamsStringAfterClosingModal,
  searchParamsStringForModalClose,
} from "@/lib/modalUrlSync";
import { startOfDay, endOfDay, format } from "date-fns";
import AdCalendar from "../ui/ad-calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useCompany } from "@/hooks/useCompany";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { MobileDetailSummaryCollapsible } from "@/components/layout/MobileDetailSummaryCollapsible";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import { EditExpenseGroupDialog } from "@/components/expenses/EditExpenseGroupDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { useTransactions, getTransactionAmounts } from "@/hooks/use-transactions";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { useVouchers } from "@/hooks/useVouchers";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import usePermissions from "@/hooks/usePermissions";
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
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { pushIncomeExpenseGroupSwitch } from "@/lib/incomeExpenseDetailNav";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription as MobileDialogDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";


const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};


export function ExpenseGroupDetails({ 
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
  group: ExpenseGroup, 
  allGroups: ExpenseGroup[],
  accounts: ExpenseAccount[],
  onGroupUpdated: () => void, 
  onGroupDeleted: () => void,
  onAccountUpdated: () => void,
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames?: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { company, companyId } = useCompany();
  const { processedExpenseAccounts, vouchers, journalAccountNames } = useVouchers();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { showNotes, setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const { balanceMode } = useBalanceMode();
  const { can } = usePermissions();
  const accountsInGroup = useMemo(() => {
    if (group.id === "ungrouped") {
      // Ungrouped should include both empty groupId and persisted ungrouped id rows.
      const ungroupedRows = processedExpenseAccounts.filter((a) => !a.groupId || a.groupId === "ungrouped_expense");
      if (ungroupedRows.length > 0) return ungroupedRows as ExpenseAccount[];
      return accounts.filter((a) => !a.groupId || a.groupId === "ungrouped_expense");
    }
    const fromProcessed = processedExpenseAccounts.filter((a) => a.groupId === group.id);
    if (fromProcessed.length > 0) return fromProcessed as ExpenseAccount[];
    return accounts.filter((a) => a.groupId === group.id);
  }, [processedExpenseAccounts, accounts, group.id]);
  const mobileSearchNames = useMemo(
    () => ({
      ...journalAccountNames,
      ...Object.fromEntries(accountsInGroup.map((a) => [a.id, a.name])),
      ...(userNames ?? {}),
    }),
    [journalAccountNames, accountsInGroup, userNames]
  );
  const childGroups = useMemo(() => allGroups.filter((g) => (g as any).parentId === group.id), [allGroups, group.id]);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [group.id]);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "add_expense" | "add_income" | "add_salary">(null);
  const openingModalRef = useRef(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);
  
  const groupEntity = useMemo(() => {
    // Include expenseGroupIds so useTransactions can identify income/expense groups
    const expenseGroupIds = [group.id];
    const entity = { ...group, items: accountsInGroup, expenseGroupIds };
    return entity;
  }, [group, accountsInGroup]);

  const groupMemberTransactions = useMemo(() => {
    if (!accountsInGroup.length) return [];
    const firstMember = accountsInGroup.find(Boolean);
    if (!firstMember) return [];

    const memberIds = new Set(accountsInGroup.map((a) => a.id));
    const hasExpenseImpactForAccount = (v: any, acc: ExpenseAccount) => {
      const amounts = getTransactionAmounts(v, "expense", acc, undefined, processedExpenseAccounts);
      return Number(amounts.debit || 0) !== 0 || Number(amounts.credit || 0) !== 0;
    };

    return (vouchers || []).filter((v: any) => {
      if (v.type === "note") return memberIds.has(v.entityId);

      // Step 1: first member tracking (same account-details expense filter path)
      const firstMemberHit = hasExpenseImpactForAccount(v, firstMember);
      if (firstMemberHit) return true;

      // Step 2: then check remaining members with same filter logic
      return accountsInGroup.some((acc) => hasExpenseImpactForAccount(v, acc));
    });
  }, [accountsInGroup, vouchers, processedExpenseAccounts]);
  
  const { openingBalanceForPeriod, processedTransactions, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions(groupEntity, "group", dateRange, undefined, processedExpenseAccounts, groupMemberTransactions, undefined, filters, undefined, undefined, userNames);

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

  const anyMobilePopupOpen = isMobile && (
    !!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen
  );

  const openModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    persistPlModalParentQuery(searchParams.toString());
    const params = new URLSearchParams(searchParamsStringForModalClose(searchParams.toString()));
    params.set("modal", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const raw = searchParamsStringAfterClosingModal(searchParams.toString());
    const params = new URLSearchParams(raw);
    params.delete("modal");
    params.delete("modalts");
    patchMasterDetailUrlAfterModalClose(params, { entityId: group.id, groupsTab: true });
    const q = params.toString();
    const basePath = pathnameForModalRouterReplace(pathname);
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
    clearPlModalParentQueryBackup();
  }, [pathname, searchParams, router, group.id]);

  const modalParam = searchParams.get("modal");
  const urlModalOpen = isMobile && modalParam === "1" && anyMobilePopupOpen;
  const closeUrlModal = useCallback(() => {
    setMobileFooterDialogOpen(null);
    setIsCalendarOpen(false);
    setIsVoucherDialogOpen(false);
    setSelectedVoucher(null);
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
    }
  }, [isMobile, modalParam, anyMobilePopupOpen]);

  const searchFilteredTransactions = useMemo(() => {
    if (!mobileSearchTerm) return processedTransactions;
    const q = mobileSearchTerm.toLowerCase().trim();
    return processedTransactions.filter((t) => {
      const d = t.date?.toDate ? t.date.toDate() : t.date ? new Date(t.date) : null;
      const dateStr = d ? (dateSystem === "BS" ? formatDateBS(d) : format(d, "yyyy-MM-dd")) : "";
      const amt = t.debit > 0 ? t.debit : t.credit;
      const bal = t.balance ?? t.runningBalance ?? 0;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "group", group.id).includes(q) ||
        dateStr.toLowerCase().includes(q) ||
        String(amt || 0).toLowerCase().includes(q) ||
        String(t.debit || 0).toLowerCase().includes(q) ||
        String(t.credit || 0).toLowerCase().includes(q) ||
        String(bal).toLowerCase().includes(q)
      );
    });
  }, [processedTransactions, mobileSearchTerm, dateSystem, formatDateBS, format, mobileSearchNames, group.id]);

  const mobileTransactionsToShow = useMemo(() => {
    const list = searchFilteredTransactions;
    if (rowsPerPage <= 0) return list;
    const total = list.length;
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return list.slice(start, Math.max(start, end));
  }, [searchFilteredTransactions, currentPage, rowsPerPage]);
  const mobilePagerEdgeCounts = useMemo(() => {
    const total = searchFilteredTransactions.length;
    if (rowsPerPage <= 0) return { before: 0, after: 0 };
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return { before: start, after: Math.max(0, total - end) };
  }, [searchFilteredTransactions.length, currentPage, rowsPerPage]);

  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(searchFilteredTransactions.length / rowsPerPage) : 1;
    const safeTotal = Math.max(1, total);
    setCurrentPage((prev) => Math.min(Math.max(1, prev), safeTotal));
  }, [dateRange, searchFilteredTransactions.length, rowsPerPage]);

  const buildDateRangeText = () => {
    if (!company) return "All Time";
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
  const dateRangeLabel = buildDateRangeText();

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
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, closeModalInUrl, onBack]);

  const groupDropdownOptions = useMemo(() => {
    return (allGroups || []).map((g) => ({ value: g.id, label: g.name }));
  }, [allGroups]);

  const handleEditVoucher = (voucher: any) => {
    if (isMobile) openingModalRef.current = true;
    setSelectedVoucher(voucher);
    if (isMobile) openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  // When showNotes is off, hide note-type transactions (localStorage, shared across pages)
  const displayTransactions = useMemo(
    () => (showNotes ? processedTransactions : processedTransactions.filter((t: any) => t.type !== "note")),
    [processedTransactions, showNotes]
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
  // Statement check mode + desktop tail paging (PC footer Check mode pill)
  const {
    statementCheck,
    desktopPaginationMeta,
    paginatedTransactions,
    totalPages,
  } = useStatementLedgerCheckModePaging({
    companyId,
    context: "group",
    contextId: group?.id,
    viewMode: balanceMode === "bill_wise" ? "bill_wise" : "statement",
    searchFilteredTransactions: sortedTransactions,
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning: openingBalanceForPeriod,
  });

  
  const handleOpenNoteDialog = (accountId?: string) => {
    if (accountsInGroup.length === 1) {
        setNoteEntityId(accountsInGroup[0].id);
    } else if (accountId) {
        setNoteEntityId(accountId);
    }
    setIsNoteOpen(true);
  };
  
  const handlePrint = () => {
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
    // Keep print headers aligned with currently selected table columns.
    const printVisibleColumns = balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns;
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
      title: `Group Statement: ${group.name}`,
      context: 'group',
      contextId: group.id,
      dateSystem: dateSystem,
      dateRangeText: dateRangeText,
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (group as any).openingBalanceDate,
      openingBalanceNarration: (group as any).openingBalanceNarration ?? null,
      transactions: processedTransactions,
      showNarration: showNarration,
      includeNotes: includeNotesInTable,
      visibleColumns: printVisibleColumns,
      billWise: balanceMode === "bill_wise",
      userNames: userNames,
    }, true);
  };

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden w-full">
          {/* Mobile: scroll + pager above fixed footer */}
          {/* Mobile: date/balance/search — footer chevron se collapse */}
          <MobileDetailSummaryCollapsible>
          <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {!dateRange || (dateRange.from == null && dateRange.to == null)
                ? rowsPerPage > 0
                  ? `Last ${rowsPerPage} Txns`
                  : "All Txns"
                : dateRangeLabel}
            </span>
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
          <div className="px-3 py-2 border-b flex-shrink-0">
            <p className={cn("text-2xl font-bold text-center", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
            </p>
          </div>
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              {allGroups && allGroups.length > 0 && (
                <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                  <Combobox
                    options={groupDropdownOptions}
                    value={group.id}
                    onChange={(value) => {
                      // `/incomes` + query-nav: segment-replace se galat URL; account jaisa hi group ke liye helper
                      if (value && value !== group.id) pushIncomeExpenseGroupSwitch(router, pathname || "", value);
                    }}
                    placeholder="Select group"
                  />
                </div>
              )}
              {group.id !== "ungrouped" && (
                <EditExpenseGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditExpenseGroupDialog>
              )}
              <div className="flex-1 min-w-0 h-9 relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
                <Input
                  placeholder="Search transactions"
                  className="pl-8 h-9 text-sm w-full min-w-0"
                  value={mobileSearchTerm}
                  onChange={(e) => {
                    setMobileSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
          </div>
          </MobileDetailSummaryCollapsible>
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-touch touch-pan-y"
              style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
            <div className="pb-2">
            <TransactionsTable
              transactions={mobileTransactionsToShow}
              context="group"
              contextId={group.id}
              openingBalance={desktopPaginationMeta.openingForPage}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceDate={(group as any).openingBalanceDate}
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              userNames={userNames}
              accountNames={Object.fromEntries(accountsInGroup.map((a) => [a.id, a.name]))}
              onRowClick={handleEditVoucher}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={desktopPaginationMeta.periodDrForPage}
              periodCr={desktopPaginationMeta.periodCrForPage}
              closingBalance={desktopPaginationMeta.closingForPage}
              scrollOnlyTransactions
            
              {...statementCheck.tableProps}/>
            </div>
            </div>
            <MobileTransactionsPager
              className="mt-auto shrink-0 mb-12"
              currentPage={currentPage}
              totalItems={searchFilteredTransactions.length}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(nextRows) => {
                setRowsPerPage(nextRows);
                setCurrentPage(1);
              }}
              onPageChange={setCurrentPage}
              edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
            />
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          <Button
            className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
            onClick={() => {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("add_expense");
              openModalInUrl();
            }}
          >
            Add Expense
          </Button>
          <Button
            className="flex-1 h-6 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
            onClick={() => {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("add_income");
              openModalInUrl();
            }}
          >
            Add Income
          </Button>
          <Button
            className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            onClick={() => {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("add_salary");
              openModalInUrl();
            }}
          >
            Add Salary
          </Button>
          <Drawer
            open={isCalendarOpen}
            onOpenChange={(open: boolean) => {
              if (open) {
                openingModalRef.current = true;
                openModalInUrl();
              }
              setIsCalendarOpen(open);
              if (!open) closeModalInUrl();
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
                <MobileDialogDescription>Select a date range for the transaction list.</MobileDialogDescription>
              </DrawerHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                {(dateSystem === "BS" || dateSystem === "Both") && (
                  <NepaliCalendar
                    rangePresetSlot={
                      <DateRangePresetRow
                        country={company?.country}
                        onApply={(r) => {
                          onDateRangeChange?.(r);
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
                            onDateRangeChange?.(r);
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
                          onDateRangeChange({ from: adDate, to: undefined });
                        } else if (adDate < range.from) {
                          onDateRangeChange({ from: adDate, to: range.from });
                          setIsCalendarOpen(false);
                        } else {
                          onDateRangeChange({ from: range.from, to: adDate });
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
          isOpen={!!mobileFooterDialogOpen && mobileFooterDialogOpen === "add_expense"}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setMobileFooterDialogOpen(null);
              closeModalInUrl();
            }
          }}
          defaultTab="direct_expense"
          allowedTabs={["sale", "purchase", "direct_income", "direct_expense", "add_salary"]}
          onVoucherAction={() => onAccountUpdated()}
        />
        <AddVoucherDialog
          isOpen={!!mobileFooterDialogOpen && mobileFooterDialogOpen === "add_income"}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setMobileFooterDialogOpen(null);
              closeModalInUrl();
            }
          }}
          defaultTab="direct_income"
          allowedTabs={["sale", "purchase", "direct_income", "direct_expense", "add_salary"]}
          onVoucherAction={() => onAccountUpdated()}
        />
        <AddVoucherDialog
          isOpen={!!mobileFooterDialogOpen && mobileFooterDialogOpen === "add_salary"}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setMobileFooterDialogOpen(null);
              closeModalInUrl();
            }
          }}
          defaultTab="add_salary"
          allowedTabs={["sale", "purchase", "direct_income", "direct_expense", "add_salary"]}
          onVoucherAction={() => onAccountUpdated()}
        />
        <AddVoucherDialog
          isOpen={isVoucherDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) closeModalInUrl();
            setIsVoucherDialogOpen(open);
          }}
          voucher={selectedVoucher}
          onVoucherAction={() => setSelectedVoucher(null)}
        />
      </div>
    );
  }

  return (
    <>
      {/* min-h-0 + flex-1 ScrollArea: flex item ko shrink dena zaroori — warna table height expand ho kar scroll band */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="flex-shrink-0 border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-slim-dim">
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
                {group.id !== 'ungrouped' && (
                  <EditExpenseGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditExpenseGroupDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(closingBalance, {showDrCr: true})}
                </div>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
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
                      rangePresetSlot={
                        <DateRangePresetRow
                          country={company?.country}
                          onApply={(r) => {
                            setTempDateRange(r);
                            onDateRangeChange(r);
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
                <Button variant="ghost" size="icon" onClick={clearFilters} className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear date filter">
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between flex-shrink-0 h-10">
                    <span className="truncate">Members ({accountsInGroup.length})</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
                  {accountsInGroup.map((p) => (
                    <DropdownMenuItem key={p.id} disabled>
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="truncate text-left">{p.name}</span>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-semibold tabular-nums",
                            (Number((p as any).balance) || 0) >= 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {formatCurrency(Number((p as any).balance) || 0, { showDrCr: true })}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => handleOpenNoteDialog()} className="flex-shrink-0 h-10">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrint} className="flex-shrink-0 h-10 w-10">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="py-4">
            <TransactionsTable
              transactions={paginatedTransactions}
              context="group"
              contextId={group.id}
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              openingBalance={desktopPaginationMeta.openingForPage}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceDate={(group as any).openingBalanceDate}
              userNames={userNames}
              onRowClick={handleEditVoucher}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={desktopPaginationMeta.periodDrForPage}
              periodCr={desktopPaginationMeta.periodCrForPage}
              closingBalance={desktopPaginationMeta.closingForPage}
            />
            {paginatedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found for the selected period.
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="flex-shrink-0 border-t py-2 px-4 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <LedgerFooterCheckboxPill
                id="show-narration-expense-group"
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
                        className={cn("flex items-center gap-2", isStatusLocked ? "cursor-not-allowed" : "cursor-pointer")}
                      >
                        <Checkbox
                          id={`col-${key}-expense-group`}
                          checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                          disabled={isStatusLocked}
                          onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-expense-group`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </LedgerFooterColumnsMenu>
              <LedgerFooterCheckboxPill
                id="show-notes-expense-group"
                checked={includeNotesInTable}
                disabled={notesPreferenceLockedOnMobile}
                onCheckedChange={(c) => setShowNotes(Boolean(c))}
                label="Note"
              />
              <StatementCheckModeFooterControls
                idPrefix="expense-group"
                enabled={statementCheck.checkModeEnabled}
                onEnabledChange={statementCheck.setCheckModeEnabled}
                viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
                hiddenCount={statementCheck.hiddenCount}
              />
            </div>
            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <TransactionTableSortDropdown
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
                viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
              />
              <LedgerFooterTextPill>Page {currentPage} of {totalPages}</LedgerFooterTextPill>
              <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <LedgerFooterChromePill className="px-1">

              <Select
                value={`${rowsPerPage}`}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-[64px] border-0 bg-transparent shadow-none focus:ring-0">
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
              </LedgerFooterChromePill><Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <LedgerFooterTextPill>Total Trxn {displayTransactions.length}</LedgerFooterTextPill>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
                <DialogTitle>Add a New Note for an Account in {group.name}</DialogTitle>
                <DialogDescription>
                    {accountsInGroup.length > 1 ? "Select which account this note applies to." : "Record a new note for this account."}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
                {accountsInGroup.length > 1 && !noteEntityId && (
                     <div className="flex flex-col gap-2 p-4">
                        <p className="font-semibold">Select an account for the note:</p>
                        {accountsInGroup.map(acc => (
                            <Button key={acc.id} variant="outline" onClick={() => setNoteEntityId(acc.id)}>
                                {acc.name}
                            </Button>
                        ))}
                    </div>
                )}
                {noteEntityId && (() => {
                    const selectedAccount = accountsInGroup.find((a: any) => a.id === noteEntityId);
                    const noteContext = selectedAccount?.type === "Income" ? "Income" : "Expense";
                    return (
                    <CreateNoteForm
                        onVoucherAction={() => {
                            onAccountUpdated();
                            setIsNoteOpen(false);
                            setNoteEntityId(null);
                        }}
                        initialContext={noteContext}
                        initialEntityId={noteEntityId}
                        showSaveAndApproveOnCreate={can("approve_transactions")}
                        showApproveButton={can("approve_transactions")}
                        compactFooter
                    />
                    );
                })()}
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
        onVoucherAction={() => setSelectedVoucher(null)}
      />
    </>
  );
}

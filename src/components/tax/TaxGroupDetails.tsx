
'use client';

import * as React from "react";
import { openPrintDirect } from "@/lib/printDirect";
import type { Tax, TaxGroup } from "@/components/tax/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Edit, Printer, Users, Calendar as CalendarIcon, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FilePlus, XCircle, MoreVertical, ArrowLeft, Receipt, ChevronDown, Columns3 } from "lucide-react";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useTransactionVisibleColumns, COLUMN_LABELS, useShowNotes } from "../vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, format } from "date-fns";
import { Calendar } from "../ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useCompany } from "@/hooks/useCompany";
import { EditTaxGroupDialog } from "./EditTaxGroupDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "@/components/ui/combobox";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { calendarPanelClassName } from "@/lib/calendarChrome";
import type { BSDate } from "@/lib/bs-date";
import { Search } from "lucide-react";
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


const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};


export function TaxGroupDetails({ 
  group,
  allGroups,
  taxes,
  onGroupUpdated, 
  onGroupDeleted,
  onTaxUpdated,
  dateRange,
  onDateRangeChange,
  onBack,
  userNames,
  journalAccountNames: journalAccountNamesProp,
}: {
  group: TaxGroup;
  allGroups: TaxGroup[];
  taxes: Tax[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  onTaxUpdated: () => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames?: Record<string, string>;
  journalAccountNames?: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { company } = useCompany();
  const { processedTaxes, journalAccountNames: journalAccountNamesFromHook } = useVouchers();
  const journalAccountNames = journalAccountNamesProp ?? journalAccountNamesFromHook ?? {};
  const mobileSearchNames = useMemo(
    () => ({ ...journalAccountNames, ...(userNames ?? {}) }),
    [journalAccountNames, userNames]
  );
  const taxesInGroup = useMemo(() => {
    if (group.id === "ungrouped") {
      // Ungrouped should include both empty groupId and persisted ungrouped id rows.
      return taxes.filter((t) => !t.groupId || t.groupId === "ungrouped_tax");
    }
    return taxes.filter((t) => t.groupId === group.id);
  }, [taxes, group.id]);
  const childGroups = useMemo(() => allGroups.filter((g) => (g as any).parentId === group.id), [allGroups, group.id]);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const { balanceMode } = useBalanceMode();
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "sale" | "purchase">(null);
  const openingModalRef = React.useRef(false);

  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  const anyMobilePopupOpen = isMobile && (
    !!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen
  );

  const openModalInUrl = React.useCallback(() => {
    if (!isMobile || !pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("modal", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = React.useCallback(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("modal");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams, router]);

  const modalParam = searchParams.get("modal");
  const urlModalOpen = isMobile && modalParam === "1" && anyMobilePopupOpen;
  const closeUrlModal = React.useCallback(() => {
    setMobileFooterDialogOpen(null);
    setIsCalendarOpen(false);
    setIsVoucherDialogOpen(false);
    setSelectedVoucher(null);
    setIsNoteOpen(false);
    closeModalInUrl();
  }, [closeModalInUrl]);
  useUrlModalBack(urlModalOpen, closeUrlModal);

  React.useEffect(() => {
    if (!isMobile) return;
    if (modalParam === "1") openingModalRef.current = false;
    if (modalParam !== "1" && anyMobilePopupOpen && !openingModalRef.current) {
      setMobileFooterDialogOpen(null);
      setIsCalendarOpen(false);
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      setIsNoteOpen(false);
    }
  }, [isMobile, modalParam, anyMobilePopupOpen]);
  
  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames && userNames[userId]) return userNames[userId];
    try {
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data().displayName || userDoc.data().email || "Unknown";
        }
    } catch (e) {}
    return "Unknown";
  }, [userNames]);

  const { openingBalanceForPeriod, processedTransactions, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions({ ...group, items: taxes }, "group", dateRange, undefined, processedTaxes, undefined, undefined, filters, undefined, undefined, userNames);
  
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

  useEffect(() => {
    if (!processedTransactions) return;
    const uids = new Set(processedTransactions.map((t: any) => t.userId).filter(Boolean) as string[]);
    const newNames: Record<string, string> = {};
    let hasNewNames = false;
    const promises = Array.from(uids).map(async (uid: any) => {
      if (!userNames || !userNames[uid]) {
        hasNewNames = true;
        newNames[uid] = await fetchUserName(uid);
      }
    });

    Promise.all(promises).then(() => {
      if(hasNewNames) {
        // setUserNames((prev) => ({ ...prev, ...newNames }));
      }
    });
  }, [processedTransactions, userNames, fetchUserName]);


  const isFilterActive = dateRange !== undefined || Object.values(filters).some(v => v);
  
  const clearFilters = () => {
    onDateRangeChange(undefined);
    setFilters({});
  };

  const handleEditVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

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

  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
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
  };

  // PC: preference; mobile: hamesha notes (includeNotesInTable). Defined before filteredMobileTransactions.
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

  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return sortedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return sortedTransactions.filter((t: any) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "group", group.id, "tax").includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS, mobileSearchNames, group.id]);

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

  const dateRangeLabel = buildDateRangeText() || "All Time";
  const balanceText = closingBalance >= 0 ? "To Receive" : "To Pay";

  const groupDropdownOptions = useMemo(
    () => allGroups.map((g) => ({ value: g.id, label: g.name })),
    [allGroups]
  );

  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(filteredMobileTransactions.length / rowsPerPage) : 1;
    const safeTotal = Math.max(1, total);
    setCurrentPage((prev) => Math.min(Math.max(1, prev), safeTotal));
  }, [dateRange, filteredMobileTransactions.length, rowsPerPage]);

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / rowsPerPage));
  const paginatedTransactions = useMemo(() => {
    if (rowsPerPage <= 0) return sortedTransactions;
    const total = sortedTransactions.length;
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return sortedTransactions.slice(start, Math.max(start, end));
  }, [sortedTransactions, rowsPerPage, currentPage, totalPages]);
  // Page-break dynamic opening: opening row ko current page start se sync rakhna.
  const desktopPageLedgerStats = useMemo(() => {
    const total = sortedTransactions.length;
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    const pageRows = (sortedTransactions as any[]).slice(start, Math.max(start, end));
    let openingForPage = openingBalanceForPeriod;
    const previousTx = start > 0 ? (sortedTransactions as any[])[start - 1] : null;
    const previousRunningBalance =
      previousTx != null
        ? (typeof previousTx.balance === "number"
            ? previousTx.balance
            : typeof previousTx.runningBalance === "number"
              ? previousTx.runningBalance
              : undefined)
        : undefined;
    if (typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)) {
      openingForPage = previousRunningBalance;
    }
    const periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [sortedTransactions, openingBalanceForPeriod, currentPage, totalPages, rowsPerPage]);
  
  const handleOpenNoteDialog = (taxId?: string) => {
    if (taxes.length === 1) {
        setNoteEntityId(taxes[0].id);
    } else if (taxId) {
        setNoteEntityId(taxId);
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
      title: `Tax Group Statement: ${group.name}`,
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
          <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {!dateRange || (dateRange.from == null && dateRange.to == null)
                ? rowsPerPage > 0
                  ? `Last ${rowsPerPage} Txns`
                  : "All Txns"
                : dateRangeLabel}
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
          <div className="px-3 py-2 border-b flex-shrink-0">
            <p className={cn("text-2xl font-bold text-center", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {balanceText} {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
            </p>
          </div>
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                <Combobox
                  options={groupDropdownOptions}
                  value={group?.id || ""}
                  onChange={(value) => {
                    if (value && value !== group.id) router.push(`/tax/group/${value}`);
                  }}
                  placeholder="Select group"
                />
              </div>
              {group.id !== "ungrouped" && (
                <EditTaxGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={taxesInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditTaxGroupDialog>
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
              groupEntityType="tax"
              openingBalance={desktopPageLedgerStats.openingForPage}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceDate={(group as any).openingBalanceDate}
              openingBalanceActions={undefined}
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              journalAccountNames={journalAccountNames}
              userNames={userNames}
              onRowClick={(t) => { openModalInUrl(); handleEditVoucher(t); }}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={desktopPageLedgerStats.periodDrForPage}
              periodCr={desktopPageLedgerStats.periodCrForPage}
              closingBalance={desktopPageLedgerStats.closingForPage}
              isTaxContext={true}
              scrollOnlyTransactions
            />
            </div>
            </div>
            <MobileTransactionsPager
              className="mt-auto shrink-0 mb-12"
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
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          <Button className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("sale"); openModalInUrl(); }}>
            New Sale
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("purchase"); openModalInUrl(); }}>
            New Purchase
          </Button>
          <AddVoucherDialog
            isOpen={!!mobileFooterDialogOpen}
            onOpenChange={(open: boolean) => {
              if (!open) {
                setMobileFooterDialogOpen(null);
                closeModalInUrl();
              }
            }}
            defaultTab={mobileFooterDialogOpen || "sale"}
          />
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
                <DrawerDescription>Select a date range for the transaction list.</DrawerDescription>
              </DrawerHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                {(dateSystem === "BS" || dateSystem === "Both") && (
                  <NepaliCalendar
                    rangePresetSlot={
                      <DateRangePresetRow
                        country={company?.country}
                        onApply={(r) => {
                          onDateRangeChange(r);
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
                  <div className="flex-1">
                    <div
                      className={cn(
                        calendarPanelClassName,
                        "max-h-[min(90dvh,720px)] overflow-y-auto overscroll-contain"
                      )}
                    >
                      <div
                        className={cn(
                          "w-full border-b border-border pb-2 mb-2 -mt-0.5 shrink-0",
                          "sticky top-0 z-10 -mx-1 px-1 bg-white dark:bg-card shadow-[0_4px_6px_-4px_rgba(0,0,0,0.12)]"
                        )}
                      >
                        <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center sm:justify-start">
                          <DateRangePresetRow
                            country={company?.country}
                            onApply={(r) => {
                              onDateRangeChange(r);
                              setIsCalendarOpen(false);
                            }}
                          />
                        </div>
                      </div>
                      <Calendar
                        className="p-0 w-full"
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={asCalendarRange(dateRange)}
                        onSelect={(range) => {
                          onDateRangeChange(range as DateRange | undefined);
                          if (range?.from && range?.to) setIsCalendarOpen(false);
                        }}
                        numberOfMonths={calendarMonths}
                        modifiers={{ hasTransactions: transactionDates }}
                        modifiersClassNames={{ hasTransactions: "has-transactions" }}
                      />
                    </div>
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
        <Dialog
          open={isNoteOpen}
          onOpenChange={(open: boolean) => {
            setIsNoteOpen(open);
            if (!open) closeModalInUrl();
          }}
        >
          <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
              <DialogTitle>Add a New Note for a Tax Ledger in {group.name}</DialogTitle>
              <DialogDescription>
                {taxes.length > 1 ? "Select which tax ledger this note applies to." : "Record a new note for this tax ledger."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              {taxes.length > 1 && !noteEntityId && (
                <div className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">Select a tax for the note:</p>
                  {taxes.map((t) => (
                    <Button key={t.id} variant="outline" onClick={() => setNoteEntityId(t.id)}>
                      {t.name}
                    </Button>
                  ))}
                </div>
              )}
              {noteEntityId && (
                <CreateNoteForm
                  onVoucherAction={() => {
                    onTaxUpdated();
                    setIsNoteOpen(false);
                    setNoteEntityId(null);
                  }}
                  initialContext="Tax"
                  initialEntityId={noteEntityId}
                  compactFooter
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
            }
          }}
          voucher={selectedVoucher}
          onVoucherAction={() => setSelectedVoucher(null)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="h-full">
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
                {group.id !== 'ungrouped' && (
                  <EditTaxGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={taxesInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditTaxGroupDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(closingBalance, {showDrCr: true})}
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
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={asCalendarRange(tempDateRange)}
                      onSelect={(range) => {
                        if (range?.from) range.from.setHours(12, 0, 0, 0);
                        if (range?.to) range.to.setHours(12, 0, 0, 0);
                        setTempDateRange(range);
                        if (range?.from && range.to) {
                          onDateRangeChange(range);
                          setIsDesktopCalendarOpen(false);
                        } else if (!range) {
                          onDateRangeChange(undefined);
                        }
                      }}
                      numberOfMonths={calendarMonths}
                      modifiers={{ hasTransactions: transactionDates }}
                      modifiersClassNames={{ hasTransactions: 'has-transactions' }}
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
                    <span className="truncate">Members ({taxes.length})</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
                  {taxes.map(p => (
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
        <ScrollArea className="flex-1">
          <div className="py-4">
            <TransactionsTable
              transactions={paginatedTransactions}
              context="group"
              contextId={group.id}
              groupEntityType="tax"
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              openingBalance={desktopPageLedgerStats.openingForPage}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceDate={(group as any).openingBalanceDate}
              isTaxContext={true}
              journalAccountNames={journalAccountNames}
              userNames={userNames}
              onRowClick={handleEditVoucher}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={desktopPageLedgerStats.periodDrForPage}
              periodCr={desktopPageLedgerStats.periodCrForPage}
              closingBalance={desktopPageLedgerStats.closingForPage}
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
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-tax-group" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-tax-group" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                          id={`col-${key}-tax-group`}
                          checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                          disabled={isStatusLocked}
                          onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-tax-group`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Checkbox id="show-notes-tax-group" checked={includeNotesInTable} disabled={notesPreferenceLockedOnMobile} onCheckedChange={(c) => setShowNotes(Boolean(c))} />
                <label htmlFor="show-notes-tax-group" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Note</label>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <TransactionTableSortDropdown
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
                viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
              />
              <p className="text-sm font-medium flex-shrink-0">
                Page {currentPage} of {totalPages}
              </p>
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
              <p className="text-sm font-medium flex-shrink-0 tabular-nums">Total Trxn {displayTransactions.length}</p>
            </div>
          </div>
        </div>
      </div>
      </div>
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
                <DialogTitle>Add a New Note for a Tax Ledger in {group.name}</DialogTitle>
                <DialogDescription>
                    {taxes.length > 1 ? "Select which tax ledger this note applies to." : "Record a new note for this tax ledger."}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
                {taxes.length > 1 && !noteEntityId && (
                     <div className="flex flex-col gap-2 p-4">
                        <p className="font-semibold">Select a tax for the note:</p>
                        {taxes.map(t => (
                            <Button key={t.id} variant="outline" onClick={() => setNoteEntityId(t.id)}>
                                {t.name}
                            </Button>
                        ))}
                    </div>
                )}
                {noteEntityId && (
                    <CreateNoteForm 
                    onVoucherAction={() => {
                            onTaxUpdated();
                            setIsNoteOpen(false);
                            setNoteEntityId(null);
                        }}
                        initialContext="Tax"
                        initialEntityId={noteEntityId}
                        compactFooter
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

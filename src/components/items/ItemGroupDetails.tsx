
'use client';

import * as React from "react";
import { openPrintDirect } from "@/lib/printDirect";
import type { Item, ItemGroup } from "@/components/items/types";
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
  Users,
  Calendar as CalendarIcon,
  FilePlus,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Scroll,
  DollarSign,
  ChevronDown,
  Columns3,
} from "lucide-react";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { LedgerDesktopFooter } from "@/components/vouchers/LedgerDesktopFooter";
import { LedgerFooterCheckboxPill } from "@/components/vouchers/ledgerFooterChrome";
import { useRowsPerPageSelectControl } from "@/hooks/useRowsPerPageSelect";
import { ROWS_PER_PAGE_OPTIONS_DEFAULT } from "@/lib/rowsPerPageSelect";
import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";
import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";
import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";
import { useLedgerUnapprovedOnlyFilter } from "@/hooks/useLedgerUnapprovedOnlyFilter";
import { LedgerUnapprovedFilterButton } from "@/components/vouchers/LedgerUnapprovedFilterButton";


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
import { formatVoucherEntryTimeLocal } from "@/lib/voucherDateNormalize";
import AdCalendar from "../ui/ad-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import {
  LEDGER_HEADER_PILL_CN,
  LEDGER_HEADER_PILL_ICON_CN,
  LEDGER_HEADER_PILL_ICON_SIZE_CN,
} from "@/lib/ledgerHeaderChrome";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useCompany } from "@/hooks/useCompany";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { MobileDetailSummaryCollapsible } from "@/components/layout/MobileDetailSummaryCollapsible";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import { EditItemGroupDialog } from "./EditItemGroupDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import usePermissions from "@/hooks/usePermissions";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { PartyFilterDropdown } from "@/components/party/PartyFilterDropdown";
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
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "@/components/ui/combobox";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
  DrawerTrigger,
} from "@/components/ui/drawer";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function ItemGroupDetails({
  group,
  allGroups,
  items,
  allItems,
  onGroupUpdated,
  onGroupDeleted,
  onItemUpdated,
  stockView,
  onBack,
  dateRange,
  onDateRangeChange,
  userNames,
  transactions,
}: {
  group: ItemGroup;
  allGroups: ItemGroup[];
  items: Item[];
  allItems: Item[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  onItemUpdated: () => void;
  stockView: "qty" | "amount";
  onBack?: () => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames: Record<string, string>;
  transactions: any[];
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { company, companyId } = useCompany();
  const { processedItems, processedAccounts, processedParties, journalAccountNames } = useVouchers();
  const itemsInGroup = useMemo(() => items.filter((i) => i.groupId === group.id), [items, group.id]);
  const childGroups = useMemo(() => allGroups.filter((g) => (g as any).parentId === group.id), [allGroups, group.id]);
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openingModalRef = useRef(false);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [group.id]);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { showNotes, setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const { balanceMode } = useBalanceMode();
  const { can } = usePermissions();
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<"sale" | "purchase" | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  // Item group page: persist Party column visibility for Columns dropdown show/hide.
  const [showPartyColumn, setShowPartyColumn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem("itemPartyColumnVisible") !== "false";
  });
  const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>(['all']);

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  const {
    openingBalanceForPeriod,
    processedTransactions: allProcessedTransactions,
    periodDr: allPeriodDr,
    periodCr: allPeriodCr,
    closingBalance: allClosingBalance,
  } = useTransactions(
    { ...group, items: items },
    "group",
    dateRange,
    stockView,
    allItems,
    transactions,
    undefined,
    filters,
    undefined,
    undefined,
    userNames
  );

  // Filter parties to show only those with transactions involving items in this group
  const partiesWithTransactions = useMemo(() => {
    if (!items || items.length === 0 || !processedParties || !allProcessedTransactions) return [];
    
    // Get item IDs in this group
    const groupItemIds = new Set(items.map(item => item.id));
    
    // Get unique party IDs that have transactions with items in this group
    const partyIdsWithTransactions = new Set<string>();
    
    allProcessedTransactions.forEach((t: any) => {
      if ((t.type === 'sale' || t.type === 'purchase') && t.partyId) {
        // Check if this transaction involves any item in this group
        const hasGroupItem = t.lineItems?.some((li: any) => groupItemIds.has(li.itemId)) ||
                            t.items?.some((li: any) => groupItemIds.has(li.itemId));
        if (hasGroupItem) {
          partyIdsWithTransactions.add(t.partyId);
        }
      }
    });
    
    // Return only parties that have transactions with items in this group
    return processedParties.filter(party => partyIdsWithTransactions.has(party.id));
  }, [items, processedParties, allProcessedTransactions]);
  // Provide party-id -> party-name map so Item Group "Party" column can resolve names.
  const partyNamesMap = useMemo(
    () => Object.fromEntries((processedParties || []).map((p: any) => [p.id, p.name])),
    [processedParties]
  );
  const mobileSearchNames = useMemo(
    () => ({
      ...partyNamesMap,
      ...journalAccountNames,
      ...Object.fromEntries((processedAccounts || []).map((a: any) => [a.id, a.accountName])),
      ...userNames,
    }),
    [partyNamesMap, journalAccountNames, processedAccounts, userNames]
  );

  // Filter transactions: show Sale, Purchase, and Notes linked to items in this group
  const filteredTransactions = useMemo(() => {
    let transactions = allProcessedTransactions.filter(t =>
      t.type === 'sale' || t.type === 'purchase' || t.type === 'note'
    );

    if (!selectedPartyIds.includes('all') && selectedPartyIds.length > 0) {
      transactions = transactions.filter(t => {
        if (t.type === 'note') return true; // Notes: no party filter, always show
        if (t.type === 'sale' || t.type === 'purchase') {
          return selectedPartyIds.includes(t.partyId);
        }
        return false;
      });
    }
    return transactions;
  }, [allProcessedTransactions, selectedPartyIds]);

  // Recalculate totals for filtered transactions
  const { processedTransactions, periodDr, periodCr, closingBalance } = useMemo(() => {
    const dr = filteredTransactions.reduce((sum, t) => sum + (t.debit || 0), 0);
    const cr = filteredTransactions.reduce((sum, t) => sum + (t.credit || 0), 0);
    const balance = openingBalanceForPeriod + dr - cr;
    return {
      processedTransactions: filteredTransactions,
      periodDr: dr,
      periodCr: cr,
      closingBalance: balance
    };
  }, [filteredTransactions, openingBalanceForPeriod]);
  
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

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v) || (!selectedPartyIds.includes('all') && selectedPartyIds.length > 0);

  const clearFilters = () => {
    onDateRangeChange(undefined);
    setTempDateRange(undefined);
    setFilters({});
    setSelectedPartyIds(['all']);
  };


  const {
    unapprovedOnly,
    toggleUnapprovedOnly,
    filterByUnapprovedOnly,
    onDateRangeChangeWithUnapprovedReset,
  } = useLedgerUnapprovedOnlyFilter({
    onDateRangeChange,
    setCurrentPage,
    setFilters,
    setActiveFilter,
  });

  const anyMobilePopupOpen = isMobile && (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen);

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
    }
  }, [isMobile, modalParam, anyMobilePopupOpen]);

  const handleEditVoucher = (voucher: any) => {
    setSelectedVoucher(voucher);
    openingModalRef.current = true;
    openModalInUrl();
    setIsVoucherDialogOpen(true);
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
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, onBack, closeModalInUrl]);

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

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
          filterByUnapprovedOnly(displayTransactions), sortBy, sortOrder, undefined, company),
        openingBalanceForPeriod
      ),
    [displayTransactions, filterByUnapprovedOnly, sortBy, sortOrder, openingBalanceForPeriod, company]
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
    viewMode: "statement",
    searchFilteredTransactions: sortedTransactions,
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning: openingBalanceForPeriod,
  });
  // Radix rows Select — value list me honi chahiye (LedgerDesktopFooter pagination)
  const { selectValue: rowsPerPageSelectValue, onSelectValueChange: handleRowsPerPageChange } =
    useRowsPerPageSelectControl(rowsPerPage, setRowsPerPage, setCurrentPage, ROWS_PER_PAGE_OPTIONS_DEFAULT, "10");

  const handleOpenNoteDialog = (itemId?: string) => {
    if (items.length === 1) {
      setNoteEntityId(items[0].id);
    } else if (itemId) {
      setNoteEntityId(itemId);
    }
    openingModalRef.current = true;
    openModalInUrl();
    setIsNoteOpen(true);
  };

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) {
      return rowsPerPage > 0 ? `Last ${rowsPerPage} Txns` : "All Txns";
    }
    const from = dateRange.from!;
    const to = dateRange.to || from;
    const fromBS = formatDateBS(from);
    const toBS = to ? formatDateBS(to) : fromBS;
    const fromAD = format(from, "LLL dd, y");
    const toAD = to ? format(to, "LLL dd, y") : fromAD;
    if (dateSystem === "AD") return `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
    if (dateSystem === "BS") return `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
    return `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
  }, [dateRange, dateSystem, formatDateBS, rowsPerPage]);

  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return processedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return processedTransactions.filter((t: any) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "group", group.id, "item").includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [processedTransactions, mobileSearchTerm, formatDate, formatDateBS, mobileSearchNames, group.id]);

  const mobileDisplayTransactions = useMemo(() => {
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

  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(filteredMobileTransactions.length / rowsPerPage) : 1;
    const safeTotal = Math.max(1, total);
    setCurrentPage((prev) => Math.min(Math.max(1, prev), safeTotal));
  }, [dateRange, filteredMobileTransactions.length, rowsPerPage]);

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

  const groupReportOptions = useMemo(
    () => allGroups.map((g) => ({ value: g.id, label: g.name })),
    [allGroups]
  );

  const getOppositeLabel = (t: any) => {
    if (t.type === 'sale' || t.type === 'purchase') {
      return processedParties?.find((p: any) => p.id === t.partyId)?.name || 'N/A';
    }
    return '';
  };

  const MobileTransactionRow = React.memo(({ transaction }: { transaction: any }) => {
    const d = transaction.date?.toDate ? transaction.date.toDate() : (transaction.date ? new Date(transaction.date) : null);
    if (!d) return <Card className="p-2.5"><p className="text-red-500">Invalid date</p></Card>;
    const displayDate = () => {
      switch (dateSystem) {
        case "AD": return formatDate(d);
        case "BS": return formatDateBS(d);
        case "Both": return `${formatDateBS(d)} (${formatDate(d)})`;
        default: return formatDateBS(d);
      }
    };
    const userName = userNames?.[transaction.userId] || "N/A";
    const firstName = userName.split(" ")[0];
    const amount = transaction.debit > 0 ? transaction.debit : transaction.credit;
    const oppositeLabel = getOppositeLabel(transaction);
    return (
      <Card
        className="p-2.5 min-w-0 w-full overflow-hidden bg-card border border-border/80 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => handleEditVoucher(transaction)}
      >
        <div className="flex justify-between items-start gap-2 min-w-0">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="font-bold text-sm truncate">{transaction.voucherNumber}{oppositeLabel ? ` - ${oppositeLabel}` : ''}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{transaction.narration || "No narration"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {displayDate()} • {formatVoucherEntryTimeLocal(transaction as Record<string, unknown>)}
            </p>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-0.5 flex-shrink-0">
            <p className={cn("font-bold text-sm", transaction.debit > 0 ? "text-red-600" : "text-green-600")}>
              {formatCurrency(amount)}
            </p>
            <Badge variant="secondary" className={cn("text-xs font-semibold px-1.5 py-0 whitespace-nowrap", transaction.balance >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
              Bal: {formatCurrency(transaction.balance)}
            </Badge>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">User: {firstName}</p>
          </div>
        </div>
      </Card>
    );
  });
  MobileTransactionRow.displayName = "MobileTransactionRow";

  const handlePrint = () => {
    if (!company) return;
    // Keep item-group print headers aligned with selected table columns.
    const printVisibleColumns = { ...visibleColumns, status: false };
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;

      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS")
        dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else
        dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
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
      title: `Item Group Statement: ${group.name}`,
      context: "group",
      contextId: group.id,
      dateSystem: dateSystem,
      dateRangeText: dateRangeText,
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (group as any).openingBalanceDate,
      openingBalanceNarration: (group as any).openingBalanceNarration ?? null,
      transactions: processedTransactions,
      showNarration: showNarration,
      includeNotes: showNotes,
      visibleColumns: printVisibleColumns,
      userNames: userNames,
    }, true);
  };
  const handlePartyColumnToggle = (checked: boolean) => {
    // Keep Party column preference sticky within the current browser session.
    setShowPartyColumn(checked);
    if (typeof window !== "undefined") sessionStorage.setItem("itemPartyColumnVisible", checked ? "true" : "false");
  };

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden w-full">
          {/* Mobile: scroll + pager above fixed footer */}
          {/* Mobile: date/balance/search — footer chevron se collapse */}
          <MobileDetailSummaryCollapsible>
          <div className="flex flex-col flex-shrink-0 border-b bg-background">
            <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0 bg-background">
              <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
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
            <div className="px-3 py-2 border-b flex items-center justify-between gap-2 flex-shrink-0 bg-background">
              <span className="text-sm font-medium text-muted-foreground flex-1">{closingBalance >= 0 ? "Asset" : "Liability"}</span>
              <span className={cn("text-2xl font-bold", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
              </span>
            </div>
            <div className="p-2 border-b flex items-stretch gap-2 flex-shrink-0 bg-background">
              <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                <Combobox
                  options={groupReportOptions}
                  value={group.id}
                  onChange={(value) => {
                    const g = allGroups.find((gr) => gr.id === value);
                    if (g && value !== group.id) router.push(`/items/group/${value}`);
                  }}
                  placeholder="Select a group"
                />
              </div>
              {group.id !== "ungrouped" && (
                <EditItemGroupDialog group={group} allGroups={allGroups} onGroupUpdated={onGroupUpdated} onGroupDeleted={onGroupDeleted} hasAccounts={itemsInGroup.length > 0 || childGroups.length > 0}>
                  <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditItemGroupDialog>
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
            <div className="w-full min-w-0 px-0.5 space-y-px pb-2">
              {openingBalanceForPeriod !== 0 && (
                <Card className="p-2.5 min-w-0 overflow-hidden bg-card border border-border/80 shadow-sm">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <p className="font-semibold text-muted-foreground text-sm flex-shrink-0">Opening Stock:</p>
                    <Badge variant="secondary" className={cn("font-normal flex-shrink-0 text-xs", openingBalanceForPeriod >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                      {formatCurrency(openingBalanceForPeriod, { showDrCr: true })}
                    </Badge>
                  </div>
                </Card>
              )}
              {mobileDisplayTransactions.map((t: any) => (
                <MobileTransactionRow key={t.id} transaction={t} />
              ))}
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
          <Drawer open={isCalendarOpen} onOpenChange={(open: boolean) => {
            if (open) {
              openingModalRef.current = true;
              openModalInUrl();
            }
            setIsCalendarOpen(open);
            if (!open) closeModalInUrl();
          }}>
            <DrawerTrigger asChild>
              <Button className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium px-1 bg-pink-600 hover:bg-pink-700 text-white">
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="p-4 text-left">
                <DrawerTitle>Select Date Range</DrawerTitle>
                <DrawerDescription>Select a starting and ending date for the transaction list.</DrawerDescription>
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
                  <div className="flex-1 w-full min-w-0">
                    <AdCalendar
                      rangePresetSlot={
                        <DateRangePresetRow
                          country={company?.country}
                          onApply={(r) => {
                            onDateRangeChange(r);
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
                <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
        <Dialog open={isNoteOpen} onOpenChange={(open: boolean) => {
          if (open) {
            openingModalRef.current = true;
            openModalInUrl();
          }
          setIsNoteOpen(open);
          if (!open) closeModalInUrl();
        }}>
          <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
              <DialogTitle>Add a New Note for an Item in {group.name}</DialogTitle>
              <DialogDescription>
                {items.length > 1 ? "Select which item this note applies to." : "Record a new note for this item."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              {items.length > 1 && !noteEntityId && (
                <div className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">Select an item for the note:</p>
                  {items.map((item) => (
                    <Button key={item.id} variant="outline" onClick={() => setNoteEntityId(item.id)}>
                      {item.name}
                    </Button>
                  ))}
                </div>
              )}
              {noteEntityId && (
                <CreateNoteForm
                  onVoucherAction={() => {
                    onItemUpdated();
                    setIsNoteOpen(false);
                    setNoteEntityId(null);
                  }}
                  initialContext="Items"
                  initialEntityId={noteEntityId}
                  showSaveAndApproveOnCreate={can("approve_transactions")}
                  showApproveButton={can("approve_transactions")}
                  compactFooter
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
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
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-slim-dim">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={handleMobileBack} className="flex-shrink-0">
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
                {group.id !== "ungrouped" && (
                  <EditItemGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={itemsInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditItemGroupDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(closingBalance, { showDrCr: true })}
                </div>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <LedgerUnapprovedFilterButton active={unapprovedOnly} onClick={toggleUnapprovedOnly} />
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={(range) => onDateRangeChangeWithUnapprovedReset(range as DateRange | undefined)}
                  transactionDates={transactionDates}
                  className={cn("w-auto", LEDGER_HEADER_PILL_CN)}
                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn("justify-start text-left font-normal px-2 w-auto", LEDGER_HEADER_PILL_CN, !dateRange && "text-muted-foreground")}
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
                <Button variant="ghost" size="icon" onClick={clearFilters} className={cn(LEDGER_HEADER_PILL_ICON_CN, "text-muted-foreground hover:text-foreground")} aria-label="Clear date filter">
                  <XCircle className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
                </Button>
              )}
              {partiesWithTransactions && partiesWithTransactions.length > 0 && (
                <PartyFilterDropdown
                  parties={partiesWithTransactions}
                  selectedPartyIds={selectedPartyIds}
                  onSelectionChange={setSelectedPartyIds}
                />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={cn("w-[200px] justify-between", LEDGER_HEADER_PILL_CN)}>
                    <span className="truncate">Members ({items.length})</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
                  {items.map((p) => (
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenNoteDialog()}
                className={LEDGER_HEADER_PILL_CN}
              >
                <FilePlus className={cn("mr-2", LEDGER_HEADER_PILL_ICON_SIZE_CN)} /> Add Note
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrint} className={LEDGER_HEADER_PILL_ICON_CN}>
                <Printer className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
              </Button>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-4">
            <TransactionsTable
              transactions={paginatedTransactions}
              context="group"
              // Mark this group table as item-group so Party column/header can render.
              groupEntityType="item"
              contextId={group.id}
              showItemPartyColumn={showPartyColumn}
              showNarration={showNarration}
              visibleColumns={{ ...visibleColumns, status: false }}
              openingBalance={desktopPaginationMeta.openingForPage}
              openingBalanceDate={(group as any).openingBalanceDate}
              userNames={userNames}
              // Reuse generic names resolver in table to show party names for item group rows.
              accountNames={partyNamesMap}
              onRowClick={handleEditVoucher}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={desktopPaginationMeta.periodDrForPage}
              periodCr={desktopPaginationMeta.periodCrForPage}
              closingBalance={desktopPaginationMeta.closingForPage}
            
              {...statementCheck.tableProps}/>
            {paginatedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found for the selected period.
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {/* Footer — global PC shell LedgerDesktopFooter */}
        <LedgerDesktopFooter
          left={
            <>
              <LedgerFooterCheckboxPill
                id="show-narration-item-group"
                checked={showNarration}
                onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))}
                label="Show Narration"
              />
              <LedgerFooterColumnsMenu>
                <DropdownMenuContent align="start" className="w-52 p-2">
                  {(["date", "type", "voucherNo", "party", "user", "file", "dr", "cr", "runningBalance", "status"] as Array<TransactionColumnKey | "party">)
                    .filter((key) => key !== "status" || balanceMode === "bill_wise")
                    .map((key) => {
                    if (key === "party") {
                      return (
                        <DropdownMenuItem
                          key="party"
                          onSelect={(e) => e.preventDefault()}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Checkbox
                            id="col-party-item-group"
                            checked={showPartyColumn}
                            onCheckedChange={(c) => handlePartyColumnToggle(Boolean(c))}
                          />
                          <label htmlFor="col-party-item-group" className="text-sm font-medium flex-1 cursor-pointer">
                            Party
                          </label>
                        </DropdownMenuItem>
                      );
                    }
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
                          id={`col-${key}-item-group`}
                          checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                          disabled={isStatusLocked}
                          onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-item-group`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </LedgerFooterColumnsMenu>
              <LedgerFooterCheckboxPill
                id="show-notes-item-group"
                checked={includeNotesInTable}
                disabled={notesPreferenceLockedOnMobile}
                onCheckedChange={(c) => setShowNotes(Boolean(c))}
                label="Note"
              />
              <StatementCheckModeFooterControls
                idPrefix="item-group"
                enabled={statementCheck.checkModeEnabled}
                onEnabledChange={statementCheck.setCheckModeEnabled}
                viewMode={"statement"}
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
          viewMode="statement"
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
          rowsPerPageSelectValue={rowsPerPageSelectValue}
          onRowsPerPageChange={handleRowsPerPageChange}
          includeAllOption={false}
          beforeCount={desktopPaginationMeta.beforeCount}
          afterCount={desktopPaginationMeta.afterCount}
          totalCount={displayTransactions.length}
        />
      </div>
      </div>
      <Dialog open={isNoteOpen} onOpenChange={(open: boolean) => {
        if (open) {
          openingModalRef.current = true;
          openModalInUrl();
        }
        setIsNoteOpen(open);
        if (!open) closeModalInUrl();
      }}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Add a New Note for an Item in {group.name}
            </DialogTitle>
            <DialogDescription>
              {items.length > 1
                ? "Select which item this note applies to."
                : "Record a new note for this item."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {items.length > 1 && !noteEntityId && (
              <div className="flex flex-col gap-2 p-4">
                <p className="font-semibold">Select an item for the note:</p>
                {items.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    onClick={() => setNoteEntityId(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            )}
            {noteEntityId && (
              <CreateNoteForm
                onVoucherAction={() => {
                  onItemUpdated();
                  setIsNoteOpen(false);
                  setNoteEntityId(null);
                }}
                initialContext="Items"
                initialEntityId={noteEntityId}
                showSaveAndApproveOnCreate={can("approve_transactions")}
                showApproveButton={can("approve_transactions")}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={setIsVoucherDialogOpen}
        voucher={selectedVoucher}
        onVoucherUpdated={() => setSelectedVoucher(null)}
      />
    </>
  );
}

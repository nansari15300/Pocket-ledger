
"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { TransactionsTable, type TransactionColumnKey } from "@/components/vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useTransactionVisibleColumns, COLUMN_LABELS, useShowNotes } from "@/components/vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { 
  FilePenLine, 
  Package, 
  Printer, 
  ArrowLeft, 
  Search, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Calendar as CalendarIcon,
  FilePlus,
  Columns3,
  ChevronDown,
  Edit
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item } from "./types";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdCalendar from "@/components/ui/ad-calendar";
import { format, startOfDay } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";
import { openPrintDirect } from "@/lib/printDirect";
import { useCompany } from "@/hooks/useCompany";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogDescription } from "@/components/ui/dialog";
import { CreateNoteForm } from "@/components/vouchers/CreateNoteForm";
import { EditItemDialog } from "./EditItemDialog";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "@/components/ui/combobox";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "@/components/ui/badge";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useTransactions } from "@/hooks/use-transactions";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import usePermissions from "@/hooks/usePermissions";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerFooter, 
  DrawerClose, 
  DrawerTrigger 
} from "@/components/ui/drawer";
import { endOfDay } from "date-fns"; 

const MobileDialogDescription = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

export type StockView = 'qty' | 'amount';

// --- Helper for Unit Conversion ---
const getConversionFactor = (item: Item | undefined, displayUnit: string | undefined): number => {
    if (!item || !displayUnit) return 1;
    
    const conversions = (item.unitConversions || []) as any[];
    if (conversions.length === 0) return 1;

    const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
    
    if (displayUnit === smallestUnit) return 1;

    let factor = 1;
    let currentUnit = displayUnit;
    let attempts = 0;
    
    while (currentUnit !== smallestUnit && currentUnit && attempts < 10) {
        const conv = conversions.find((c: any) => c.fromUnit === currentUnit);
        if (!conv) { return 1; }
        factor *= Number(conv.conversionFactor) || 1;
        currentUnit = conv.toUnit;
        attempts++;
    }
    return factor > 0 ? factor : 1;
};

// --- Helper for formatting Quantity only (No Rs.) ---
const formatQtyValue = (val: number) => {
    return Math.abs(val).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

export default function ItemDetails({
  item: initialItem,
  onItemUpdated,
  onItemDeleted,
  stockView = 'amount',
  setStockView, 
  itemDisplayUnits,
  setItemDisplayUnit,
  onBack,
  userNames,
  onShowAll,
  transactions,
}: {
  item?: Item;
  onItemUpdated: () => void;
  onItemDeleted: (id: string) => void;
  onShowAll?: () => void;
  stockView?: StockView;
  setStockView?: (view: StockView) => void;
  itemDisplayUnits?: Record<string, string>;
  setItemDisplayUnit?: (itemId: string, unit: string) => void;
  onBack?: () => void;
  userNames?: Record<string, string>;
  transactions: any[];
}) {
  const { formatDate, formatDateBS, formatCurrency: formatMoney, dateSystem, formatCurrencyForPrint } = useDate();
  const { company } = useCompany(); 
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const openingModalRef = useRef(false);
  const { processedItems, vouchers, processedAccounts, processedParties, journalAccountNames, userNames: userNamesFromHook } = useVouchers();
  const effectiveUserNames = userNames ?? userNamesFromHook ?? {};
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const { balanceMode } = useBalanceMode();
  const { can } = usePermissions();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [showNarration, setShowNarration] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<"sale" | "purchase" | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  const [isDateChange, setIsDateChange] = useState(false);
  // Item page: persist Party column visibility for Columns dropdown show/hide.
  const [showPartyColumn, setShowPartyColumn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem("itemPartyColumnVisible") !== "false";
  });
  const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>(['all']);

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  // FIX: Robust item merging to ensure unitConversions are never lost
  // Use ref to track previous item to prevent unnecessary recalculations
  const previousItemRef = useRef<Item | undefined>(undefined);
  const currentItem = useMemo(() => {
    if (!initialItem) return undefined;
    const found = processedItems.find(p => p.id === initialItem.id);
    
    if (found) {
        const merged = {
            ...initialItem, 
            ...found,       
            unitConversions: found.unitConversions?.length ? found.unitConversions : (initialItem.unitConversions || []),
            // Explicitly preserve opening stock fields (use found if present, else initialItem)
            openingBalance: (found as any).openingBalance !== undefined ? (found as any).openingBalance : initialItem.openingBalance,
            openingBalanceUnit: (found as any).openingBalanceUnit !== undefined ? (found as any).openingBalanceUnit : (initialItem as any).openingBalanceUnit,
            openingBalanceRate: (found as any).openingBalanceRate !== undefined ? (found as any).openingBalanceRate : (initialItem as any).openingBalanceRate,
            openingBalanceDate: (found as any).openingBalanceDate !== undefined ? (found as any).openingBalanceDate : (initialItem as any).openingBalanceDate
        };
        
        // Only update if the item actually changed (compare relevant fields)
        const prev = previousItemRef.current;
        if (prev && prev.id === merged.id) {
            // Check if relevant fields changed
            const relevantFieldsChanged = 
                prev.name !== merged.name ||
                prev.type !== merged.type ||
                prev.groupId !== merged.groupId ||
                prev.openingBalance !== merged.openingBalance ||
                ((prev as any).openingBalanceRate || 0) !== ((merged as any).openingBalanceRate || 0) ||
                JSON.stringify(prev.unitConversions) !== JSON.stringify(merged.unitConversions);
            
            if (!relevantFieldsChanged) {
                // Return previous item to prevent unnecessary re-renders
                return prev;
            }
        }
        
        previousItemRef.current = merged;
        return merged;
    }
    
    // Only update if initialItem actually changed
    if (previousItemRef.current?.id === initialItem.id) {
        const relevantFieldsChanged = 
            previousItemRef.current.name !== initialItem.name ||
            previousItemRef.current.type !== initialItem.type ||
            previousItemRef.current.groupId !== initialItem.groupId ||
            previousItemRef.current.openingBalance !== initialItem.openingBalance;
        
        if (!relevantFieldsChanged) {
            return previousItemRef.current;
        }
    }
    
    previousItemRef.current = initialItem;
    return initialItem;
  }, [processedItems, initialItem]);

  const mobileSearchNames = useMemo(
    () => ({
      ...journalAccountNames,
      ...effectiveUserNames,
      ...Object.fromEntries((processedAccounts || []).map((a: any) => [a.id, a.accountName])),
      ...Object.fromEntries((processedParties || []).map((p: any) => [p.id, p.name])),
    }),
    [journalAccountNames, effectiveUserNames, processedAccounts, processedParties]
  );

  const {
    processedTransactions: allProcessedTransactions,
    openingBalanceForPeriod,
    periodDr: allPeriodDr,
    periodCr: allPeriodCr,
    closingBalance: allClosingBalance, 
  } = useTransactions(
    currentItem,
    'item',
    dateRange,
    stockView,
    processedItems,
    transactions,
    undefined,
    filters,
    undefined,
    undefined,
    effectiveUserNames
  );

  // Filter parties to show only those with transactions involving the current item
  const partiesWithTransactions = useMemo(() => {
    if (!currentItem || !processedParties || !allProcessedTransactions) return [];
    
    // Get unique party IDs that have transactions with this item
    const partyIdsWithTransactions = new Set<string>();
    
    allProcessedTransactions.forEach((t: any) => {
      if ((t.type === 'sale' || t.type === 'purchase') && t.partyId) {
        // Check if this transaction involves the current item
        const hasItem = t.lineItems?.some((li: any) => li.itemId === currentItem.id) ||
                       t.items?.some((li: any) => li.itemId === currentItem.id);
        if (hasItem) {
          partyIdsWithTransactions.add(t.partyId);
        }
      }
    });
    
    // Return only parties that have transactions with this item
    return processedParties.filter(party => partyIdsWithTransactions.has(party.id));
  }, [currentItem, processedParties, allProcessedTransactions]);

  // Filter transactions: show Sale, Purchase, and Notes linked to this item
  const filteredTransactions = useMemo(() => {
    // Include Sale, Purchase, and Note (notes have no partyId; show all notes for this item)
    let transactions = allProcessedTransactions.filter(t =>
      t.type === 'sale' || t.type === 'purchase' || t.type === 'note'
    );

    // Filter by selected parties when not "all" (notes have no partyId so they stay when party filter is applied)
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
    if (!currentItem) return [];
    const dates = new Set<number>();
    vouchers.forEach((v) => {
        if (v.lineItems?.some((li: any) => li.itemId === currentItem.id)) {
            const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
            if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                dates.add(startOfDay(dateValue).getTime());
            }
        }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [vouchers, currentItem]);

  const unitOptions = useMemo(() => {
      if (!currentItem) return [];
      const units = new Set<string>();
      if ((currentItem as any).openingBalanceUnit) units.add((currentItem as any).openingBalanceUnit);
      if (currentItem.unitConversions) {
          currentItem.unitConversions.forEach((c: any) => {
              if (c.fromUnit) units.add(c.fromUnit);
              if (c.toUnit) units.add(c.toUnit);
          });
      }
      return Array.from(units);
  }, [currentItem]);

  const conversions = (currentItem?.unitConversions || []) as any[];
  const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((currentItem as any).openingBalanceUnit || '');
  const displayUnit = itemDisplayUnits && currentItem ? itemDisplayUnits[currentItem.id] || smallestUnit : smallestUnit;
  
  const isFilterActive = dateRange !== undefined || Object.values(filters).some((v) => v) || (!selectedPartyIds.includes('all') && selectedPartyIds.length > 0);

  const clearFilters = () => {
    setDateRange(undefined);
    setFilters({});
    setSelectedPartyIds(['all']);
  };

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const anyMobilePopupOpen = isMobile && (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen);

  const openModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("modal", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("modal");
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
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, onBack, closeModalInUrl]);

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
  const totalPages = Math.ceil(sortedTransactions.length / rowsPerPage);
  const paginatedTransactions = sortedTransactions.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handlePrint = () => {
    if (!company || !currentItem) return;
    // Keep item print headers aligned with the selected column visibility in table.
    const printVisibleColumns = { ...visibleColumns, status: false };
    
    const printItemPayload = {
        ...currentItem,
        unitConversions: currentItem.unitConversions || [] 
    };

    openPrintDirect({
        company: {
            name: company.name,
            pan: company.pan,
            phone: company.phone,
            address: company.address,
            logoUrl: company.logoUrl,
        },
        dateSystem,
        title: `Item Ledger: ${currentItem?.name}`,
        context: "item",
        contextId: currentItem.id, 
        dateRangeText: dateRange?.from ? `${formatDate(dateRange.from)} - ${dateRange.to ? formatDate(dateRange.to) : ''}` : 'All Time',
        vouchersCount: processedTransactions.length,
        openingBalance: openingBalanceForPeriod,
        openingBalanceDate: (currentItem as any).openingBalanceDate,
        openingBalanceNarration: currentItem.openingBalanceNarration ?? null,
        transactions: processedTransactions,
        showNarration: showNarration,
        includeNotes: includeNotesInTable,
        visibleColumns: printVisibleColumns,
        stockView: stockView,
        displayUnit: displayUnit,
        itemsData: [printItemPayload] 
    }, true);
};
  const handlePartyColumnToggle = (checked: boolean) => {
    // Keep Party column preference sticky within the current browser session.
    setShowPartyColumn(checked);
    if (typeof window !== "undefined") sessionStorage.setItem("itemPartyColumnVisible", checked ? "true" : "false");
  };
  
  const balanceText = useMemo(() => {
    if (closingBalance === 0) return "No Stock";
    return stockView === 'amount' ? (closingBalance >= 0 ? "Asset" : "Liability") : "Available";
  }, [closingBalance, stockView]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) return "Last 10 Txns";
    const from = dateRange.from!;
    const to = dateRange.to || from;
    const fromBS = formatDateBS(from);
    const toBS = to ? formatDateBS(to) : fromBS;
    const fromAD = format(from, "LLL dd, y");
    const toAD = to ? format(to, "LLL dd, y") : fromAD;
    if (dateSystem === "AD") return `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
    if (dateSystem === "BS") return `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
    return `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
  }, [dateRange, dateSystem, formatDateBS]);

  useEffect(() => {
    if (isMobile && dateRange?.from) {
      const from = formatDate(dateRange.from);
      const to = dateRange.to ? formatDate(dateRange.to) : from;
      setMobileSearchTerm(from === to ? from : `${from} to ${to}`);
      setIsDateSearchMode(true);
    }
  }, [dateRange, formatDate, isMobile]);
  
  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!range?.from || (range.from && range.to)) {
      setDateRange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      setDateRange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      setDateRange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
    }
  };
  
  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return sortedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    
    return sortedTransactions.filter((t: any) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, currentItem ? "item" : undefined, currentItem?.id).includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS, mobileSearchNames, currentItem?.id]);

  // Mobile: show last 10 when no date filter (like Party), all when date filter applied
  const mobileDisplayTransactions = useMemo(() => {
    const hasDateFilter = !!dateRange && (dateRange.from != null || dateRange.to != null);
    if (hasDateFilter) return filteredMobileTransactions;
    const list = filteredMobileTransactions;
    if (list.length <= 10) return list;
    return list.slice(-10);
  }, [filteredMobileTransactions, dateRange]);

  const getOppositeLabel = (t: any) => {
    if (t.type === 'sale' || t.type === 'purchase') {
      return processedParties?.find((p: any) => p.id === t.partyId)?.name || 'N/A';
    }
    return '';
  };

  const TransactionRow = React.memo(({ transaction }: { transaction: any }) => {
    const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
    
    const d = transaction.date?.toDate ? transaction.date.toDate() : (transaction.date ? new Date(transaction.date) : null);
    
    if (!d) {
        return <Card className="p-2.5"><p className="text-red-500">Invalid date found</p></Card>;
    }
    
    const displayDate = () => {
        switch (dateSystem) {
            case 'AD': return formatDate(d);
            case 'BS': return formatDateBS(d);
            case 'Both': return `${formatDateBS(d)} (${formatDate(d)})`;
            default: return formatDateBS(d);
        }
    };
    
    const userName = effectiveUserNames?.[transaction.userId] || 'N/A';
    const firstName = userName.split(' ')[0];
    const oppositeLabel = getOppositeLabel(transaction);

    const isUnitView = stockView === 'qty' && currentItem && displayUnit;
    const factor = isUnitView ? getConversionFactor(currentItem, displayUnit) : 1;
    const displayDebit = (transaction.debit || 0) / factor;
    const displayCredit = (transaction.credit || 0) / factor;
    const displayBalance = (transaction.balance || 0) / factor;
    const amount = transaction.debit > 0 ? displayDebit : displayCredit;

    const formatAmount = () => {
      if (isUnitView) return `${formatQtyValue(amount)} ${displayUnit || ''}`;
      return formatMoney(transaction.debit > 0 ? transaction.debit : transaction.credit);
    };
    const formatBalance = () => {
      if (isUnitView) return `${formatQtyValue(Math.abs(displayBalance))} ${displayUnit || ''}`;
      return formatMoney(transaction.balance);
    };

    return (
      <Card className="p-2.5 min-w-0 w-full overflow-hidden bg-card border border-border/80 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => handleEditVoucher(transaction)}>
            <div className="flex justify-between items-start gap-2 min-w-0">
                <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="font-bold text-sm truncate">{transaction.voucherNumber}{oppositeLabel ? ` - ${oppositeLabel}` : ''}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{transaction.narration || "No narration"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{displayDate()} • {format(d, 'p')}</p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-0.5 flex-shrink-0">
                    <p className={cn("font-bold text-sm", transaction.debit > 0 ? "text-red-600" : "text-green-600")}>{formatAmount()}</p>
                    <Badge variant="secondary" className={cn("text-xs font-semibold px-1.5 py-0 whitespace-nowrap", transaction.balance >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>Bal: {formatBalance()}</Badge>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">User: {firstName}</p>
                </div>
            </div>
        </Card>
    );
  });
  TransactionRow.displayName = 'TransactionRow';

  if(!currentItem) return null;
  
  const handleUnitChange = (unit: string) => {
    if (setItemDisplayUnit && currentItem.id) {
        setItemDisplayUnit(currentItem.id, unit);
    }
  };

  const headerStockValue = useMemo(() => {
      const factor = getConversionFactor(currentItem, displayUnit);
      return (closingBalance || 0) / factor;
  }, [closingBalance, currentItem, displayUnit]);

  const mobileDisplayOpeningBalance = useMemo(() => {
      const factor = getConversionFactor(currentItem, displayUnit);
      return (openingBalanceForPeriod || 0) / factor;
  }, [openingBalanceForPeriod, currentItem, displayUnit]);


  const renderMobileView = () => (
    <>
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      {/* Mobile: scroll area extends to footer; inner pb-24 so last row clears fixed footer */}
      <div className="flex flex-col flex-shrink-0 border-b bg-background">
        {/* Row 1: Back | Item Details | Showing x of y vouchers - Party-style */}
        <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0 bg-background">
          {onBack && (
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleMobileBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-base font-bold truncate flex-1 min-w-0">Item Details</h1>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            Showing {mobileDisplayTransactions.length} of {filteredMobileTransactions.length} voucher(s)
          </span>
        </div>
        {/* Row 2: Date range label + X icon - Party-style */}
        <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0 bg-background">
          <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
          {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
            <button
              type="button"
              onClick={() => setDateRange(undefined)}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Clear date filter"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="px-3 py-3 border-b flex items-center justify-between gap-2 flex-shrink-0 bg-background">
            <span className="text-sm font-medium text-muted-foreground flex-1">{balanceText}</span>
            <div className="flex items-center gap-2">
                <span className={cn("text-2xl font-bold", headerStockValue >= 0 ? "text-green-600" : "text-red-600")}>
                    {/* FIX: Use formatQtyValue for Unit View to remove Rs. */}
                    {stockView === 'qty' ? formatQtyValue(headerStockValue) : formatMoney(Math.abs(headerStockValue), { noSuffix: true })}
                </span>
                {stockView === 'qty' && unitOptions.length > 0 && setItemDisplayUnit && (
                   <Select value={displayUnit} onValueChange={handleUnitChange}>
                       <SelectTrigger className="h-8 w-fit gap-1 text-xs bg-muted/50 border border-transparent px-2 focus:ring-1 focus:ring-inset focus:ring-ring focus:ring-offset-0">
                           <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                           {unitOptions.map((u) => (
                               <SelectItem key={u} value={u}>
                                   {u}
                               </SelectItem>
                           ))}
                       </SelectContent>
                   </Select>
               )}
            </div>
        </div>
        <div className="p-2 border-b flex items-stretch gap-2 flex-shrink-0 bg-background">
          <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
            <Combobox
              options={processedItems?.map(p => ({ value: p.id, label: p.name })) ?? []}
              value={currentItem?.id || ""}
              onChange={(value) => {
                  if (value && value !== currentItem.id) {
                      router.push(`/items/${value}`);
                  }
              }}
              placeholder="Select an item"
            />
          </div>
          {currentItem?.id !== "all" && (
            <EditItemDialog
              item={currentItem}
              onItemUpdated={onItemUpdated}
              onItemDeleted={() => onItemDeleted(currentItem!.id)}
              hasTransactions={processedTransactions.length > 0}
            >
              <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                <Edit className="h-4 w-4" />
              </Button>
            </EditItemDialog>
          )}
          <div className="flex-1 min-w-0 h-9 relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
                <Input placeholder="Search transactions" className="pl-8 h-9 text-sm w-full min-w-0" value={mobileSearchTerm} onChange={(e) => setMobileSearchTerm(e.target.value)} />
            </div>
        </div>
      </div>

      {/* Transaction list - extends to footer line */}
      {/* scroll-touch + inline style for APK/WebView touch scroll */}
      <div
        className="flex-1 min-h-0 overflow-auto scroll-touch"
        style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className="w-full min-w-0 px-0.5 space-y-px pb-24">
          {openingBalanceForPeriod !== 0 && (
            <Card className="p-2.5 min-w-0 overflow-hidden bg-card border border-border/80 shadow-sm">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {setStockView && (
                  <Select value={stockView} onValueChange={(v) => setStockView(v as StockView)}>
                    <SelectTrigger className="h-7 w-[90px] text-xs flex-shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qty">Unit</SelectItem>
                      <SelectItem value="amount">Amounts</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <p className="font-semibold text-muted-foreground text-sm flex-shrink-0">Opening Stock:</p>
              </div>
              <Badge variant="secondary" className={cn("font-normal flex-shrink-0 text-xs", mobileDisplayOpeningBalance >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                {stockView === 'qty' ? `${formatQtyValue(mobileDisplayOpeningBalance)} ${displayUnit || ''}` : formatMoney(mobileDisplayOpeningBalance, { showDrCr: true })}
              </Badge>
            </div>
            </Card>
          )}
          {mobileDisplayTransactions.map((t: any) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      </div>
    </div>
    {/* Fixed bottom: New Sale, New Purchase, Calendar - same as Party footer style */}
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
                    <MobileDialogDescription>
                        Select a starting and ending date for the transaction list.
                    </MobileDialogDescription>
                </DrawerHeader>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                    {(dateSystem === 'BS' || dateSystem === 'Both') && (
                       <NepaliCalendar
                          rangePresetSlot={
                            <DateRangePresetRow
                              country={company?.country}
                              onApply={(r) => {
                                setDateRange(r);
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
                    {(dateSystem === 'AD' || dateSystem === 'Both') && (
                      <div className="flex-1 w-full min-w-0">
                        <AdCalendar
                          rangePresetSlot={
                            <DateRangePresetRow
                              country={company?.country}
                              onApply={(r) => {
                                setDateRange(r);
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
                              setDateRange({ from: adDate, to: undefined });
                            } else if (adDate < range.from) {
                              setDateRange({ from: adDate, to: range.from });
                              setIsCalendarOpen(false);
                            } else {
                              setDateRange({ from: range.from, to: adDate });
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
    </>
  );

  const renderDesktopView = () => (
     <div className="h-full flex flex-col">
      {/* Header: Part 1 (name→balance/unit) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
            <div className="p-3 bg-muted rounded-full flex-shrink-0">
              <Package className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 flex-nowrap min-w-0">
              <h1 className="text-xl font-semibold truncate">{currentItem.name}</h1>
              {currentItem.id !== 'all' && (
                <EditItemDialog
                  item={currentItem}
                  onItemUpdated={onItemUpdated}
                  onItemDeleted={() => onItemDeleted(currentItem.id)}
                  hasTransactions={processedTransactions.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                    <FilePenLine className="w-4 h-4" />
                  </Button>
                </EditItemDialog>
              )}
              <span className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", headerStockValue >= 0 ? "text-green-600" : "text-red-600")}>
                {stockView === 'qty' ? formatQtyValue(headerStockValue) : formatMoney(Math.abs(headerStockValue), { noSuffix: true, noAnimation: true })}
              </span>
              {stockView === 'qty' && unitOptions.length > 0 && setItemDisplayUnit && (
                <Select value={displayUnit} onValueChange={handleUnitChange}>
                  <SelectTrigger className="h-8 px-2 w-fit gap-1 text-xs bg-muted/50 border border-transparent flex-shrink-0 focus:ring-1 focus:ring-inset focus:ring-ring focus:ring-offset-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            {(dateSystem === 'BS' || dateSystem === 'Both') && (
              <BsDatePicker
                isRange
                valueAD={dateRange}
                onChangeAD={(range) => setDateRange(range as DateRange)}
                transactionDates={transactionDates}
                className="w-auto"
              />
            )}
            {(dateSystem === 'AD' || dateSystem === 'Both') && (
              <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("justify-start text-left font-normal h-10 px-2 w-auto flex-shrink-0", !dateRange && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")
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
                        setDateRange(next);
                        setIsDesktopCalendarOpen(false);
                      } else {
                        const next = { from: range.from, to: adDate };
                        setTempDateRange(next);
                        setDateRange(next);
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => { openingModalRef.current = true; openModalInUrl(); setIsNoteOpen(true); }}
              className="flex-shrink-0 h-10"
            >
              <FilePlus className="mr-2 h-4 w-4" /> Add Note
            </Button>
            {onShowAll && (
              <Button
                variant="outline"
                size="sm"
                onClick={onShowAll}
                className="flex-shrink-0 h-10"
              >
                All Vouchers
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrint}
              className="flex-shrink-0 h-10 w-10"
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* --- TRANSACTIONS TABLE --- */}
        <ScrollArea className="flex-1">
            <div className="py-4">
                <TransactionsTable
                    transactions={paginatedTransactions}
                    context="item"
                    contextId={currentItem.id}
                    showItemPartyColumn={showPartyColumn}
                    stockView={stockView}
                    item={currentItem}
                    displayUnit={displayUnit}
                    setDisplayUnit={setItemDisplayUnit ? handleUnitChange : undefined}
                    openingBalance={openingBalanceForPeriod}
                    openingBalanceNarration={currentItem.openingBalanceNarration}
                    openingBalanceAttachmentUrls={currentItem.fileUrls}
                    openingBalanceDate={(currentItem as any).openingBalanceDate}
                    periodDr={periodDr}
                    periodCr={periodCr}
                    closingBalance={closingBalance}
                    
                    filters={filters}
                    setFilters={setFilters}
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                    
                    showNarration={showNarration}
                    visibleColumns={{ ...visibleColumns, status: false }}
                    userNames={effectiveUserNames}
                    journalAccountNames={journalAccountNames}
                    accountNames={{}}
                    onRowClick={handleEditVoucher}
                    
                    isDateChange={isDateChange}
                />
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
         {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
         <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
           <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
             <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
               <span className="whitespace-nowrap flex-shrink-0">{displayTransactions.length} transaction(s).</span>
               <div className="flex items-center space-x-2 flex-shrink-0">
                 <Checkbox id="show-narration-item" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                 <label htmlFor="show-narration-item" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                            id="col-party-item"
                            checked={showPartyColumn}
                            onCheckedChange={(c) => handlePartyColumnToggle(Boolean(c))}
                          />
                          <label htmlFor="col-party-item" className="text-sm font-medium flex-1 cursor-pointer">
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
                           id={`col-${key}-item`}
                          checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                           disabled={isStatusLocked}
                           onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                         />
                         <label htmlFor={`col-${key}-item`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                           {COLUMN_LABELS[key]}
                         </label>
                       </DropdownMenuItem>
                     );
                   })}
                 </DropdownMenuContent>
               </DropdownMenu>
               <div className="flex items-center gap-2 flex-shrink-0">
                 <Checkbox id="show-notes-item" checked={includeNotesInTable} disabled={notesPreferenceLockedOnMobile} onCheckedChange={(c) => setShowNotes(Boolean(c))} />
                 <label htmlFor="show-notes-item" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Note</label>
               </div>
             </div>
             <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
               <TransactionTableSortDropdown
                 sortBy={sortBy}
                 sortOrder={sortOrder}
                 onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
                 viewMode="statement"
               />
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

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isMobile ? renderMobileView() : renderDesktopView()}
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
            <DialogTitle>Add a New Note for {initialItem?.name}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this item.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onItemUpdated();
                setIsNoteOpen(false);
              }}
              initialContext={"Items"}
              initialEntityId={initialItem?.id || ''}
              showSaveAndApproveOnCreate={can("approve_transactions")}
              showApproveButton={can("approve_transactions")}
              compactFooter
            />
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
        onVoucherAction={() => setSelectedVoucher(null)}
      />
    </>
  );
}

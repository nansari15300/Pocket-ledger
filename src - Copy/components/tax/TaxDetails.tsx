
"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Tax, TaxGroup } from "@/components/tax/types";
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
  Receipt,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Columns3,
  ChevronDown,
  Search,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { Checkbox } from "../ui/checkbox";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { EditTaxDialog } from "./EditTaxDialog";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { useTransactionVisibleColumns, COLUMN_LABELS } from "../vouchers/transactionColumnVisibility";

const DEFAULT_STATUS_FILTER = { paid: true, unpaid: true, partial: true, overdue: true };
type StatusFilter = { paid: boolean; unpaid: boolean; partial: boolean; overdue: boolean };
const STATUS_FILTER_KEY = "transactionStatusFilterTax";

function filterByStatus(txns: any[], statusFilter: StatusFilter): any[] {
  const anySelected = statusFilter.paid || statusFilter.unpaid || statusFilter.partial || statusFilter.overdue;
  if (!anySelected) return txns;
  return txns.filter((t) => {
    if (statusFilter.paid && t.paymentStatus === "paid") return true;
    if (statusFilter.unpaid && t.paymentStatus === "unpaid") return true;
    if (statusFilter.partial && t.paymentStatus === "partially_paid") return true;
    if (statusFilter.overdue && t.isOverdue) return true;
    return false;
  });
}
import { useBalanceMode } from "@/hooks/useBalanceMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getTaxTransactionAmounts, useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { NotificationBell } from "../vouchers/NotificationBell";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import type { BSDate } from "@/lib/bs-date";

interface TaxDetailsProps {
  tax: Tax;
  allTaxes: Tax[];
  transactions?: any[];
  onTaxUpdated: () => void;
  onTaxDeleted: (id: string) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  onShowAll?: () => void;
  isTaxContext?: boolean;
  userNames?: Record<string, string>;
  journalAccountNames?: Record<string, string>;
  onBack?: () => void;
  context?: string;
}

export function TaxDetails({
  tax: initialTax,
  allTaxes,
  transactions,
  onTaxUpdated,
  onTaxDeleted,
  dateRange,
  onDateRangeChange,
  onShowAll,
  isTaxContext,
  userNames,
  journalAccountNames: journalAccountNamesProp,
  onBack,
  context,
}: TaxDetailsProps) {
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
  const { vouchers, journalAccountNames: journalAccountNamesFromHook } = useVouchers();
  const journalAccountNames = journalAccountNamesProp ?? journalAccountNamesFromHook ?? {};

  const tax = useMemo(() => {
    if (!initialTax) return undefined;
    return allTaxes.find((t) => t.id === initialTax.id) || initialTax;
  }, [allTaxes, initialTax]);

  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [showNarration, setShowNarration] = useState(false);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { balanceMode } = useBalanceMode();
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "sale">(null);
  const openingModalRef = React.useRef(false);

  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_STATUS_FILTER };
    try {
      const saved = sessionStorage.getItem(STATUS_FILTER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<StatusFilter>;
        return {
          paid: parsed.paid ?? DEFAULT_STATUS_FILTER.paid,
          unpaid: parsed.unpaid ?? DEFAULT_STATUS_FILTER.unpaid,
          partial: parsed.partial ?? DEFAULT_STATUS_FILTER.partial,
          overdue: parsed.overdue ?? DEFAULT_STATUS_FILTER.overdue,
        };
      }
    } catch (_) {}
    return { ...DEFAULT_STATUS_FILTER };
  });
  const statusFilterAllChecked = statusFilter.paid && statusFilter.unpaid && statusFilter.partial && statusFilter.overdue;
  const handleStatusFilterAll = () => {
    const next = statusFilterAllChecked ? { paid: false, unpaid: false, partial: false, overdue: false } : { ...DEFAULT_STATUS_FILTER };
    setStatusFilter(next);
    sessionStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(next));
    setCurrentPage(1);
  };

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
  
  const transactionDates = useMemo(() => {
    if (!tax) return [];
    const dates = new Set<number>();
    vouchers.forEach((v) => {
      const isRelevant =
        v.taxAccountId === tax.id ||
        (v.lineItems && v.lineItems.some((line: any) => line.taxAccountId === tax.id)) ||
        (v.type === 'note' && v.context === 'Tax' && v.entityId === tax.id) ||
        (v.type === 'journal' && v.entries?.some((e: any) => e.accountId === tax.id));

      if (isRelevant) {
        const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
          dates.add(startOfDay(dateValue).getTime());
        }
      }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [vouchers, tax]);

  const {
    processedTransactions,
    openingBalanceForPeriod,
    periodDr,
    periodCr,
    closingBalance,
    openingBalanceOutstanding,
    openingBalanceLinkedVoucherNos,
  } = useTransactions(tax, 'tax', dateRange, undefined, allTaxes, transactions, context, filters, undefined, undefined, userNames);

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);

  const clearFilters = () => {
    onDateRangeChange(undefined);
    setFilters({});
  };

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState === "true");
  }, []);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const handleStatusFilterChange = (key: keyof StatusFilter, checked: boolean) => {
    const next = { ...statusFilter, [key]: checked };
    setStatusFilter(next);
    sessionStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(next));
    setCurrentPage(1);
  };
  
  const handleEditVoucher = useCallback((voucher: any) => {
    setSelectedVoucher(voucher);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  }, [openModalInUrl]);

  const statusFilteredTransactions = useMemo(
    () => filterByStatus(processedTransactions, statusFilter),
    [processedTransactions, statusFilter]
  );

  const searchFilteredTransactions = useMemo(() => {
    if (!mobileSearchTerm.trim()) return statusFilteredTransactions;
    const q = mobileSearchTerm.toLowerCase().trim();
    return statusFilteredTransactions.filter((t) => {
      const d = t.date?.toDate ? t.date.toDate() : t.date ? new Date(t.date) : null;
      const dateStr = d ? (dateSystem === "BS" ? formatDateBS(d) : format(d, "yyyy-MM-dd")) : "";
      const timeStr = d ? format(d, "h:mm a") : "";
      const amt = t.debit > 0 ? t.debit : t.credit;
      const bal = t.balance ?? t.runningBalance ?? 0;
      const userStr = (userNames && t.userId && userNames[t.userId]) || "";
      return (
        (t.voucherNumber || "").toLowerCase().includes(q) ||
        (t.type || "").replace(/_/g, " ").toLowerCase().includes(q) ||
        (t.narration || "").toLowerCase().includes(q) ||
        dateStr.toLowerCase().includes(q) ||
        timeStr.toLowerCase().includes(q) ||
        String(amt || 0).toLowerCase().includes(q) ||
        String(t.debit || 0).toLowerCase().includes(q) ||
        String(t.credit || 0).toLowerCase().includes(q) ||
        String(bal).toLowerCase().includes(q) ||
        userStr.toLowerCase().includes(q)
      );
    });
  }, [statusFilteredTransactions, mobileSearchTerm, dateSystem, formatDateBS, format, userNames]);

  const mobileTransactions = useMemo(() => {
    const hasDateFilter = !!dateRange && (dateRange.from != null || dateRange.to != null);
    if (hasDateFilter) return searchFilteredTransactions;
    const list = searchFilteredTransactions;
    if (list.length <= 10) return list;
    return list.slice(-10);
  }, [searchFilteredTransactions, dateRange]);

  const taxDropdownOptions = useMemo(
    () => (allTaxes || []).map((t) => ({ value: t.id, label: t.name })),
    [allTaxes]
  );

  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(searchFilteredTransactions.length / rowsPerPage) : 1;
    if (total >= 1) setCurrentPage(total);
  }, [dateRange, searchFilteredTransactions.length, rowsPerPage]);

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
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, closeModalInUrl, onBack]);
  
  const totalPages = Math.ceil(processedTransactions.length / rowsPerPage);
  const paginatedTransactions = processedTransactions.slice(
      (currentPage - 1) * rowsPerPage,
      currentPage * rowsPerPage
  );
  
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

  const handlePrintStatement = (billWise: boolean = false) => {
    if (!company || !tax) return Promise.resolve();
    return openPrintDirect({
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
      title: `Tax Statement: ${tax.name}`,
      context: "tax",
      contextId: tax.id,
      dateSystem: dateSystem,
      dateRangeText: buildDateRangeText(),
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      transactions: processedTransactions,
      showNarration: showNarration,
      billWise: billWise,
    }, true);
  };

  const handlePrint = () => {
    setTimeout(async () => {
      try {
        await handlePrintStatement(balanceMode === "bill_wise");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
      }
    }, 200);
  };

  if (!tax) {
    return null;
  }

  const dateRangeLabel = buildDateRangeText() || "All Time";
  const balanceLabel = closingBalance >= 0 ? "To Receive" : "To Pay";

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

  if (isMobile) {
    return (
      <>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden pb-24">
          <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={handleMobileBack} className="flex-shrink-0 h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h1 className="text-base font-bold truncate flex-1 min-w-0">Tax Details</h1>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              Showing {mobileTransactions.length} of {searchFilteredTransactions.length} voucher(s)
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
            <p className={cn("text-2xl font-bold text-center", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {balanceLabel} {formatCurrency(Math.abs(closingBalance), { noSuffix: true, noAnimation: true })}
            </p>
          </div>
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              {allTaxes && allTaxes.length > 0 && (
                <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                  <Combobox
                    options={taxDropdownOptions}
                    value={tax.id}
                    onChange={(value) => {
                      if (value && value !== tax.id) router.push(`/tax/${value}`);
                    }}
                    placeholder="Select tax"
                  />
                </div>
              )}
              <EditTaxDialog
                tax={tax}
                allTaxes={allTaxes}
                onTaxUpdated={onTaxUpdated}
                onTaxDeleted={() => onTaxDeleted(tax.id)}
                hasTransactions={processedTransactions.length > 0}
              >
                <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                  <Edit className="h-4 w-4" />
                </Button>
              </EditTaxDialog>
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
          <div className="flex-1 min-h-0 overflow-auto">
            <TransactionsTable
              transactions={mobileTransactions}
              context="tax"
              contextId={tax.id}
              openingBalance={openingBalanceForPeriod}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceActions={undefined}
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              journalAccountNames={journalAccountNames}
              userNames={userNames}
              onRowClick={handleEditVoucher}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={periodDr}
              periodCr={periodCr}
              closingBalance={closingBalance}
              isTaxContext={isTaxContext ?? true}
              scrollOnlyTransactions
              statusFilter={statusFilter}
              statusFilterAllChecked={statusFilterAllChecked}
              onStatusFilterAll={handleStatusFilterAll}
              onStatusFilterChange={handleStatusFilterChange}
              statusFilterIdPrefix="tax"
            />
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          <Button className="flex-1 h-6 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_in"); openModalInUrl(); }}>
            Receive
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_out"); openModalInUrl(); }}>
            Pay
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("sale"); openModalInUrl(); }}>
            New Sale
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
            defaultVoucherData={{ payeeType: "tax", taxAccountId: tax.id }}
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
                  <NepaliCalendar onSelect={handleNepaliSelect} valueAD={dateRange} isRange={true} numberOfMonths={2} />
                )}
                {(dateSystem === "AD" || dateSystem === "Both") && (
                  <div className="flex-1">
                    <Calendar
                      className="p-0 w-full"
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(range) => {
                        onDateRangeChange(range as DateRange | undefined);
                        if (range?.from && range?.to) setIsCalendarOpen(false);
                      }}
                      numberOfMonths={2}
                      modifiers={{ hasTransactions: transactionDates }}
                      modifiersClassNames={{ hasTransactions: "has-transactions" }}
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
        <Dialog
          open={isNoteOpen}
          onOpenChange={(open: boolean) => {
            setIsNoteOpen(open);
            if (!open) closeModalInUrl();
          }}
        >
          <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
              <DialogTitle>Add a New Note for {tax.name}</DialogTitle>
              <DialogDescription>Record a new note associated with this tax.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <CreateNoteForm
                onVoucherAction={() => { onTaxUpdated(); setIsNoteOpen(false); }}
                initialContext="Tax"
                initialEntityId={tax.id}
              />
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
      </>
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
                <AvatarImage src={tax.fileUrl} alt={tax.name} />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <Receipt />
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{tax.name}</h2>
                <EditTaxDialog
                  tax={tax}
                  allTaxes={allTaxes}
                  onTaxUpdated={onTaxUpdated}
                  onTaxDeleted={() => onTaxDeleted(tax.id)}
                  hasTransactions={processedTransactions.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditTaxDialog>
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
                      selected={tempDateRange}
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
                      numberOfMonths={2}
                      modifiers={{ hasTransactions: transactionDates }}
                      modifiersClassNames={{ hasTransactions: 'has-transactions' }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {isFilterActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 flex-shrink-0">
                  <XCircle className="mr-2 h-4 w-4"/>Clear Filters
                </Button>
              )}
              <NotificationBell context="Tax" entityId={tax.id} />
              <Button variant="outline" size="sm" onClick={() => setIsNoteOpen(true)} className="flex-shrink-0 h-10">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              {onShowAll && (
                <Button variant="outline" size="sm" onClick={onShowAll} className="flex-shrink-0 h-10">
                  All Vouchers
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={handlePrint} className="flex-shrink-0 h-10 w-10">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* TABLE AREA - flex layout so table footer (Total / Closing Balance) stays visible */}
        <div className="flex-1 flex flex-col min-h-0 overflow-x-auto">
          <div className="py-4 flex-1 flex flex-col min-h-0 min-w-0">
                <TransactionsTable
                  transactions={paginatedTransactions}
                  context="tax"
                  contextId={tax.id}
                  openingBalance={openingBalanceForPeriod}
                  openingBalanceOutstanding={openingBalanceOutstanding}
                  openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
                  openingBalanceActions={
                    <EditTaxDialog
                      tax={tax}
                      allTaxes={allTaxes}
                      onTaxUpdated={onTaxUpdated}
                      onTaxDeleted={() => onTaxDeleted(tax.id)}
                      hasTransactions={processedTransactions.length > 0}
                    >
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </EditTaxDialog>
                  }
                  showNarration={showNarration}
                  visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
                  periodDr={periodDr}
                  periodCr={periodCr}
                  closingBalance={closingBalance}
                  onRowClick={handleEditVoucher}
                  userNames={userNames}
                  filters={filters}
                  setFilters={setFilters}
                  activeFilter={activeFilter}
                  setActiveFilter={setActiveFilter}
                  isTaxContext={isTaxContext ?? true}
                  scrollOnlyTransactions
                />
            {paginatedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No transactions found for this tax ledger in the selected period.</div>
            )}
          </div>
        </div>
        {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{processedTransactions.length} transaction(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-tax" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-tax" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                  {(Object.keys(COLUMN_LABELS) as TransactionColumnKey[]).map((key) => {
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
                          id={`col-${key}-tax`}
                          checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                          disabled={isStatusLocked}
                          onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-tax`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    );
                  })}
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
      </div>
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for {tax.name}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this tax.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onTaxUpdated();
                setIsNoteOpen(false);
              }}
              initialContext="Tax"
              initialEntityId={tax.id}
            />
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog isOpen={isVoucherDialogOpen} onOpenChange={setIsVoucherDialogOpen} voucher={selectedVoucher} onVoucherCreated={() => setSelectedVoucher(null)} />
    </>
  );
}

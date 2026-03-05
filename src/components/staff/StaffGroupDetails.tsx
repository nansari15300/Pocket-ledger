"use client";

import * as React from "react";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { Button } from "@/components/ui/button";
import { Edit, Printer, Calendar as CalendarIcon, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FilePlus, XCircle, MoreVertical, ArrowLeft, ChevronDown, Columns3, Search } from "lucide-react";
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
import { EditStaffGroupDialog } from "@/components/staff/EditStaffGroupDialog";
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
import { useBalanceMode } from "@/hooks/useBalanceMode";
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

export function StaffGroupDetails({
  group,
  allGroups,
  staff,
  onGroupUpdated,
  onGroupDeleted,
  onStaffUpdated,
  dateRange,
  onDateRangeChange,
  onBack,
  userNames,
}: {
  group: StaffGroup;
  allGroups: StaffGroup[];
  staff: Staff[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  onStaffUpdated: () => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames?: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { company } = useCompany();
  const { processedStaff, processedParties, processedAccounts, processedTaxes, processedExpenseAccounts, journalAccountNames } = useVouchers();
  const { balanceMode, setBalanceMode } = useBalanceMode();
  const staffInGroup = useMemo(() => staff.filter((s) => s.groupId === group.id), [staff, group.id]);
  const childGroups = useMemo(() => allGroups.filter((g) => g.parentId === group.id), [allGroups, group.id]);

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
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "add_salary">(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const openingModalRef = useRef(false);
  const lastDesktopClickRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  let { openingBalanceForPeriod, processedTransactions, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions(
    { ...group, items: staff },
    "group",
    dateRange,
    undefined,
    processedStaff,
    undefined,
    undefined,
    filters,
    undefined,
    undefined,
    userNames
  );

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    processedTransactions.forEach((v: any) => {
      const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
      if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        dates.add(startOfDay(dateValue).getTime());
      }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [processedTransactions]);

  const isFilterActive = dateRange !== undefined || Object.values(filters).some((v) => v);

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

  const handleTransactionOpen = useCallback(
    (voucher: any) => {
      if (isMobile) {
        handleEditVoucher(voucher);
        return;
      }
      const now = Date.now();
      const txKey =
        voucher?.id ||
        `${voucher?.voucherNumber || ""}-${voucher?.type || ""}-${voucher?.date?.seconds || voucher?.date || ""}`;

      if (txKey && lastDesktopClickRef.current.id === txKey && now - lastDesktopClickRef.current.at < 500) {
        lastDesktopClickRef.current = { id: null, at: 0 };
        handleEditVoucher(voucher);
        return;
      }
      lastDesktopClickRef.current = { id: txKey, at: now };
    },
    [isMobile]
  );

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen = isMobile && (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen);

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
    if (!mobileSearchTerm) return processedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return processedTransactions.filter((t: any) => {
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
  }, [processedTransactions, mobileSearchTerm, formatDate, formatDateBS]);

  const mobileTransactionsToShow = useMemo(() => {
    const hasDateFilter = !!dateRange && (dateRange.from != null || dateRange.to != null);
    if (hasDateFilter) return filteredMobileTransactions;
    const list = filteredMobileTransactions;
    if (list.length <= 10) return list;
    return list.slice(-10);
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

  const totalPages = Math.max(1, Math.ceil(processedTransactions.length / rowsPerPage));
  const paginatedTransactions = processedTransactions.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleOpenNoteDialog = (staffId?: string) => {
    if (staff.length === 1) {
      setNoteEntityId(staff[0].id);
    } else if (staffId) {
      setNoteEntityId(staffId);
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

      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    try {
      await openPrintDirect(
        {
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
          title: `Staff Group Statement: ${group.name}`,
          context: "group",
          contextId: group.id,
          dateSystem: dateSystem,
          dateRangeText: dateRangeText,
          vouchersCount: processedTransactions.length,
          openingBalance: openingBalanceForPeriod,
          transactions: processedTransactions,
          showNarration: showNarration,
          userNames: userNames,
        },
        true
      );
    } catch (e) {
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };

  // Staff balance: Cr (Payable) = Red, Dr (Advance) = Green
  const balanceColorClass = closingBalance >= 0 ? "text-green-600" : "text-red-600";

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
            <h1 className="text-base font-bold truncate flex-1 min-w-0">Staff Group Details</h1>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              Showing {mobileTransactionsToShow.length} of {filteredMobileTransactions.length} voucher(s)
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
            <p className={cn("text-2xl font-bold flex justify-center items-baseline gap-px", balanceColorClass)}>
              <span>{formatCurrency(Math.abs(closingBalance), { showDrCr: false })}</span>
              <span className="text-lg">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
            </p>
          </div>
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                <Combobox
                  options={groupDropdownOptions}
                  value={group?.id || ""}
                  onChange={(value) => {
                    if (value && value !== group.id) router.push(`/staff/group/${value}`);
                  }}
                  placeholder="Select group"
                />
              </div>
              <EditStaffGroupDialog
                group={group}
                allGroups={allGroups}
                onGroupUpdated={onGroupUpdated}
                onGroupDeleted={onGroupDeleted}
                hasAccounts={staffInGroup.length > 0 || childGroups.length > 0}
              >
                <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                  <Edit className="h-4 w-4" />
                </Button>
              </EditStaffGroupDialog>
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
              groupEntityType="staff"
              openingBalance={openingBalanceForPeriod}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceActions={undefined}
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              journalAccountNames={journalAccountNames}
              accountNames={accountNamesMap}
              userNames={userNames}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={periodDr}
              periodCr={periodCr}
              closingBalance={closingBalance}
              scrollOnlyTransactions
            />
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          <Button
            type="button"
            className={cn("flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0", balanceMode === "bill_wise" ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "bg-violet-600 hover:bg-violet-700 text-white border-0")}
            onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
          >
            {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
          </Button>
          <Button
            className="flex-1 h-6 min-w-0 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
            onClick={() => {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("payment_in");
              openModalInUrl();
            }}
          >
            Receive
          </Button>
          <Button
            className="flex-1 h-6 min-w-0 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
            onClick={() => {
              openingModalRef.current = true;
              setMobileFooterDialogOpen("payment_out");
              openModalInUrl();
            }}
          >
            Pay
          </Button>
          <Button
            className="flex-1 h-6 min-w-0 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
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
                  <NepaliCalendar onSelect={handleNepaliSelect} valueAD={dateRange} isRange={true} numberOfMonths={calendarMonths} />
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
          defaultTab={mobileFooterDialogOpen ?? "payment_out"}
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
              <DialogTitle>Add a New Note for Staff in {group.name}</DialogTitle>
              <DialogDescription>
                {staff.length > 1 ? "Select which staff this note applies to." : "Record a new note for this staff."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              {staff.length > 1 && !noteEntityId && (
                <div className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">Select staff for the note:</p>
                  {staff.map((s) => (
                    <Button key={s.id} variant="outline" onClick={() => setNoteEntityId(s.id)}>
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}
              {noteEntityId && (
                <CreateNoteForm
                  onVoucherAction={() => {
                    onStaffUpdated();
                    setIsNoteOpen(false);
                    setNoteEntityId(null);
                  }}
                  initialContext="Staff"
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
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <Avatar className="h-12 w-12 text-lg flex-shrink-0">
                <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(group.name)}</AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{group.name}</h2>
                <EditStaffGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={staffInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditStaffGroupDialog>
                <div
                  className={cn(
                    "text-lg font-bold whitespace-nowrap flex-shrink-0 flex items-baseline justify-end gap-px",
                    balanceColorClass
                  )}
                >
                  <span>{formatCurrency(Math.abs(closingBalance), { showDrCr: false })}</span>
                  <span className="text-sm">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={(range) => onDateRangeChange(range as DateRange | undefined)}
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
                      className={cn(
                        "justify-start text-left font-normal h-10 px-2 w-auto flex-shrink-0",
                        !dateRange && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
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
                  <XCircle className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between flex-shrink-0 h-10">
                    <span className="truncate">Members ({staff.length})</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[200px] max-h-60 overflow-y-auto">
                  {staff.map((s) => (
                    <DropdownMenuItem key={s.id} disabled>
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-shrink-0 h-10", balanceMode === "bill_wise" ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "")}
                onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
              >
                {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleOpenNoteDialog()} className="flex-shrink-0 h-10">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrint} className="flex-shrink-0 h-10 w-10">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className={cn("flex-1 flex flex-col min-h-0", balanceMode === "bill_wise" ? "min-w-0" : "overflow-x-auto scrollbar-slim-dim")}>
          <div className="py-4 flex-1 flex flex-col min-h-0 min-w-0">
            <TransactionsTable
              transactions={paginatedTransactions}
              context="group"
              contextId={group.id}
              groupEntityType="staff"
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              openingBalance={openingBalanceForPeriod}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceActions={
                <EditStaffGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={staffInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </EditStaffGroupDialog>
              }
              journalAccountNames={journalAccountNames}
              accountNames={accountNamesMap}
              userNames={userNames}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={periodDr}
              periodCr={periodCr}
              closingBalance={closingBalance}
            />
            {paginatedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No transactions found for the selected period.</div>
            )}
          </div>
        </div>
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{processedTransactions.length} transaction(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox
                  id="show-narration-staff-group"
                  checked={showNarration}
                  onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))}
                />
                <label htmlFor="show-narration-staff-group" className="text-sm font-medium leading-none whitespace-nowrap">
                  Show Narration
                </label>
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
                          id={`col-${key}-staff-group`}
                          checked={isStatusInStatement ? false : isStatusInBillWise ? true : visibleColumns[key] !== false}
                          disabled={isStatusLocked}
                          onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label
                          htmlFor={`col-${key}-staff-group`}
                          className={cn(
                            "text-sm font-medium flex-1",
                            isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                          )}
                        >
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
                <Button variant="outline" className="h-8 w-8 p-0" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-8 w-8 p-0" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-8 w-8 p-0" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-8 w-8 p-0" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
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
            <DialogTitle>Add a New Note for Staff in {group.name}</DialogTitle>
            <DialogDescription>
              {staff.length > 1 ? "Select which staff this note applies to." : "Record a new note for this staff."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {staff.length > 1 && !noteEntityId && (
              <div className="flex flex-col gap-2 p-4">
                <p className="font-semibold">Select staff for the note:</p>
                {staff.map((s) => (
                  <Button key={s.id} variant="outline" onClick={() => setNoteEntityId(s.id)}>
                    {s.name}
                  </Button>
                ))}
              </div>
            )}
            {noteEntityId && (
              <CreateNoteForm
                onVoucherAction={() => {
                  onStaffUpdated();
                  setIsNoteOpen(false);
                  setNoteEntityId(null);
                }}
                initialContext="Staff"
                initialEntityId={noteEntityId}
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

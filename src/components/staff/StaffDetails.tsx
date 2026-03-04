
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
import { EditStaffDialog } from "./EditStaffDialog";
import { EntityAlarmPopup } from "@/components/messages/EntityAlarmPopup";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { HistoryDialog } from "../vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "../vouchers/LinkAdvancesToVoucherDialog";
import { LinkPaymentToTxnsDialog } from "../vouchers/LinkPaymentToTxnsDialog";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { useTransactionVisibleColumns, COLUMN_LABELS } from "../vouchers/transactionColumnVisibility";
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
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";

import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
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
  } = useVouchers();
  const isMobile = useIsMobile();
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
  
  const totalPages = useMemo(() => {
    return rowsPerPage > 0 ? Math.ceil(processedTransactions.length / rowsPerPage) : 1;
  }, [processedTransactions.length, rowsPerPage]);
  
  const paginatedTransactions = useMemo(() => {
    if (rowsPerPage > 0) {
      return processedTransactions.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
      );
    }
    return processedTransactions;
  }, [processedTransactions, currentPage, rowsPerPage]);

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
      transactions: processedTransactions,
      showNarration: showNarration,
      billWise: false,
    }, true);
  };

  const handlePrintBillWise = () => {
    if (!company) return;
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
      transactions: processedTransactions,
      showNarration: showNarration,
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
    if (!mobileSearchTerm) return processedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return processedTransactions.filter(t => {
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
  }, [processedTransactions, mobileSearchTerm, formatDate, formatDateBS]);
  const mobileTransactionsToShow = useMemo(() => {
    const hasDateFilter =
      !!dateRange && (dateRange.from != null || dateRange.to != null);
    if (hasDateFilter) return filteredMobileTransactions;
    const list = filteredMobileTransactions;
    if (list.length <= 10) return list;
    return list.slice(-10);
  }, [filteredMobileTransactions, dateRange]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) {
      return "Last 10 Txns";
    }
    return buildDateRangeText();
  }, [dateRange]);

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

      {/* Row 1: Staff Details | Showing x of y voucher(s) */}
      <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMobileBack}
            className="flex-shrink-0 h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-base font-bold truncate flex-1 min-w-0">
          Staff Details
        </h1>
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
          Showing {mobileTransactionsToShow.length} of{" "}
          {filteredMobileTransactions.length} voucher(s)
        </span>
      </div>
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
      <div className="px-3 py-3 border-b flex-shrink-0">
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
                    router.push(`/staff/${value}`);
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
                if (!e.target.value) {
                  setIsDateSearchMode(false);
                }
              }}
            />
          </div>
        </div>
      </div>
      {/* Transactions list - extends to footer line */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="pb-24">

        <TransactionsTable
          transactions={mobileTransactionsToShow}
          context="staff"
          contextId={staff.id}
          openingBalance={openingBalanceForPeriod}
          openingBalanceOutstanding={openingBalanceOutstanding}
          openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
          openingBalanceActions={undefined}
          showNarration={showNarration}
          visibleColumns={
            balanceMode === "bill_wise"
              ? { ...visibleColumns, status: true }
              : visibleColumns
          }
          journalAccountNames={{}}
          accountNames={accountNamesMap}
          periodDr={periodDr}
          periodCr={periodCr}
          closingBalance={closingBalance}
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
            <div className="flex items-center gap-2 flex-nowrap min-w-0">
              <h2 className="text-xl font-semibold truncate">{staff.name}</h2>
              <EditStaffDialog
                staff={staff}
                allGroups={allGroups}
                onStaffUpdated={onStaffUpdated}
                onStaffDeleted={() => onStaffDeleted(staff.id)}
              >
                <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                  <Edit className="h-4 w-4" />
                </Button>
              </EditStaffDialog>
              <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance < 0 ? "text-red-600" : "text-green-600")}>
                {formatCurrency(closingBalance, { showDrCr: true })}
              </div>
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
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 flex-shrink-0">
                <XCircle className="mr-2 h-4 w-4"/>Clear Filters
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNoteOpen(true)}
              className="flex-shrink-0 h-10"
            >
              <FilePlus className="mr-2 h-4 w-4" />
              Add Note
            </Button>
            {onShowAll && (
              <Button variant="outline" size="sm" onClick={onShowAll} className="flex-shrink-0 h-10">
                All Vouchers
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={handlePrintStatement} className="flex-shrink-0 h-10 w-10">
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
                  openingBalance={openingBalanceForPeriod}
                  openingBalanceOutstanding={openingBalanceOutstanding}
                  openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
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
                  periodDr={periodDr}
                  periodCr={periodCr}
                  closingBalance={closingBalance}
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
            <span className="whitespace-nowrap flex-shrink-0">{processedTransactions.length} transaction(s).</span>
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
                {[15, 30, 50, 100].map((pageSize) => (
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

    
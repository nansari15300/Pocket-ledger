
"use client";

import * as React from "react";
import { openPrintDirect } from "@/lib/printDirect";
import type { Account } from "@/components/bank-cash/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "@/components/ui/card";
import {
  Edit,
  Printer,
  Landmark,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Search,
  Wrench,
  Columns3,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { format, startOfDay, endOfDay, isSameDay } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { EditAccountDialog } from "../bank-cash/EditAccountDialog";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "../ui/input";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { useTransactionVisibleColumns, COLUMN_LABELS } from "../vouchers/transactionColumnVisibility";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Checkbox } from "../ui/checkbox";
import { useTransactions } from "@/hooks/use-transactions";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRouter } from "next/navigation";
import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { calendarPanelClassName } from "@/lib/calendarChrome";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "../ui/badge";
import { useVouchers } from "@/hooks/useVouchers";

interface AccountDetailsProps {
  account: Account;
  onAccountUpdated: (updatedAccount: Partial<Account>) => void;
  onAccountDeleted: (deletedId: string) => void;
  dateRange?: DateRange | undefined;
  onDateRangeChange: React.Dispatch<React.SetStateAction<DateRange | undefined>>;
  onBack?: () => void;
  allAccounts?: any[];
  userNames?: Record<string, string>;
  transactions?: any[];
  journalAccountNames?: Record<string, string>;
  onShowAll?: () => void;
  isAllVouchersView?: boolean;
}

export function AccountDetails({
  account: initialAccount,
  onAccountUpdated,
  onAccountDeleted,
  dateRange,
  onDateRangeChange,
  onBack,
  allAccounts,
  userNames,
  transactions,
  journalAccountNames,
  onShowAll,
  isAllVouchersView
}: AccountDetailsProps) {
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatRunning } =
    useDate();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const { vouchers } = useVouchers();

  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  // Desktop Calendar State
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  
  // Local State for Calendar Buffer
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);

  // Sync tempDateRange when prop changes
  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  const account = useMemo(() => {
    if (!allAccounts) return initialAccount;
    return allAccounts.find(p => p.id === initialAccount.id) || initialAccount;
  }, [allAccounts, initialAccount]);

  // Fix: "All Vouchers" view should still filter to the specific account, not all accounts
  // It should show all transaction types for this account, not all transactions for all accounts
  // Column header filters (Voucher No., User, …) — `useTransactions` mein `filteredByColumn` tabhi chale jab yahan `filters` pass ho
  const { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance } = useTransactions(
    account,
    "account",
    dateRange,
    undefined,
    allAccounts,
    transactions,
    undefined,
    filters,
    undefined,
    journalAccountNames,
    userNames
  );

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    processedTransactions.forEach((v:any) => {
        const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
            dates.add(startOfDay(dateValue).getTime());
        }
    });
    return Array.from(dates).map(d => new Date(d));
  }, [processedTransactions]);

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };


  const handleEditVoucher = (voucher: any) => {
    setSelectedVoucher(voucher);
    setIsVoucherDialogOpen(true);
  };
  

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);

  const clearFilters = () => {
    if(onDateRangeChange) {
      onDateRangeChange(undefined);
    }
    setFilters({});
  };

  const totalPages =
    rowsPerPage > 0 ? Math.ceil(processedTransactions.length / rowsPerPage) : 1;
  const paginatedTransactions =
    rowsPerPage > 0
      ? processedTransactions.slice(
          (currentPage - 1) * rowsPerPage,
          currentPage * rowsPerPage
        )
      : processedTransactions;

  const buildDateRangeText = () => {
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;

      if (dateSystem === "AD")
        dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS")
        dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else
        dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    return dateRangeText;
  };

  const handlePrintStatement = () => {
    if (!company) return;
    // Keep print columns aligned with visible table columns.
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
      title: `Account Statement: ${account.accountName}`,
      context: "account",
      contextId: account.id,
      dateSystem: dateSystem,
      dateRangeText: buildDateRangeText(),
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (account as any).openingBalanceDate,
      openingBalanceNarration: (account as any).openingBalanceNarration ?? null,
      transactions: processedTransactions,
      showNarration: showNarration,
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
      title: `Bill Wise Account Statement: ${account.accountName}`,
      context: "account",
      contextId: account.id,
      dateSystem: dateSystem,
      dateRangeText: buildDateRangeText(),
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (account as any).openingBalanceDate,
      openingBalanceNarration: (account as any).openingBalanceNarration ?? null,
      transactions: processedTransactions,
      showNarration: showNarration,
      visibleColumns: printVisibleColumns,
      userNames: userNames,
      billWise: true,
    }, true);
  };
  
  const balanceText = useMemo(() => {
    if (closingBalance === 0) return "Settled Up";
    return closingBalance >= 0 ? "Receivable" : "Payable";
  }, [closingBalance]);
  
  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!onDateRangeChange) return;
    if (!range?.from || (range.from && range.to)) {
      if (onDateRangeChange) onDateRangeChange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      if (onDateRangeChange) onDateRangeChange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      if (onDateRangeChange) onDateRangeChange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
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


  const TransactionRow = React.memo(({ transaction }: { transaction: any }) => {
    const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
    
    const d = transaction.date?.toDate ? transaction.date.toDate() : (transaction.date ? new Date(transaction.date) : null);
    
    if (!d) {
        return <Card className="p-2 m-2 mb-0"><p className="text-red-500">Invalid date found</p></Card>;
    }
    
    const displayDate = () => {
        switch (dateSystem) {
            case 'AD': return formatDate(d);
            case 'BS': return formatDateBS(d);
            case 'Both': return `${formatDateBS(d)} (${formatDate(d)})`;
            default: return formatDateBS(d);
        }
    };
    
    return (
      <Card className="p-2 m-2 mb-0 rounded-lg shadow-sm border overflow-hidden" onClick={() => handleEditVoucher(transaction)}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-xs">{transaction.voucherNumber} - {transaction.type ? transaction.type.replace(/_/g, ' ') : 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">{transaction.narration || "No narration"}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                      <p className={cn("font-bold text-sm whitespace-nowrap", transaction.debit > 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(transaction.debit > 0 ? transaction.debit : transaction.credit)}</p>
                      <div className="flex flex-col items-end">
                          <Badge variant="secondary" className={cn("font-normal text-xs px-1.5 py-0.5", transaction.balance >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>Bal: {formatCurrency(transaction.balance)}</Badge>
                          <p className="text-xs text-muted-foreground font-medium mt-1">User: {userNames?.[transaction.userId] || 'N/A'}</p>
                      </div>
                </div>
            </div>
            <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-muted-foreground">{displayDate()} • {format(d, 'p')}</p>
            </div>
        </Card>
    );
  });
  TransactionRow.displayName = 'TransactionRow';


  const renderMobileView = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      {/* Mobile: scroll area extends to footer; inner pb-24 so last row clears fixed footer */}
      <div className="p-2 border-b sticky top-0 bg-background z-10 space-y-3 flex-shrink-0">
        <div className="bg-card p-3 rounded-lg flex items-center justify-between gap-2">
            {onBack && (
              <Button variant="ghost" size="icon" className="mr-2" onClick={onBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <span className="text-sm font-medium text-muted-foreground flex-1">{balanceText}</span>
            <span className={cn("text-2xl font-bold", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
            </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Combobox
              options={allAccounts?.map(p => ({ value: p.id, label: p.accountName })) ?? []}
              value={account?.id || ""}
              onChange={(value) => {
                  if (value && value !== account.id) {
                      router.push(`/bank-cash/${value}`);
                  }
              }}
              placeholder="Select an account"
            />
          </div>
           <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="search transactions" className="pl-9 w-full" value={mobileSearchTerm} onChange={(e) => setMobileSearchTerm(e.target.value)} />
            </div>
        </div>
      </div>
      
      {openingBalanceForPeriod !== 0 && (
        <div className="bg-muted/30 p-3 m-4 rounded-lg">
            <div className="flex justify-between items-center text-sm">
                <p className="font-semibold text-muted-foreground">Opening Balance</p>
                <Badge variant="secondary" className={cn("font-normal", openingBalanceForPeriod >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                    {formatCurrency(openingBalanceForPeriod, { showDrCr: true })}
                </Badge>
            </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="pb-24">
        {filteredMobileTransactions.map((t: any) => (
            <TransactionRow key={t.id} transaction={t} />
        ))}
        </div>
      </ScrollArea>
      
        <div className="fixed bottom-0 left-0 right-0 p-2 border-t bg-background/80 backdrop-blur-sm z-50 flex items-center justify-around gap-2">
             <AddVoucherDialog defaultTab="payment_in"><Button className="flex-1 bg-green-500 hover:bg-green-600 h-12 rounded-lg">Receive</Button></AddVoucherDialog>
             <AddVoucherDialog defaultTab="payment_out"><Button className="flex-1 bg-red-500 hover:bg-red-600 h-12 rounded-lg">Pay</Button></AddVoucherDialog>
             <AddVoucherDialog defaultTab="contra"><Button className="flex-1 bg-blue-500 hover:bg-blue-600 h-12 rounded-lg">Contra</Button></AddVoucherDialog>
            <Drawer open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-lg"><CalendarIcon /></Button>
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
                    {(dateSystem === 'AD' || dateSystem === 'Both') && (
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
                            classNames={{ table: "w-full" }}
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={asCalendarRange(dateRange)}
                            onSelect={(range) => {
                              if (onDateRangeChange) onDateRangeChange(range as DateRange | undefined);
                              if (range?.from && range.to) setIsCalendarOpen(false);
                            }}
                            numberOfMonths={calendarMonths}
                          />
                        </div>
                      </div>
                    )}
                 </div>
                 <DrawerFooter className="p-4 pt-2">
                    <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
        </div>
    </div>
  );

  const renderDesktopView = () => {
    // Exclude Contra and Journal from "Under Development" - they should show all transactions
    const isContraAllView = isAllVouchersView && account.id === 'all' && account.accountName?.includes('Contra');
    const isJournalAllView = isAllVouchersView && account.id === 'all' && (account.accountName?.includes('Journal') || account.accountType === 'journal_view');
    // Show "Under Development" only if it's all vouchers view AND it's NOT contra all view AND it's NOT journal all view
    if (isAllVouchersView && !isContraAllView && !isJournalAllView && (account.accountType === "journal_view" || account.id === 'all')) {
        return (
            <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center p-8">
                     <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold">Under Development</h3>
                    <p className="text-muted-foreground mt-2">
                        This aggregated view for all {account.accountName.replace(' Vouchers', '')} transactions is currently being built.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
     <div className="h-full flex flex-col">
        {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
              <Avatar className="h-12 w-12 text-lg flex-shrink-0">
                <AvatarImage src={account.fileUrl} alt={account.accountName} />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <Landmark className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{account.accountName}</h2>
                {account.id !== 'all' && (
                  <EditAccountDialog
                    account={account}
                    allAccounts={allAccounts}
                    onAccountUpdated={onAccountUpdated}
                    onAccountDeleted={onAccountDeleted}
                    hasTransactions={processedTransactions.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditAccountDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(closingBalance, { showDrCr: true })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={onDateRangeChange}
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
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 flex-shrink-0">
                  <XCircle className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsNoteOpen(true)} className="flex-shrink-0 h-10">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
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

        {/* TABLE AREA */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <TransactionsTable
              transactions={paginatedTransactions}
              context="account"
              contextId={account.id}
              openingBalance={openingBalanceForPeriod}
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              userNames={userNames}
              onRowClick={handleEditVoucher}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={periodDr}
              periodCr={periodCr}
              closingBalance={closingBalance}
            />
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{processedTransactions.length} transaction(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-account" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-account" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                  {(Object.keys(COLUMN_LABELS) as TransactionColumnKey[]).map((key) => (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`col-${key}-account-ledger`}
                        checked={visibleColumns[key] !== false}
                        onCheckedChange={(c) => handleColumnVisibilityChange(key, Boolean(c))}
                      />
                      <label htmlFor={`col-${key}-account-ledger`} className="text-sm font-medium cursor-pointer flex-1">
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
  }

  return (
    <>
      <div className="h-full">
        {isMobile ? renderMobileView() : renderDesktopView()}
      </div>
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for {account.accountName}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onAccountUpdated(account);
                setIsNoteOpen(false);
              }}
              initialContext="Bank/Cash"
              initialEntityId={account.id}
              compactFooter
            />
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


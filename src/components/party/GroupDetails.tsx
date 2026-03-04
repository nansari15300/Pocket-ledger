
"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Party, Group } from "@/components/party/types";
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
  Users,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Scroll,
  DollarSign,
  ChevronDown,
  Columns3,
  Filter,
  Search,
} from "lucide-react";
import { TransactionsTable, type VisibleColumns, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, format } from "date-fns";
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
import { useBalanceMode } from "@/hooks/useBalanceMode";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { EditGroupDialog } from "./EditGroupDialog";
import { PartyFilterDropdown } from "./PartyFilterDropdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { HistoryDialog } from "../vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "../vouchers/LinkAdvancesToVoucherDialog";
import { LinkPaymentToTxnsDialog } from "../vouchers/LinkPaymentToTxnsDialog";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { Input } from "../ui/input";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";

import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "../ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { doc, getDoc, updateDoc, query, collection, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { StaffGroupDetails } from "../staff/StaffGroupDetails";
import type { StaffGroup, Staff } from "../staff/types";
import { AccountGroupDetails } from "../bank-cash/AccountGroupDetails";
import type { AccountGroup, Account } from "../bank-cash/types";
import { TaxGroupDetails } from "../tax/TaxGroupDetails";
import type { TaxGroup, Tax } from "../tax/types";
import { ExpenseGroupDetails } from "../expenses/ExpenseGroupDetails";
import type { ExpenseGroup, ExpenseAccount } from "../expenses/types";
import { ItemGroupDetails } from "../items/ItemGroupDetails";
import type { ItemGroup, Item } from "../items/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
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

const COLUMN_VISIBILITY_KEY = "transactionVisibleColumns";
const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  date: true,
  type: true,
  voucherNo: true,
  user: true,
  file: true,
  dr: true,
  cr: true,
  status: true,
  runningBalance: true,
};
const COLUMN_LABELS: Record<TransactionColumnKey, string> = {
  date: "Date",
  type: "Type",
  voucherNo: "Voucher No.",
  user: "User",
  file: "File",
  dr: "Dr",
  cr: "Cr",
  status: "Status",
  runningBalance: "Running Balance",
};

const DEFAULT_STATUS_FILTER = { paid: true, unpaid: true, partial: true, overdue: true };
type StatusFilter = { paid: boolean; unpaid: boolean; partial: boolean; overdue: boolean };
const STATUS_FILTER_KEY = "transactionStatusFilter";

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

export function GroupDetails({
  group,
  allGroups,
  allParties,
  onGroupUpdated,
  onGroupDeleted,
  onPartyUpdated,
  dateRange,
  onDateRangeChange,
  userNames,
  onBack,
}: {
  group: Group;
  allGroups: Group[];
  allParties: Party[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  onPartyUpdated: () => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { balanceMode, setBalanceMode } = useBalanceMode();
  const { company, companyId } = useCompany();
  const { can } = usePermissions();
  const { vouchers, processedParties, processedAccounts, processedExpenseAccounts, processedAccountGroups, processedExpenseGroups, processedTaxGroups, processedStaffGroups, processedTaxes, processedStaff, processedItems, processedItemGroups, journalAccountNames } = useVouchers();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
    openingModalRef.current = true;

    setSelectedVoucher(voucher);
    setIsVoucherDialogOpen(true);
  };

  const handleHistoryVoucher = (voucher: any) => {
    openingModalRef.current = true;

    setSelectedVoucher(voucher);
    setIsVoucherDialogOpen(true);
  };

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen = isMobile && (
    !!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen || !!historyVoucher || !!linkAdvancesVoucher || !!linkPaymentVoucher
  );
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
        {/* Mobile: scroll area extends to footer; inner pb-24 so last row clears fixed footer */}

        <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={handleMobileBack} className="flex-shrink-0 h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-base font-bold truncate flex-1 min-w-0">Party Group Details</h1>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            Showing {mobileTransactionsToShow.length} of {filteredMobileTransactions.length} voucher(s)
          </span>
        </div>
        <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-medium text-muted-foreground">{!dateRange || (dateRange.from == null && dateRange.to == null) ? "Last 10 Txns" : dateRangeLabel}</span>
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
            {balanceText} {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
          </p>
          {pendingApprovalCount > 0 && !isMobile && (

            <p className="text-center mt-2">
              <span className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-pink-200 dark:border-pink-800 text-sm font-medium bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-200 min-w-[8rem]">
                {pendingApprovalCount} pending approval
              </span>
            </p>
          )}
        </div>
        {/* Group dropdown + Edit icon + Search - same size as Party Details (equal width & height, edit h-9 w-8) */}
        <div className="p-2 border-b flex-shrink-0">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
              <Combobox
                options={groupDropdownOptions}
                value={group?.id || ""}
                onChange={(value) => {
                  if (value && value !== group.id) router.push(`/party/group/${value}`);
                }}
                placeholder="Select group"
              />
            </div>
            {group.id !== "ungrouped" && (
              <EditGroupDialog group={group} allGroups={allGroups} onGroupUpdated={onGroupUpdated} onGroupDeleted={onGroupDeleted} hasAccounts={partiesInGroup.length > 0 || childGroups.length > 0}>
                <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                  <Edit className="h-4 w-4" />
                </Button>
              </EditGroupDialog>
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
        <div className="flex-1 min-h-0 overflow-auto">
          </div>

        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
        <Button
          type="button"
          className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0 bg-orange-600 hover:bg-orange-700 text-white border-0"
          onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
        >
          {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
        </Button>
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
    </>
  );

  const renderDesktopView = () => (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          {/* Part 1: account name through balance — single line, no wrap */}
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
              {group.id !== "ungrouped" && (
                <EditGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={partiesInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditGroupDialog>
              )}
              <div
                className={cn(
                  "text-lg font-bold whitespace-nowrap flex-shrink-0",
                  closingBalance >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {formatCurrency(closingBalance, { showDrCr: true })}
              </div>
              {pendingApprovalCount > 0 && !isMobile && (

                <span className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-pink-200 dark:border-pink-800 text-sm font-medium bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-200 min-w-[8rem] flex-shrink-0">
                  {pendingApprovalCount} pending approval
                </span>
              )}
            </div>
          </div>
          {/* Part 2: date range, Add Note, print — single line, no wrap; on small screens this row is below */}
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            {(dateSystem === "BS" || dateSystem === "Both") && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={(range) =>
                    onDateRangeChange(range as DateRange | undefined)
                  }
                  transactionDates={transactionDates}
                  className="w-auto"
                />
                {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDateRangeChange(undefined)} aria-label="Clear date filter">
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            {(dateSystem === "AD" || dateSystem === "Both") && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Popover
                  open={isDesktopCalendarOpen}
                  onOpenChange={setIsDesktopCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                        "justify-start text-left font-normal h-10 px-2 w-auto",
                        !dateRange && "text-muted-foreground"
                      )}
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
                {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDateRangeChange(undefined)} aria-label="Clear date filter">
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            {isFilterActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-10 flex-shrink-0"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[200px] justify-between flex-shrink-0 h-10"
                >
                  <span className="truncate">Members ({partiesInGroup.length})</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px] max-h-60 overflow-y-auto">
                {partiesInGroup.map((p) => (
                  <DropdownMenuItem key={p.id} disabled>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
              className="flex-shrink-0 h-10"
            >
              {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenNoteDialog()}
              className="flex-shrink-0 h-10"
            >
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
            showNarration={showNarration}
            visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
            openingBalance={openingBalanceForPeriod}
            openingBalanceOutstanding={openingBalanceOutstanding}
            openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
            openingBalanceActions={
              group.id !== "ungrouped" ? (
                <EditGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={partiesInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </EditGroupDialog>
              ) : null
            }
            userNames={mergedUserNames}
            onRowClick={handleEditVoucher}
            onDeleteVoucher={handleDeleteVoucher}
            onHistoryVoucher={handleHistoryVoucher}
            onAddLink={handleAddLink}
            filters={filters}
            setFilters={setFilters}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            periodDr={periodDr}
            periodCr={periodCr}
            closingBalance={closingBalance}
            scrollOnlyTransactions
            statusFilter={statusFilter}
            statusFilterAllChecked={statusFilterAllChecked}
            onStatusFilterAll={handleStatusFilterAll}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterIdPrefix="group"
          />
          {paginatedTransactions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No transactions found for the selected period.
            </div>
          )}
        </div>
      </div>
      {/* Footer: Part 1 (count, narration, columns) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
            <span className="whitespace-nowrap flex-shrink-0">{statusFilteredTransactions.length} transaction(s).</span>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <Checkbox id="show-narration-party-group" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
              <label htmlFor="show-narration-party-group" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                        id={`col-${key}-group`}
                        checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                        disabled={isStatusLocked}
                        onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                      />
                      <label htmlFor={`col-${key}-group`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
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

  // For staff groups, use the reusable StaffGroupDetails component
  if (groupType === 'staff') {
    const staffInGroup = accountsInGroup as Staff[]; // accountsInGroup contains staff for staff groups
    const staffGroup = group as unknown as StaffGroup;
    return (
      <StaffGroupDetails
        group={staffGroup}
        allGroups={processedStaffGroups as StaffGroup[]}
        staff={staffInGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onStaffUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For account groups (bank/cash), use the reusable AccountGroupDetails component
  if (groupType === 'account') {
    const accountsInAccountGroup = accountsInGroup as Account[]; // accountsInGroup contains accounts for account groups
    const accountGroup = group as unknown as AccountGroup;
    return (
      <AccountGroupDetails
        group={accountGroup}
        allGroups={processedAccountGroups as AccountGroup[]}
        accounts={accountsInAccountGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onAccountUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For tax groups, use the reusable TaxGroupDetails component
  if (groupType === 'tax') {
    const taxesInGroup = accountsInGroup as Tax[]; // accountsInGroup contains taxes for tax groups
    const taxGroup = group as unknown as TaxGroup;
    return (
      <TaxGroupDetails
        group={taxGroup}
        allGroups={processedTaxGroups as TaxGroup[]}
        taxes={taxesInGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onTaxUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For expense groups, use the reusable ExpenseGroupDetails component
  if (groupType === 'expense') {
    const expenseAccountsInGroup = accountsInGroup as ExpenseAccount[]; // accountsInGroup contains expense accounts for expense groups
    const expenseGroup = group as unknown as ExpenseGroup;
    return (
      <ExpenseGroupDetails
        group={expenseGroup}
        allGroups={processedExpenseGroups as ExpenseGroup[]}
        accounts={expenseAccountsInGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onAccountUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For item groups, use the reusable ItemGroupDetails component
  if (groupType === 'item') {
    const itemsInGroup = accountsInGroup as Item[]; // accountsInGroup contains items for item groups
    const itemGroup = group as unknown as ItemGroup;
    return (
      <ItemGroupDetails
        group={itemGroup}
        allGroups={processedItemGroups as ItemGroup[]}
        items={itemsInGroup}
        allItems={processedItems}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onItemUpdated={onPartyUpdated}
        stockView="amount"
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
        transactions={vouchers}
      />
    );
  }

  return (
    <>
      <div className={cn("h-full min-h-0", isMobile && "flex flex-col")}>
        {isMobile ? renderMobileView() : renderDesktopView()}
      </div>
      <Dialog
        open={isNoteOpen}
        onOpenChange={(open: boolean) => {
          setIsNoteOpen(open);
          if (!open && isMobile) closeModalInUrl();
        }}
      >
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for a Party in {group.name}</DialogTitle>
            <DialogDescription>
              {partiesInGroup.length > 1
                ? "Select which party this note applies to."
                : "Record a new note for this party."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {partiesInGroup.length > 1 && !noteEntityId && (
              <div className="flex flex-col gap-2 p-4">
                <p className="font-semibold">Select a party for the note:</p>
                {partiesInGroup.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    onClick={() => setNoteEntityId(p.id)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            )}
            {noteEntityId && (
              <CreateNoteForm
                onVoucherAction={() => {
                  onPartyUpdated();
                  setIsNoteOpen(false);
                  setNoteEntityId(null);
                }}
                initialContext="Party"
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
            if (isMobile) closeModalInUrl();
          } else {
            setIsVoucherDialogOpen(open);
          }
        }}
        voucher={selectedVoucher}
        onVoucherAction={() => setSelectedVoucher(null)}
      />
      <HistoryDialog
        voucher={historyVoucher}
        isOpen={!!historyVoucher}
        onOpenChange={(open: boolean) => !open && setHistoryVoucher(null)}

        onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)}
      />
      {linkAdvancesVoucher && (
        <LinkAdvancesToVoucherDialog
          isOpen={!!linkAdvancesVoucher}
          onOpenChange={(open: boolean) => !open && setLinkAdvancesVoucher(null)}

          mode={linkAdvancesVoucher.type === "purchase" || linkAdvancesVoucher.type === "purchase_service" ? "purchase" : "sale"}
          targetVoucherId={linkAdvancesVoucher.id}
          targetPartyId={linkAdvancesVoucher.partyId ?? ""}
          targetPartyName={allParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.name ?? "Party"}
          partyOpeningBalance={allParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.openingBalance ?? 0}
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
          partyName={allParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.name ?? "Party"}
          receivedAmount={Number(linkPaymentVoucher.amount ?? linkPaymentVoucher.total ?? 0)}
          existingAllocations={Array.isArray(linkPaymentVoucher.allocations) ? linkPaymentVoucher.allocations : []}
          paymentInId={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
          paymentOutId={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
          paymentInVoucherNumber={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
          paymentInDate={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
          paymentOutVoucherNumber={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
          paymentOutDate={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
          partyOpeningBalance={allParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.openingBalance ?? 0}
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

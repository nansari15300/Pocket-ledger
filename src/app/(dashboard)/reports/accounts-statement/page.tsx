"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import { AccountGroupDetails } from "@/components/bank-cash/AccountGroupDetails";
import { PayeeDetails } from "@/components/payee/PayeeDetails";
import { GroupDetails } from "@/components/party/GroupDetails";
import { StaffGroupDetails } from "@/components/staff/StaffGroupDetails";
import { TaxDetails } from "@/components/tax/TaxDetails";
import { TaxGroupDetails } from "@/components/tax/TaxGroupDetails";
import { ExpenseGroupDetails } from "@/components/expenses/ExpenseGroupDetails";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import type { Party, Group } from "@/components/party/types";
import type { Staff } from "@/components/staff/types";
import type { Tax } from "@/components/tax/types";
import type { ExpenseAccount } from "@/components/expenses/types";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";

import { format } from "date-fns";
import { doc, getDoc, query, collection, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Landmark, Users, Crown, Building2, UserCheck, Receipt, TrendingUp, Briefcase, X, ArrowLeft, Calendar as CalendarIcon, File, Printer, Share2, BarChart2 } from "lucide-react";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useReportPage } from "@/contexts/ReportPageContext";
import { useTransactions } from "@/hooks/use-transactions";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect } from "@/lib/printDirect";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Calendar } from "@/components/ui/calendar";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";
import * as XLSX from "xlsx";
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import { Combobox } from "@/components/ui/combobox";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

type UnifiedAccount = {
  id: string;
  name: string;
  balance: number;
  debit: number;
  credit: number;
  accountType: 'party' | 'staff' | 'tax' | 'expense' | 'bank';
  parentId?: string;
  groupId?: string;
  entity?: Party | Staff | Tax | ExpenseAccount | Account;
};

type UnifiedGroup = {
  id: string;
  name: string;
  balance: number;
  debit: number;
  credit: number;
  groupType: 'party' | 'staff' | 'tax' | 'expense' | 'bank';
  parentId?: string;
  entity?: Group | AccountGroup | any;
};

type AccountTreeItem = {
  id: string;
  name: string;
  balance: number;
  debit: number;
  credit: number;
  type: 'group' | 'account';
  parentId?: string;
  level: number;
  children?: AccountTreeItem[];
  account?: UnifiedAccount;
  group?: UnifiedGroup;
};

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

const ReportSummaryCard = React.memo(function ReportSummaryCard({
  title,
  amount,
  color,
}: {
  title: string;
  amount: number;
  color: string;
}) {
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const formatted = formatCurrency(amount, { showDrCr: title === "Balance" });
  const titleStr = formatCurrencyForPrint(amount, { showDrCr: title === "Balance" });
  return (
    <div className="px-2 py-1.5 w-fit flex-shrink-0 border rounded-lg overflow-hidden bg-card">
      <div className="flex flex-col">
        <p className="text-xs text-muted-foreground whitespace-nowrap">{title}</p>
        <p className={cn("text-sm sm:text-base font-bold whitespace-nowrap tabular-nums", color)} title={titleStr}>
          {formatted}
        </p>
      </div>
    </div>
  );
}, (prev, next) => prev.title === next.title && prev.amount === next.amount && prev.color === next.color);

type AccountsStatementPageProps = {
  onPartySelectionChange?: (isParty: boolean) => void;
  /** 'account' = Account Summary (entity + account), 'group' = Group Summary (entity + group) */
  mode?: "account" | "group";
};

export default function AccountsStatementPage({ onPartySelectionChange, mode = "account" }: AccountsStatementPageProps) {
  const { formatCurrency, formatDateBS, formatDate, dateSystem } = useDate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { company } = useCompany();
  const { onBackToReportList } = useReportPage();
  const { 
    vouchers: allVouchers, 
    loading: vouchersLoading, 
    processedParties,
    processedStaff,
    processedAccounts,
    processedTaxes,
    processedExpenseAccounts,
    processedGroups,
    processedAccountGroups,
    processedStaffGroups,
    processedTaxGroups,
    processedExpenseGroups,
    journalAccountNames,
    userNames: vouchersUserNames 
  } = useVouchers();
  
  const [selectedAccount, setSelectedAccount] = useState<UnifiedAccount | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<UnifiedGroup | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [transactionSearch, setTransactionSearch] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [view, setView] = useState<"list" | "chart">("list");
  const openingModalRef = useRef(false);
  const hasAutoSelected = useRef(false);
  const { settings: animationSettings } = useAnimationSettings();
  const isMobile = useIsMobile();
        layout
        initial={false}
        exit={{ transition: { duration: 0 } }}
        transition={{

          duration: rowAnimationDuration,
          ease: "easeInOut"
        }}
      >
        <Card
          className={cn(
            "p-1.5 border rounded-lg transition-colors duration-200 ml-4",
            item.id.startsWith('entity-') 
              ? "cursor-default bg-muted/50" 
              : isSelected
              ? "cursor-pointer border-primary bg-secondary shadow-sm"
              : "cursor-pointer border-gray-300 dark:border-gray-600 hover:border-primary/40 bg-card hover:bg-muted/30"
          )}
          onClick={() => handleSelectItem(item)}
        >
          <div className="flex items-center justify-between w-full gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroup(item.id);
                  }}
                  className="flex-shrink-0 p-0.5 hover:bg-muted rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-5" />}
              {item.type === 'group' ? (
                <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground flex-shrink-0">
                  <Users className="h-5 w-5" />
                </div>
              ) : item.account ? (
                <Avatar className="h-8 w-8 text-xs flex-shrink-0 border">
                  <AvatarImage src={(item.account.entity as any)?.fileUrl} alt={item.name} />
                  <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                    {item.account.entity && 'isSpecial' in item.account.entity && item.account.entity.isSpecial ? (
                      <Crown className="h-4 w-4 text-amber-500" />
                    ) : item.account.accountType === 'party' ? (
                      getInitials(item.name)
                    ) : item.account.accountType === 'staff' ? (
                      <Briefcase className="h-4 w-4" />
                    ) : item.account.accountType === 'tax' ? (
                      <Receipt className="h-4 w-4" />
                    ) : item.account.accountType === 'expense' ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : item.account.accountType === 'bank' ? (
                      <Landmark className="h-4 w-4" />
                    ) : (
                      getInitials(item.name)
                    )}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground flex-shrink-0">
                  <Landmark className="h-4 w-4" />
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-semibold text-sm whitespace-nowrap truncate min-w-0 cursor-default">
                    {item.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.name}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className={cn(
                    "font-bold text-xs whitespace-nowrap flex-shrink-0 ml-1 px-1 rounded cursor-default",
                    item.balance >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {formatCurrency(item.balance, { showDrCr: true })}
                </p>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="font-medium">{formatCurrency(item.balance, { showDrCr: true })}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </Card>
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children!.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </motion.div>
    );
  };

  // Render details view based on selected account or group
  const renderDetailsView = () => {
    if (selectedAccount) {
      const account = selectedAccount;
      
      // Use TaxDetails for tax accounts
      if (account.accountType === 'tax') {
        return (
          <TaxDetails
            tax={account.entity as Tax}
            allTaxes={processedTaxes}
            transactions={allVouchers}
            onTaxUpdated={() => {}}
            onTaxDeleted={() => setSelectedAccount(null)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
            context="report"
          />
        );
      }
      
      // Use PayeeDetails for party, staff, expense accounts
      if (account.accountType === 'party' || account.accountType === 'staff' || account.accountType === 'expense') {
        return (
          <PayeeDetails
            party={account.entity as any}
            allParties={[...processedParties, ...processedStaff, ...processedExpenseAccounts] as any}
            transactions={allVouchers}
            onPartyUpdated={() => {}}
            onPartyDeleted={() => setSelectedAccount(null)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            journalAccountNames={journalAccountNames}
            userNames={mergedUserNames}
          />
        );
      }
      
      // Use AccountDetails for bank accounts
      if (account.accountType === 'bank') {
        return (
          <AccountDetails
            account={account.entity as Account}
            allAccounts={processedAccounts}
            onAccountUpdated={() => {}}
            onAccountDeleted={() => setSelectedAccount(null)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
            transactions={allVouchers}
          />
        );
      }
    } else if (selectedGroup && selectedGroup.entity) {
      const group = selectedGroup;
      const groupEntity = group.entity;
      
      // Render appropriate group details component based on group type
      switch (group.groupType) {
        case 'party':
          return (
            <GroupDetails
              group={groupEntity as Group}
              allGroups={processedGroups}
              allParties={processedParties.filter(p => p.groupId === group.id)}
              onGroupUpdated={() => {}}
              onGroupDeleted={() => setSelectedGroup(null)}
              onPartyUpdated={() => {}}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          );
        case 'staff':
          return (
            <StaffGroupDetails
              group={groupEntity as any}
              allGroups={processedStaffGroups}
              staff={processedStaff.filter(s => s.groupId === group.id)}
              onGroupUpdated={() => {}}
              onGroupDeleted={() => setSelectedGroup(null)}
              onStaffUpdated={() => {}}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          );
        case 'tax':
          return (
            <TaxGroupDetails
              group={groupEntity as any}
              allGroups={processedTaxGroups}
              taxes={processedTaxes.filter(t => t.groupId === group.id)}
              onGroupUpdated={() => {}}
              onGroupDeleted={() => setSelectedGroup(null)}
              onTaxUpdated={() => {}}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          );
        case 'expense':
          return (
            <ExpenseGroupDetails
              group={groupEntity as any}
              allGroups={processedExpenseGroups}
              accounts={processedExpenseAccounts.filter(e => e.groupId === group.id)}
              onGroupUpdated={() => {}}
              onGroupDeleted={() => setSelectedGroup(null)}
              onAccountUpdated={() => {}}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          );
        case 'bank':
          return (
            <AccountGroupDetails
              group={groupEntity as AccountGroup}
              allGroups={processedAccountGroups}
              accounts={processedAccounts.filter(a => a.groupId === group.id)}
              onGroupUpdated={() => {}}
              onGroupDeleted={() => setSelectedGroup(null)}
              onAccountUpdated={() => {}}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          );
        default:
          return null;
      }
    }
    
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Select an account</CardTitle>
            <CardDescription>
              Choose an account or group from the list to view transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flattenedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accounts found. Create an account to see it here.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  };

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // Mobile: same UI as In/Exp Report - header, showing count, entity/account dropdowns, summary cards, search, transactions, bottom buttons
  if (isMobile) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-gray-50 overflow-hidden">
        <header className="sticky top-0 z-10 flex-shrink-0 flex flex-col gap-2 p-3 border-b bg-white">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-8 w-8"
              onClick={handleReportBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-bold truncate flex-1 min-w-0">{mode === "group" ? "Group Summary" : "Account Summary"}</h1>
            {activeSelection && (
              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                Showing {filteredReportTransactions.length} of {reportDisplayTransactions.length} voucher(s)
              </span>
            )}
          </div>
          <div className="flex justify-center items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
            {hasDateFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setDateRange(undefined)}
                title="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Combobox
                options={entityDropdownOptions}
                value={selectedEntityType}
                onChange={(value) => {
                  const entityItem = accountTree.find((e) => e.id.startsWith("entity-") && (e.group as any)?.groupType === value);
                  if (mode === "group") {
                    const firstGroup = allUnifiedGroups.find((g) => (g as any).groupType === value);
                    if (firstGroup) {
                      setSelectedGroup(firstGroup);
                      setSelectedAccount(null);
                    } else {
                      setSelectedGroup(null);
                      setSelectedAccount(null);
                    }
                  } else {
                    const firstAccount = entityItem?.children?.find((c) => c.type === "account" && c.account)?.account;
                    if (firstAccount) {
                      setSelectedAccount(firstAccount);
                      setSelectedGroup(null);
                    } else {
                      setSelectedAccount(null);
                      setSelectedGroup(null);
                    }
                  }
                }}
                placeholder="Entity"
              />
            </div>
            <div className="flex-1 min-w-0">
              {mode === "group" ? (
                <Combobox
                  options={groupDropdownOptions}
                  value={selectedGroup?.id || ""}
                  onChange={(value) => {
                    if (value === "ungrouped") {
                      const ungroupedParties = processedParties.filter((p: any) => !p.groupId);
                      const ungroupedBalance = ungroupedParties.reduce((s: number, p: any) => s + (p.balance || 0), 0);
                      setSelectedGroup({
                        id: "ungrouped",
                        name: "Ungrouped",
                        balance: ungroupedBalance,
                        debit: ungroupedParties.reduce((s: number, p: any) => s + (p.debit || 0), 0),
                        credit: ungroupedParties.reduce((s: number, p: any) => s + (p.credit || 0), 0),
                        groupType: "party",
                        entity: { id: "ungrouped", name: "Ungrouped", balance: ungroupedBalance } as any,
                      });
                      setSelectedAccount(null);
                      return;
                    }
                    const grp = allUnifiedGroups.find((g) => g.id === value);
                    if (grp) {
                      setSelectedGroup(grp);
                      setSelectedAccount(null);
                    }
                  }}
                  placeholder="Group"
                />
              ) : (
                <Combobox
                  options={accountDropdownOptions}
                  value={selectedAccount?.id || ""}
                  onChange={(value) => {
                    const acc = allUnifiedAccounts.find((a) => a.id === value);
                    if (acc) {
                      setSelectedAccount(acc);
                      setSelectedGroup(null);
                    }
                  }}
                  placeholder="Account"
                />
              )}
            </div>
          </div>
        </header>

        <Drawer
          open={isCalendarOpen}
          onOpenChange={(open: boolean) => {
            if (open) {
              openingModalRef.current = true;
              openModalInUrl();
            } else {
              closeModalInUrl();
            }
            setIsCalendarOpen(open);
          }}
        >
          <DrawerContent>
            <DrawerHeader className="p-4 text-left">
              <DrawerTitle>Select Date Range</DrawerTitle>
              <DrawerDescription>
                Select a starting and ending date for the transaction list.
              </DrawerDescription>
            </DrawerHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <NepaliCalendar
                  onSelect={handleNepaliSelect}
                  valueAD={dateRange}
                  isRange={true}
                  numberOfMonths={calendarMonths}

                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <div className="flex-1">
                  <Calendar
                    className="p-0 w-full"
                    classNames={{ table: "w-full" }}
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={asCalendarRange(dateRange)}

                    onSelect={(range) => {
                      setDateRange(range as DateRange | undefined);
                      if (range?.from && range.to) setIsCalendarOpen(false);
                    }}
                    numberOfMonths={calendarMonths}

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

        {/* Mobile: no pb-20 so scroll extends to footer; inner pb-24 so last row clears fixed footer */}
        <main className={cn("flex-1 flex flex-col min-h-0 px-4 pt-0.5", !isMobile && "pb-20")}>

          {activeSelection ? (
            view === "chart" ? (
              <div className="-mx-4 w-[calc(100%+2rem)] max-w-none flex-shrink-0">
                <RunningBalanceFullChart
                  transactions={reportDisplayTransactions}
                  openingBalance={openingBalanceForPeriod}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-nowrap gap-2 pt-0.5 pb-3 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
                  {summaryCards.map((card) => (
                    <ReportSummaryCard
                      key={card.title}
                      title={card.title}
                      amount={card.amount}
                      color={card.color}
                    />
                  ))}
                </div>
                <div
                  className="flex-1 min-h-0 overflow-y-auto px-0.5 -mx-4 md:mx-0 md:px-0"
                  data-floating-button-scroll
                >
                  {isMobile ? (
                    <div className="pb-24">
                      <TransactionsTable
                        transactions={filteredReportTransactions}
                        context={activeContext}
                        contextId={activeSelection?.id}
                        openingBalance={openingBalanceForPeriod}
                        userNames={mergedUserNames}
                        journalAccountNames={journalAccountNames}
                        onRowClick={handleEditVoucher}
                        openingBalanceLabel="Opening"
                        openingBalanceSearch={
                          <Input
                            placeholder="Search..."
                            value={transactionSearch}
                            onChange={(e) => setTransactionSearch(e.target.value)}
                            className="h-8 w-32 max-w-[140px] text-sm"
                          />
                        }
                      />
                    </div>
                  ) : (
                    <TransactionsTable
                      transactions={filteredReportTransactions}
                      context={activeContext}
                      contextId={activeSelection?.id}
                      openingBalance={openingBalanceForPeriod}
                      userNames={mergedUserNames}
                      journalAccountNames={journalAccountNames}
                      onRowClick={handleEditVoucher}
                      openingBalanceLabel="Opening"
                      openingBalanceSearch={
                        <Input
                          placeholder="Search..."
                          value={transactionSearch}
                          onChange={(e) => setTransactionSearch(e.target.value)}
                          className="h-8 w-32 max-w-[140px] text-sm"
                        />
                      }
                    />
                  )}

                </div>
              </>
            )
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>{mode === "group" ? "Select a group" : "Select an account"}</CardTitle>
                  <CardDescription>
                    {mode === "group"
                      ? "Choose a group from the entity and group dropdowns above."
                      : "Choose an account from the entity and account dropdowns above."}
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          )}
        </main>

        <footer className="flex items-stretch justify-around p-1.5 border-t bg-white gap-1 fixed bottom-0 left-0 right-0">
          <PermissionButton
            permission="export_data"
            className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-green-500 hover:bg-green-600 text-white rounded-md disabled:opacity-50"
            onClick={handlePrint}
            disabled={!activeSelection}
          >
            <Printer className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Print</span>
          </PermissionButton>
          <PermissionButton
            permission="export_data"
            className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md disabled:opacity-50"
            onClick={handleExcel}
            disabled={!activeSelection}
          >
            <File className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Excel</span>
          </PermissionButton>
          <Button
            className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md disabled:opacity-50"
            onClick={handleShare}
            disabled={!activeSelection}
          >
            <Share2 className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Share</span>
          </Button>
          <Button
            className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-slate-500 hover:bg-slate-600 text-white rounded-md"
            onClick={() => {
              openingModalRef.current = true;
              setIsCalendarOpen(true);
              openModalInUrl();
            }}
          >
            <CalendarIcon className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Date</span>
          </Button>
          <Button
            className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-violet-500 hover:bg-violet-600 text-white rounded-md disabled:opacity-50"
            onClick={() => setView((v) => (v === "list" ? "chart" : "list"))}
            disabled={!activeSelection}
          >
            <BarChart2 className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Chart</span>
          </Button>
        </footer>

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

  const sidebarTree = mode === "group" ? filteredGroupTree : filteredTree;
  const sidebarItemCount = mode === "group" ? flattenedGroupItems.length : flattenedItems.length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <h2 className="text-lg font-bold font-headline">{mode === "group" ? "Group Summary" : "Account Summary"}</h2>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Balance</p>
              <p className={cn(
                "text-xl font-bold",
                totalBalance >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatCurrency(totalBalance, { showDrCr: true, noSuffix: true })}
              </p>
            </Card>
          </div>
          <div className="p-3 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={mode === "group" ? "Search groups..." : "Search accounts..."}
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
            <h3 className="text-sm font-semibold">{mode === "group" ? `Groups (${sidebarItemCount})` : `Accounts (${sidebarItemCount})`}</h3>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              <AnimatePresence mode="popLayout">
                {sidebarTree.map(item => renderTreeItem(item))}
              </AnimatePresence>
              {sidebarTree.length === 0 && (
                <div className="text-center text-muted-foreground p-8">
                  {mode === "group" ? "No groups found." : "No accounts found."}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {(selectedAccount || selectedGroup) && (
            <div className="flex-shrink-0 flex justify-center items-center gap-2 py-2 border-b bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
              {hasDateFilter && (
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setDateRange(undefined)} title="Clear date filter">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {renderDetailsView()}
        </div>
      </div>
    </div>
  );
}

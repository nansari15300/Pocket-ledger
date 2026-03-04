"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PermissionButton } from "@/components/permission";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { Combobox } from "@/components/ui/combobox";
import { ArrowLeft, Calendar as CalendarIcon, File, Printer, Share2, BarChart2, X } from "lucide-react";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
<<<<<<< HEAD
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
=======
import type { DateRange } from "@/components/ui/ad-calendar";
import { format } from "date-fns";
import AdCalendar from "@/components/ui/ad-calendar";
>>>>>>> 6a1ec26 (Animation Fixed)
import { cn } from "@/lib/utils";
import { useTransactions } from "@/hooks/use-transactions";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect, getPdfBlob, type Context } from "@/lib/printDirect";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
<<<<<<< HEAD
import { useIsMobile } from "@/hooks/use-mobile";
=======
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
>>>>>>> 6a1ec26 (Animation Fixed)
import NepaliCalendar from "@/components/ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";

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

export default function DesktopExpenseStatementPage() {
  const {
    processedExpenseAccounts,
    processedExpenseGroups,
    vouchers,
    loading,
    journalAccountNames,
  } = useVouchers();
  const { company } = useCompany();
  const { formatDateBS, formatDate, formatCurrency, dateSystem } = useDate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
<<<<<<< HEAD
=======
  const calendarMonths = useCalendarMonths();
>>>>>>> 6a1ec26 (Animation Fixed)
  const openingModalRef = useRef(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [view, setView] = useState<"list" | "chart">("list");

  const [selectedAccount, setSelectedAccount] = useState<ExpenseAccount | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ExpenseGroup | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedUidsRef = useRef<Set<string>>(new Set());

  const pageTitle = selectedGroup ? "In/Exp Group Report" : "In/Exp Report";

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    try {
      const userDoc = await getDoc(doc(firestore, "users", userId));
      if (userDoc.exists()) {
        return userDoc.data().displayName || userDoc.data().email || "Unknown";
      }
    } catch (e) {}
    return "Unknown";
  }, []);

  useEffect(() => {
    if (!vouchers) return;
    const uids = new Set(vouchers.map((t) => t.userId).filter(Boolean));
    uids.forEach(async (uid) => {
      if (fetchedUidsRef.current.has(uid)) return;
      fetchedUidsRef.current.add(uid);
      const name = await fetchUserName(uid);
      setUserNames((prev) => (prev[uid] === name ? prev : { ...prev, [uid]: name }));
    });
  }, [vouchers, fetchUserName]);

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
  const anyReportPopupOpen = isVoucherDialogOpen || isCalendarOpen;
  useEffect(() => {
    if (!isMobile) return;
    if (modalParam === "1") openingModalRef.current = false;
    if (modalParam !== "1" && anyReportPopupOpen && !openingModalRef.current) {
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      setIsCalendarOpen(false);
    }
  }, [isMobile, modalParam, anyReportPopupOpen]);

  const handleReportBack = useCallback(() => {
    if (isVoucherDialogOpen) {
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      closeModalInUrl();
      return;
    }
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
      closeModalInUrl();
      return;
    }
    router.back();
  }, [isVoucherDialogOpen, isCalendarOpen, closeModalInUrl, router]);

  const handleEditVoucher = useCallback(
    (voucher: any) => {
      openingModalRef.current = true;
      setSelectedVoucher(voucher);
      openModalInUrl();
      setIsVoucherDialogOpen(true);
    },
    [openModalInUrl]
  );

  // Build group entity with items and expenseGroupIds for useTransactions
  const groupEntity = useMemo(() => {
    if (!selectedGroup) return null;
    const accountsInGroup = processedExpenseAccounts.filter((a) => a.groupId === selectedGroup.id);
    const expenseGroupIds = [selectedGroup.id];
    return { ...selectedGroup, items: accountsInGroup, expenseGroupIds };
  }, [selectedGroup, processedExpenseAccounts]);

  const activeEntity = selectedAccount || groupEntity;
  const activeContext = selectedAccount ? "expense" : "group";

  useEffect(() => {
    const accountId = searchParams.get("accountId");
    const groupId = searchParams.get("groupId");

    if (accountId && processedExpenseAccounts.length > 0) {
      const acc = processedExpenseAccounts.find((a) => a.id === accountId);
      if (acc) {
        setSelectedAccount((prev) => (prev?.id === acc.id ? prev : acc));
        setSelectedGroup(null);
      }
    } else if (groupId && processedExpenseGroups.length > 0) {
      const grp = processedExpenseGroups.find((g) => g.id === groupId);
      if (grp) {
        setSelectedGroup((prev) => (prev?.id === grp.id ? prev : grp));
        setSelectedAccount(null);
      }
    } else if (processedExpenseAccounts.length > 0) {
      const first = processedExpenseAccounts[0];
      setSelectedAccount((prev) => {
        if (!first) return null;
        if (prev?.id === first.id) return prev;
        if (prev && processedExpenseAccounts.some((a) => a.id === prev.id)) return prev;
        return first;
      });
      setSelectedGroup(null);
    }
  }, [searchParams, processedExpenseAccounts, processedExpenseGroups]);

  const { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance } = useTransactions(
    activeEntity as any,
    activeContext,
    dateRange,
    undefined,
    processedExpenseAccounts,
    vouchers
  );

  const hasDateFilter = !!dateRange?.from || !!dateRange?.to;
  const reportDisplayTransactions = useMemo(() => {
    if (hasDateFilter) return processedTransactions;
    if (processedTransactions.length <= 10) return processedTransactions;
    return processedTransactions.slice(-10);
  }, [processedTransactions, hasDateFilter]);

  const filteredReportTransactions = useMemo(() => {
    if (!transactionSearch.trim()) return reportDisplayTransactions;
    const q = transactionSearch.trim().toLowerCase();
    return reportDisplayTransactions.filter((t: any) => {
      const vno = (t.voucherNumber || "").toLowerCase();
      const narr = (t.narration || "").toLowerCase();
      const type = (typeof t.type === "string" ? t.type.replace(/_/g, " ") : "").toLowerCase();
      const amount = String(t.debit ?? t.credit ?? t.total ?? "").toLowerCase();
      return vno.includes(q) || narr.includes(q) || type.includes(q) || amount.includes(q);
    });
  }, [reportDisplayTransactions, transactionSearch]);

  const { summaryData, chartData } = useMemo(() => {
    const emptyData = {
      summaryData: { income: 0, expense: 0 },
      chartData: { balance: [] },
    };
    if (!activeEntity) return emptyData;
    const entityVouchers = processedTransactions;

    const summary = {
      income: entityVouchers.filter((v) => v.type === "direct_income").reduce((sum, v) => sum + (v.amount || 0), 0),
      expense: entityVouchers.filter((v) => v.type === "direct_expense").reduce((sum, v) => sum + (v.amount || 0), 0),
    };

    const charts = {
      balance: entityVouchers.map((t) => ({ date: t.date?.toDate?.() ?? new Date(t.date), value: t.balance })),
    };

    return { summaryData: summary, chartData: charts };
  }, [processedTransactions, activeEntity]);

  const summaryCards = useMemo(
    () => [
      { title: "Balance", amount: closingBalance, color: closingBalance >= 0 ? "text-green-600" : "text-red-600" },
      { title: "Income", amount: summaryData.income, color: "text-green-600" },
      { title: "Expense", amount: summaryData.expense, color: "text-red-600" },
    ],
    [closingBalance, summaryData.income, summaryData.expense]
  );

  const handlePrint = () => {
    if (!activeEntity || !company) return;

    let dateRangeText = "All Time";
    if (dateRange?.from) {
      const from = dateRange.from;
      const to = dateRange.to || from;
      const fromBS = formatDateBS(from);
      const toBS = formatDateBS(to);
      const fromAD = formatDate(from);
      const toAD = formatDate(to);

      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
      else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
      else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }

    openPrintDirect(
      {
        company: {
          name: company.name,
          pan: company.pan,
          phone: company.phone,
          address: company.address,
          logoUrl: company.logoUrl,
        },
        title: `Income & Expense Statement: ${activeEntity.name}`,
        context: activeContext as "expense" | "group",
        contextId: activeEntity.id,
        dateSystem: dateSystem,
        dateRangeText,
        vouchersCount: processedTransactions.length,
        openingBalance: openingBalanceForPeriod,
        transactions: processedTransactions,
        showNarration: true,
      },
      true
    );
  };

  const handleExcel = () => {
    if (!activeEntity) return;

    const dataForExport = processedTransactions.map((t) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      return {
        "Date (BS)": formatDateBS(d),
        "Date (AD)": formatDate(d),
        "Voucher No.": t.voucherNumber,
        Type: t.type.replace(/_/g, " "),
        Narration: t.narration || "",
        Debit: t.debit,
        Credit: t.credit,
        Balance: `${Math.abs(t.balance).toFixed(2)} ${t.balance >= 0 ? "Dr" : "Cr"}`,
      };
    });

    const summaryRows = [
      {
        "Date (BS)": "Opening Balance",
        Balance: `${Math.abs(openingBalanceForPeriod).toFixed(2)} ${openingBalanceForPeriod >= 0 ? "Dr" : "Cr"}`,
      },
      { "Date (BS)": "Total", Debit: periodDr, Credit: periodCr },
      {
        "Date (BS)": "Closing Balance",
        Balance: `${Math.abs(closingBalance).toFixed(2)} ${closingBalance >= 0 ? "Dr" : "Cr"}`,
      },
    ];

    const finalData = [...dataForExport, {}, ...summaryRows];
    const worksheet = XLSX.utils.json_to_sheet(finalData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Income & Expense Statement");
    XLSX.writeFile(workbook, `${activeEntity.name}_statement.xlsx`);
  };

  const handleShare = async () => {
    if (!navigator.share) {
      alert("Web Share API not supported in your browser.");
      return;
    }
    if (!activeEntity || !company) return;
    const entityName = activeEntity.name;
    const title = `Statement for ${entityName}`;
    const text = `Here is the financial statement for ${entityName}.`;
    try {
      let dateRangeText = "All Time";
      if (dateRange?.from) {
        const from = dateRange.from;
        const to = dateRange.to || from;
        const fromBS = formatDateBS(from);
        const toBS = formatDateBS(to);
        const fromAD = formatDate(from);
        const toAD = formatDate(to);
        if (dateSystem === "AD") dateRangeText = `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
        else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
        else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
      }
      const payload = {
        company: { name: company.name, pan: company.pan, phone: company.phone, address: company.address, logoUrl: company.logoUrl },
        title: `Income & Expense Statement: ${entityName}`,
        context: activeContext as Context,
        contextId: activeEntity.id,
        dateSystem: dateSystem,
        dateRangeText,
        vouchersCount: processedTransactions.length,
        openingBalance: openingBalanceForPeriod,
        transactions: processedTransactions,
        showNarration: true,
      };
      const blob = await getPdfBlob(payload);
      if (blob) {
        const file = new (globalThis as any).File([blob], `${entityName.replace(/\s+/g, "_")}_statement.pdf`, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, url: window.location.href, files: [file] });
        } else {
          await navigator.share({ title, text, url: window.location.href });
        }
      } else {
        await navigator.share({ title, text, url: window.location.href });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  const dateRangeLabel = useMemo(() => {
    if (!hasDateFilter) return "Last 10 Txns";
    const from = dateRange!.from!;
    const to = dateRange!.to || from;
    const fromAD = format(from, "LLL dd, y");
    const toAD = to ? format(to, "LLL dd, y") : fromAD;
    const fromBS = formatDateBS(from);
    const toBS = to ? formatDateBS(to) : fromBS;
    if (dateSystem === "AD") return `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
    if (dateSystem === "BS") return `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
    return `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
  }, [dateRange, dateSystem, formatDateBS, hasDateFilter]);

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

  const accountReportOptions = useMemo(
    () =>
      processedExpenseAccounts.map((a) => ({ value: a.id, label: a.name })),
    [processedExpenseAccounts]
  );

  const groupReportOptions = useMemo(() => {
    const exclude = ["income", "expenses"];
    const currentId = selectedGroup?.id;
    return processedExpenseGroups
      .filter(
        (g) =>
          g.id === currentId || !exclude.includes((g.id || "").toLowerCase())
      )
      .map((g) => ({ value: g.id, label: g.name }));
  }, [processedExpenseGroups, selectedGroup?.id]);

  if (loading && !activeEntity) {
    return <LoadingSpinner />;
  }

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
          <h1 className="text-base font-bold truncate flex-1 min-w-0">{pageTitle}</h1>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            Showing {reportDisplayTransactions.length} of {processedTransactions.length} voucher(s)
          </span>
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
              options={accountReportOptions}
              value={selectedAccount?.id || ""}
              onChange={(value) => {
                const acc = processedExpenseAccounts.find((a) => a.id === value);
                if (acc) {
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("accountId", acc.id);
                  newUrl.searchParams.delete("groupId");
                  window.history.pushState({}, "", newUrl);
                  setSelectedAccount(acc);
                  setSelectedGroup(null);
                }
              }}
              placeholder="Select account"
            />
          </div>
          <div className="flex-1 min-w-0">
            <Combobox
              options={groupReportOptions}
              value={selectedGroup?.id || ""}
              onChange={(value) => {
                const grp = processedExpenseGroups.find((g) => g.id === value);
                if (grp) {
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("groupId", grp.id);
                  newUrl.searchParams.delete("accountId");
                  window.history.pushState({}, "", newUrl);
                  setSelectedGroup(grp);
                  setSelectedAccount(null);
                }
              }}
              placeholder="Select group"
            />
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
<<<<<<< HEAD
                numberOfMonths={2}
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
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range as DateRange | undefined);
                    if (range?.from && range.to) setIsCalendarOpen(false);
                  }}
                  numberOfMonths={2}
=======
                numberOfMonths={calendarMonths}
              />
            )}
            {(dateSystem === "AD" || dateSystem === "Both") && (
              <div className="flex-1 w-full min-w-0">
                <AdCalendar
                  valueAD={dateRange}
                  isRange
                  numberOfMonths={calendarMonths}
                  transactionDates={processedTransactions?.map((t: any) => t.date?.toDate?.() ?? t.date).filter(Boolean) ?? []}
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
>>>>>>> 6a1ec26 (Animation Fixed)
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

<<<<<<< HEAD
      <main className="flex-1 flex flex-col min-h-0 px-4 pb-20 pt-0.5">
=======
      {/* Mobile: no pb-20 so scroll extends to footer; inner pb-24 so last row clears fixed footer */}
      <main className={cn("flex-1 flex flex-col min-h-0 px-4 pt-0.5", !isMobile && "pb-20")}>
>>>>>>> 6a1ec26 (Animation Fixed)
        {view === "chart" ? (
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
<<<<<<< HEAD
              <TransactionsTable
                transactions={filteredReportTransactions}
                context={activeContext}
                contextId={activeEntity?.id}
                openingBalance={openingBalanceForPeriod}
                userNames={userNames}
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
=======
              {isMobile ? (
                <div className="pb-24">
                  <TransactionsTable
                    transactions={filteredReportTransactions}
                    context={activeContext}
                    contextId={activeEntity?.id}
                    openingBalance={openingBalanceForPeriod}
                    userNames={userNames}
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
                  contextId={activeEntity?.id}
                  openingBalance={openingBalanceForPeriod}
                  userNames={userNames}
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
>>>>>>> 6a1ec26 (Animation Fixed)
            </div>
          </>
        )}
      </main>

      <footer className="flex items-stretch justify-around p-1.5 border-t bg-white gap-1 fixed bottom-0 left-0 right-0">
        <PermissionButton
          permission="export_data"
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-green-500 hover:bg-green-600 text-white rounded-md"
          onClick={handlePrint}
        >
          <Printer className="w-4 h-4 mb-0" />{" "}
          <span className="text-[10px] leading-tight">Print</span>
        </PermissionButton>
        <PermissionButton
          permission="export_data"
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md"
          onClick={handleExcel}
        >
          <File className="w-4 h-4 mb-0" />{" "}
          <span className="text-[10px] leading-tight">Excel</span>
        </PermissionButton>
        <Button
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md"
          onClick={handleShare}
        >
          <Share2 className="w-4 h-4 mb-0" />{" "}
          <span className="text-[10px] leading-tight">Share</span>
        </Button>
        <Button
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-slate-500 hover:bg-slate-600 text-white rounded-md"
          onClick={() => {
            openingModalRef.current = true;
            setIsCalendarOpen(true);
            openModalInUrl();
          }}
        >
          <CalendarIcon className="w-4 h-4 mb-0" />{" "}
          <span className="text-[10px] leading-tight">Date</span>
        </Button>
        <Button
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-violet-500 hover:bg-violet-600 text-white rounded-md"
          onClick={() => setView((v) => (v === "list" ? "chart" : "list"))}
        >
          <BarChart2 className="w-4 h-4 mb-0" />{" "}
          <span className="text-[10px] leading-tight">Chart</span>
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

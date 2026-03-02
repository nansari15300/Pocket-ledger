"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PermissionButton } from "@/components/permission";
import { Calendar } from "@/components/ui/calendar";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { Combobox } from "@/components/ui/combobox";
import { ArrowLeft, Calendar as CalendarIcon, File, Printer, Share2, BarChart2, X } from "lucide-react";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTransactions } from "@/hooks/use-transactions";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect, getPdfBlob, type Context } from "@/lib/printDirect";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { Card } from "@/components/ui/card";
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
    <Card className="px-2 py-1.5 w-fit flex-shrink-0 border rounded-lg overflow-hidden">
      <div className="flex flex-col">
        <p className="text-xs text-muted-foreground whitespace-nowrap">{title}</p>
        <p className={cn("text-sm sm:text-base font-bold whitespace-nowrap tabular-nums", color)} title={titleStr}>
          {formatted}
        </p>
      </div>
    </Card>
  );
}, (prev, next) => prev.title === next.title && prev.amount === next.amount && prev.color === next.color);

export default function DesktopStaffStatementPage() {
  const { processedStaff, processedStaffGroups, vouchers, loading, journalAccountNames } = useVouchers();
  const { company } = useCompany();
  const { formatDateBS, formatDate, formatCurrency, dateSystem } = useDate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const openingModalRef = useRef(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [view, setView] = useState<"list" | "chart">("list");

  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<StaffGroup | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedUidsRef = useRef<Set<string>>(new Set());

  const pageTitle = selectedGroup ? "Staff Group Report" : "Staff Report";

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

  useEffect(() => {
    const staffId = searchParams.get("staffId");
    const groupId = searchParams.get("groupId");

    if (staffId && processedStaff.length > 0) {
      const staff = processedStaff.find((p) => p.id === staffId);
      setSelectedStaff(prev => (prev?.id === staff?.id ? prev : staff || null));
      setSelectedGroup(prev => (prev !== null ? null : prev));
    } else if (groupId && processedStaffGroups.length > 0) {
      const group = processedStaffGroups.find((g) => g.id === groupId);
      setSelectedGroup(prev => (prev?.id === group?.id ? prev : group || null));
      setSelectedStaff(prev => (prev !== null ? null : prev));
    } else if (processedStaff.length > 0) {
      const first = processedStaff[0];
      setSelectedStaff(prev => {
        if (!first) return null;
        if (prev?.id === first.id) return prev;
        if (prev && processedStaff.some((p) => p.id === prev.id)) return prev;
        return first;
      });
      setSelectedGroup(prev => (prev !== null ? null : prev));
    }
  }, [searchParams, processedStaff, processedStaffGroups]);

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

  const activeEntity =
    selectedStaff ||
    (selectedGroup ? { ...selectedGroup, items: processedStaff.filter((p) => p.groupId === selectedGroup.id) } : null);
  const activeContext = selectedStaff ? "staff" : "group";

  const { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance } = useTransactions(
    activeEntity as any,
    activeContext,
    dateRange
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

  const { summaryData } = useMemo(() => {
    const emptyData = {
      summaryData: { sales: 0, purchases: 0, moneyIn: 0, moneyOut: 0, addSalary: 0 },
    };
    if (!activeEntity) return emptyData;
    const entityVouchers = processedTransactions;

    const addSalary = entityVouchers
      .filter((v) => v.type === "journal" && v.subType === "add_salary")
      .reduce((sum, v) => sum + (v.total || 0), 0);

    const summary = {
      sales: entityVouchers.filter((v) => v.type === "sale").reduce((sum, v) => sum + (v.total || 0), 0),
      purchases: entityVouchers.filter((v) => v.type === "purchase").reduce((sum, v) => sum + (v.total || 0), 0),
      moneyIn: entityVouchers.filter((v) => v.type === "payment_in").reduce((sum, v) => sum + (v.amount || 0), 0),
      moneyOut: entityVouchers.filter((v) => v.type === "payment_out").reduce((sum, v) => sum + (v.amount || 0), 0),
      addSalary,
    };

    return { summaryData: summary };
  }, [processedTransactions, activeEntity]);

  const summaryCards = useMemo(
    () => [
      { title: "Balance", amount: closingBalance, color: closingBalance >= 0 ? "text-green-600" : "text-red-600" },
      { title: "Add Salary", amount: summaryData.addSalary, color: "text-red-600" },
      { title: "Money In", amount: summaryData.moneyIn, color: "text-green-600" },
      { title: "Money Out", amount: summaryData.moneyOut, color: "text-red-600" },
    ],
    [closingBalance, summaryData.addSalary, summaryData.moneyIn, summaryData.moneyOut]
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
        title: `${selectedStaff ? "Staff" : "Group"} Statement: ${activeEntity.name}`,
        context: activeContext,
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

    const dataForExport = processedTransactions.map((t: any) => {
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Staff Statement");

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
        title: `${selectedStaff ? "Staff" : "Group"} Statement: ${entityName}`,
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

  const staffReportOptions = useMemo(
    () => processedStaff.map((p) => ({ value: p.id, label: p.name })),
    [processedStaff]
  );

  const groupReportOptions = useMemo(
    () => processedStaffGroups.map((g) => ({ value: g.id, label: g.name })),
    [processedStaffGroups]
  );

  if (loading && !activeEntity) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50 overflow-hidden">
      <header className="sticky top-0 z-10 flex-shrink-0 flex flex-col gap-2 p-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleReportBack}>
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
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setDateRange(undefined)} title="Clear date filter">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Combobox
              options={staffReportOptions}
              value={selectedStaff?.id || ""}
              onChange={(value) => {
                const staff = processedStaff.find((p) => p.id === value);
                if (staff) {
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("staffId", staff.id);
                  newUrl.searchParams.delete("groupId");
                  window.history.pushState({}, "", newUrl);
                  setSelectedStaff(staff);
                  setSelectedGroup(null);
                }
              }}
              placeholder="Select a staff"
            />
          </div>
          <div className="flex-1 min-w-0">
            <Combobox
              options={groupReportOptions}
              value={selectedGroup?.id || ""}
              onChange={(value) => {
                const group = processedStaffGroups.find((g) => g.id === value);
                if (group) {
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("groupId", group.id);
                  newUrl.searchParams.delete("staffId");
                  window.history.pushState({}, "", newUrl);
                  setSelectedGroup(group);
                  setSelectedStaff(null);
                }
              }}
              placeholder="Select a group"
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
            <DrawerDescription>Select a starting and ending date for the transaction list.</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            {(dateSystem === "BS" || dateSystem === "Both") && (
              <NepaliCalendar onSelect={handleNepaliSelect} valueAD={dateRange} isRange={true} numberOfMonths={2} />
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

      <main className="flex-1 flex flex-col min-h-0 px-4 pb-20 pt-0.5">
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
                <ReportSummaryCard key={card.title} title={card.title} amount={card.amount} color={card.color} />
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-0.5 -mx-4 md:mx-0 md:px-0" data-floating-button-scroll>
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
          </>
        )}
      </main>

      <footer className="flex items-stretch justify-around p-1.5 border-t bg-white gap-1 fixed bottom-0 left-0 right-0">
        <PermissionButton
          permission="export_data"
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-green-500 hover:bg-green-600 text-white rounded-md"
          onClick={handlePrint}
        >
          <Printer className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Print</span>
        </PermissionButton>
        <PermissionButton
          permission="export_data"
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md"
          onClick={handleExcel}
        >
          <File className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Excel</span>
        </PermissionButton>
        <Button
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md"
          onClick={handleShare}
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
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-violet-500 hover:bg-violet-600 text-white rounded-md"
          onClick={() => setView((v) => (v === "list" ? "chart" : "list"))}
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

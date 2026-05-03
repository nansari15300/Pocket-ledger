"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useRouter, usePathname } from "next/navigation";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { Combobox } from "@/components/ui/combobox";
import { ArrowLeft, Calendar as CalendarIcon, File as FileIcon, Printer, Share2, BarChart2, X } from "lucide-react";
import type { Item, ItemGroup } from "@/components/items/types";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { format } from "date-fns";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { ReportStatementHeaderAvatar } from "@/components/reports/ReportStatementHeaderAvatar";
import { useStatementReportMobilePaging } from "@/hooks/useStatementReportMobilePaging";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import {
  clearPlModalParentQueryBackup,
  pathnameForModalRouterReplace,
  persistPlModalParentQuery,
  searchParamsStringAfterClosingModal,
  searchParamsStringForModalClose,
} from "@/lib/modalUrlSync";
import { useTransactions } from "@/hooks/use-transactions";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect, getPdfBlob, type Context } from "@/lib/printDirect";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { calendarPanelClassName } from "@/lib/calendarChrome";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import * as XLSX from "xlsx";
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import { getConversionFactor, formatQuantity } from "@/components/vouchers/transactionTableShared";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";

const ReportSummaryCard = React.memo(function ReportSummaryCard({
  title,
  amount,
  color,
  customFormatted,
}: {
  title: string;
  amount: number;
  color: string;
  customFormatted?: string;
}) {
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const formatted = customFormatted ?? formatCurrency(amount, { showDrCr: title === "Balance" });
  const titleStr = customFormatted ?? formatCurrencyForPrint(amount, { showDrCr: title === "Balance" });
  return (
    <div className="px-2 py-1.5 h-10 min-h-10 flex items-center justify-center w-fit flex-shrink-0 border rounded-lg overflow-hidden bg-card">
      <div className="flex flex-col">
        <p className="text-xs text-muted-foreground whitespace-nowrap">{title}</p>
        <p className={cn("text-sm sm:text-base font-bold whitespace-nowrap tabular-nums", color)} title={titleStr}>
          {formatted}
        </p>
      </div>
    </div>
  );
}, (prev, next) => prev.title === next.title && prev.amount === next.amount && prev.color === next.color && prev.customFormatted === next.customFormatted);

export default function DesktopItemStatementPage() {
  const { processedItems, processedItemGroups, vouchers, loading, journalAccountNames } = useVouchers();
  const { company } = useCompany();
  const { formatDateBS, formatDate, formatCurrency, dateSystem } = useDate();
  const router = useRouter();
  const searchParams = useLocationSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const openingModalRef = useRef(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [view, setView] = useState<"list" | "chart">("list");

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ItemGroup | null>(null);
  const [reportStockView, setReportStockView] = useState<"amount" | "qty">("amount");
  const [reportDisplayUnit, setReportDisplayUnit] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedUidsRef = useRef<Set<string>>(new Set());

  const pageTitle = selectedGroup ? "Item Group Report" : "Item Report";

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    try {
      const userDoc = await getDoc(doc(firestore, "users", userId));
      if (userDoc.exists()) {
        return userDoc.data().displayName || userDoc.data().email || "Unknown";
      }
    } catch (_) {}
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

  const itemId = searchParams.get("itemId");
  const groupId = searchParams.get("groupId");

  useEffect(() => {
    if (!processedItems.length && !processedItemGroups.length) return;
    if (itemId) {
      const item = processedItems.find((p) => p.id === itemId);
      if (item) {
        setSelectedItem(item);
        setSelectedGroup(null);
        return;
      }
    }
    if (groupId) {
      const group = processedItemGroups.find((g) => g.id === groupId);
      if (group) {
        setSelectedGroup(group);
        setSelectedItem(null);
        return;
      }
    }
    if (!selectedItem && !selectedGroup) {
      const first = processedItems[0];
      if (first) {
        setSelectedItem(first);
        setSelectedGroup(null);
      } else {
        const firstGroup = processedItemGroups[0];
        if (firstGroup) {
          setSelectedGroup(firstGroup);
          setSelectedItem(null);
        }
      }
    }
  }, [itemId, groupId, processedItems, processedItemGroups]);

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
    const q = params.toString();
    const basePath = pathnameForModalRouterReplace(pathname);
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
    clearPlModalParentQueryBackup();
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

  const itemReportOptions = useMemo(
    () => processedItems.map((p) => ({ value: p.id, label: p.name })),
    [processedItems]
  );

  const groupReportOptions = useMemo(
    () => processedItemGroups.map((g) => ({ value: g.id, label: g.name })),
    [processedItemGroups]
  );

  const unitOptions = useMemo(() => {
    if (!selectedItem) return [];
    const units = new Set<string>();
    if ((selectedItem as any).openingBalanceUnit) units.add((selectedItem as any).openingBalanceUnit);
    if (selectedItem.unitConversions) {
      (selectedItem.unitConversions as any[]).forEach((c: any) => {
        if (c.fromUnit) units.add(c.fromUnit);
        if (c.toUnit) units.add(c.toUnit);
      });
    }
    return Array.from(units);
  }, [selectedItem]);

  const conversions = (selectedItem?.unitConversions || []) as any[];
  const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((selectedItem as any)?.openingBalanceUnit || "");
  const effectiveDisplayUnit = reportDisplayUnit || smallestUnit;

  useEffect(() => {
    if (!selectedItem) {
      setReportStockView("amount");
      setReportDisplayUnit("");
    } else if (unitOptions.length > 0) {
      setReportDisplayUnit(smallestUnit);
    } else {
      setReportDisplayUnit("");
    }
  }, [selectedItem, unitOptions.length, smallestUnit]);

  const activeEntity = selectedItem || (selectedGroup ? { ...selectedGroup, items: processedItems.filter((p) => p.groupId === selectedGroup.id) } : null);
  const activeContext = selectedItem ? "item" : "group";

  const reportStockViewForTx = selectedItem ? reportStockView : "amount";
  const reportDisplayUnitForTx = selectedItem && reportStockViewForTx === "qty" ? effectiveDisplayUnit : undefined;

  const { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance } = useTransactions(
    activeEntity as any,
    activeContext,
    dateRange,
    reportStockViewForTx,
    processedItems,
    vouchers,
    undefined,
    {},
    undefined,
    undefined,
    userNames,
    reportDisplayUnitForTx
  );

  const hasDateFilter = !!dateRange?.from || !!dateRange?.to;
  // Mobile: full tx list for tail pager; desktop all-time = last 10 rows.
  const reportDisplayTransactions = useMemo(() => {
    if (hasDateFilter || isMobile) return processedTransactions;
    if (processedTransactions.length <= 10) return processedTransactions;
    return processedTransactions.slice(-10);
  }, [processedTransactions, hasDateFilter, isMobile]);

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

  // Qty/amount toggle ya unit badle to row shape change — pager page 1 (Party hook resetKey).
  const itemStatementMobilePagingKey = `${activeEntity?.id ?? ""}|${hasDateFilter}|${transactionSearch.trim()}|${reportStockViewForTx}|${effectiveDisplayUnit ?? ""}`;
  const {
    pagingMeta: itemStatementMobilePaging,
    pagerPage: itemReportPagerPage,
    setPagerPage: setItemReportPagerPage,
    rowsPerPage: itemReportRowsPerPage,
    setRowsPerPage: setItemReportRowsPerPage,
  } = useStatementReportMobilePaging({
    filteredRows: filteredReportTransactions,
    isMobile,
    openingBalanceForPeriod,
    periodDr,
    periodCr,
    closingBalance,
    resetKey: itemStatementMobilePagingKey,
  });

  const summaryCards = useMemo(() => {
    const salesAmount = processedTransactions.filter((v) => v.type === "sale").reduce((s, v) => s + (v.total || 0), 0);
    const purchasesAmount = processedTransactions.filter((v) => v.type === "purchase").reduce((s, v) => s + (v.total || 0), 0);
    const salesQty = processedTransactions.filter((v) => v.type === "sale").reduce((s, v) => s + (v.credit || 0), 0);
    const purchasesQty = processedTransactions.filter((v) => v.type === "purchase").reduce((s, v) => s + (v.debit || 0), 0);
    return [
      { title: "Balance", amount: closingBalance, qty: closingBalance, color: closingBalance >= 0 ? "text-green-600" : "text-red-600" },
      { title: "Sales", amount: salesAmount, qty: salesQty, color: "text-green-600" },
      { title: "Purchases", amount: purchasesAmount, qty: purchasesQty, color: "text-red-600" },
    ];
  }, [closingBalance, processedTransactions]);

  const dateRangeLabel = useMemo(() => {
    // Entity report header row-2 — Party statement jaisa "All Time"; last-10 desktop slice alag logic.
    if (!hasDateFilter) return "All Time";
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

  const handlePrint = () => {
    if (!activeEntity || !company) return;
    let dateRangeText = "All Time";
    if (dateRange?.from) {
      const from = dateRange.from;
      const to = dateRange.to || from;
      const fromBS = formatDateBS(from);
      const toBS = formatDateBS(to);
      const fromAD = format(from, 'MMM-dd-yyyy');
      const toAD = format(to, 'MMM-dd-yyyy');
      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
      else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
      else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    openPrintDirect({
      company: { name: company.name, pan: company.pan, phone: company.phone, address: company.address, logoUrl: company.logoUrl },
      title: `${selectedItem ? "Item" : "Item Group"} Statement: ${activeEntity.name}`,
      context: activeContext as Context,
      contextId: activeEntity.id,
      dateSystem,
      dateRangeText,
      vouchersCount: processedTransactions.length,
      openingBalance: openingBalanceForPeriod,
      transactions: processedTransactions,
      showNarration: true,
    }, true);
  };

  const handleExcel = () => {
    if (!activeEntity) return;
    const dataForExport = processedTransactions.map((t) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      return {
        "Date (BS)": formatDateBS(d),
        "Date (AD)": format(d, 'MMM-dd-yyyy'),
        "Voucher No.": t.voucherNumber,
        Type: t.type?.replace(/_/g, " "),
        Narration: t.narration || "",
        Debit: t.debit,
        Credit: t.credit,
        Balance: `${Math.abs(t.balance).toFixed(2)} ${t.balance >= 0 ? "Dr" : "Cr"}`,
      };
    });
    const summaryRows = [
      { "Date (BS)": "Opening Balance", Balance: `${Math.abs(openingBalanceForPeriod).toFixed(2)} ${openingBalanceForPeriod >= 0 ? "Dr" : "Cr"}` },
      { "Date (BS)": "Total", Debit: periodDr, Credit: periodCr },
      { "Date (BS)": "Closing Balance", Balance: `${Math.abs(closingBalance).toFixed(2)} ${closingBalance >= 0 ? "Dr" : "Cr"}` },
    ];
    const worksheet = XLSX.utils.json_to_sheet([...dataForExport, {}, ...summaryRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Item Statement");
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
    const text = `Here is the statement for ${entityName}.`;
    try {
      let dateRangeText = "All Time";
      if (dateRange?.from) {
        const from = dateRange.from;
        const to = dateRange.to || from;
        const fromBS = formatDateBS(from);
        const toBS = formatDateBS(to);
      const fromAD = format(from, 'MMM-dd-yyyy');
      const toAD = format(to, 'MMM-dd-yyyy');
        if (dateSystem === "AD") dateRangeText = `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
        else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
        else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
      }
      const payload = {
        company: { name: company.name, pan: company.pan, phone: company.phone, address: company.address, logoUrl: company.logoUrl },
        title: `${selectedItem ? "Item" : "Item Group"} Statement: ${entityName}`,
        context: activeContext as Context,
        contextId: activeEntity.id,
        dateSystem,
        dateRangeText,
        vouchersCount: processedTransactions.length,
        openingBalance: openingBalanceForPeriod,
        transactions: processedTransactions,
        showNarration: true,
        stockView: selectedItem && reportStockView === "qty" ? ("qty" as const) : undefined,
        displayUnit: selectedItem && reportStockView === "qty" ? effectiveDisplayUnit : undefined,
        itemsData: processedItems,
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
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  };

  const handleEditVoucher = useCallback(
    (voucher: any) => {
      openingModalRef.current = true;
      setSelectedVoucher(voucher);
      openModalInUrl();
      setIsVoucherDialogOpen(true);
    },
    [openModalInUrl]
  );

  if (loading && !activeEntity) {
    return <LoadingSpinner />;
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50 overflow-hidden">
      <header className="sticky top-0 z-10 flex-shrink-0 flex flex-col gap-2 p-3 border-b bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleReportBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h1 className="shrink-0 text-base font-bold text-muted-foreground">{pageTitle}</h1>
            {activeEntity?.name ? (
              <>
                <span className="shrink-0 select-none text-muted-foreground/55" aria-hidden>
                  ·
                </span>
                <span
                  className={cn("min-w-0 truncate text-sm font-medium", masterDetailBalanceToneClass(closingBalance))}
                  title={activeEntity.name}
                >
                  {activeEntity.name}
                </span>
              </>
            ) : null}
          </div>
          {activeEntity?.name ? (
            <div className="flex-shrink-0" aria-hidden>
              {selectedItem ? (
                <ReportStatementHeaderAvatar
                  kind="item"
                  displayName={activeEntity.name}
                  fileUrl={selectedItem.fileUrls?.[0]}
                />
              ) : (
                <ReportStatementHeaderAvatar kind="group" displayName={activeEntity.name} />
              )}
            </div>
          ) : null}
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
              options={itemReportOptions}
              value={selectedItem?.id || ""}
              onChange={(value) => {
                const item = processedItems.find((p) => p.id === value);
                if (item) {
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("itemId", item.id);
                  newUrl.searchParams.delete("groupId");
                  window.history.pushState({}, "", newUrl);
                  setSelectedItem(item);
                  setSelectedGroup(null);
                }
              }}
              placeholder="Select an item"
            />
          </div>
          <div className="flex-1 min-w-0">
            <Combobox
              options={groupReportOptions}
              value={selectedGroup?.id || ""}
              onChange={(value) => {
                const group = processedItemGroups.find((g) => g.id === value);
                if (group) {
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.set("groupId", group.id);
                  newUrl.searchParams.delete("itemId");
                  window.history.pushState({}, "", newUrl);
                  setSelectedGroup(group);
                  setSelectedItem(null);
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
            {(dateSystem === "AD" || dateSystem === "Both") && (
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
                          setDateRange(r);
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
                      setDateRange(range as DateRange | undefined);
                      if (range?.from && range.to) setIsCalendarOpen(false);
                    }}
                    numberOfMonths={calendarMonths}
                  />
                </div>
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
        {view === "chart" ? (
          <div className="-mx-4 w-[calc(100%+2rem)] max-w-none flex-shrink-0">
            <RunningBalanceFullChart transactions={reportDisplayTransactions} openingBalance={openingBalanceForPeriod} />
          </div>
        ) : (
          <>
            <div className="flex flex-nowrap gap-2 pt-0.5 pb-3 overflow-x-auto scrollbar-slim-dim flex-shrink-0 items-center">
              {summaryCards.map((card) => {
                const convFactor = selectedItem && reportStockView === "qty" ? getConversionFactor(selectedItem, effectiveDisplayUnit) : 1;
                let customFormatted: string | undefined;
                if (selectedItem && reportStockView === "qty" && effectiveDisplayUnit) {
                  if (card.title === "Balance") {
                    customFormatted = `${formatQuantity(Math.abs(card.amount) / convFactor)} ${effectiveDisplayUnit}`;
                  } else if (card.title === "Sales" || card.title === "Purchases") {
                    const qtyInUnit = (card as { qty?: number }).qty != null ? (card as { qty: number }).qty / convFactor : card.amount / convFactor;
                    customFormatted = `${formatQuantity(Math.abs(qtyInUnit))} ${effectiveDisplayUnit}`;
                  }
                }
                return (
                  <React.Fragment key={card.title}>
                    <ReportSummaryCard title={card.title} amount={card.amount} color={card.color} customFormatted={customFormatted} />
                    {card.title === "Balance" && selectedItem && unitOptions.length > 0 && (
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={reportStockView === "amount" ? "amount" : effectiveDisplayUnit}
                          onValueChange={(v) => {
                            if (v === "amount") {
                              setReportStockView("amount");
                            } else {
                              setReportStockView("qty");
                              setReportDisplayUnit(v);
                            }
                          }}
                        >
                          <SelectTrigger className="h-10 min-w-[80px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">Amounts</SelectItem>
                            {unitOptions.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex flex-1 min-h-0 flex-col -mx-4 md:mx-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-0.5 md:mx-0 md:px-0" data-floating-button-scroll>
              {isMobile ? (
                <div className="pb-4">
                  <TransactionsTable
                    transactions={itemStatementMobilePaging.pageTransactions}
                    context={activeContext}
                    contextId={activeEntity?.id}
                    openingBalance={itemStatementMobilePaging.openingForPage}
                    userNames={userNames}
                    journalAccountNames={journalAccountNames}
                    accountNames={{}}
                    stockView={selectedItem ? reportStockView : "amount"}
                    displayUnit={selectedItem && reportStockView === "qty" ? effectiveDisplayUnit : undefined}
                    item={selectedItem || undefined}
                    onRowClick={handleEditVoucher}
                    openingBalanceLabel="Opening"
                    periodDr={itemStatementMobilePaging.periodDrForPage}
                    periodCr={itemStatementMobilePaging.periodCrForPage}
                    closingBalance={itemStatementMobilePaging.closingForPage}
                    openingBalanceSearch={
                      <Input
                        placeholder="Search..."
                        value={transactionSearch}
                        onChange={(e) => setTransactionSearch(e.target.value)}
                        className="h-9 w-32 max-w-[140px] text-sm"
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
                  accountNames={{}}
                  stockView={selectedItem ? reportStockView : "amount"}
                  displayUnit={selectedItem && reportStockView === "qty" ? effectiveDisplayUnit : undefined}
                  item={selectedItem || undefined}
                  onRowClick={handleEditVoucher}
                  openingBalanceLabel="Opening"
                  openingBalanceSearch={
                    <Input
                      placeholder="Search..."
                      value={transactionSearch}
                      onChange={(e) => setTransactionSearch(e.target.value)}
                      className="h-9 w-32 max-w-[140px] text-sm"
                    />
                  }
                />
              )}
            </div>
            {/* mb-12: overlap avoid with fixed footer / FAB */}
            {isMobile && view === "list" && (
              <MobileTransactionsPager
                className="flex-shrink-0 border-t bg-muted/25 mb-12"
                currentPage={itemReportPagerPage}
                totalItems={filteredReportTransactions.length}
                rowsPerPage={itemReportRowsPerPage}
                onPageChange={setItemReportPagerPage}
                onRowsPerPageChange={(n) => {
                  setItemReportRowsPerPage(n);
                  setItemReportPagerPage(1);
                }}
                edgeCounts={
                  itemStatementMobilePaging.edges.before > 0 || itemStatementMobilePaging.edges.after > 0
                    ? itemStatementMobilePaging.edges
                    : undefined
                }
              />
            )}
            </div>
          </>
        )}
      </main>

      <footer className="flex items-stretch justify-around p-1.5 border-t bg-white gap-1 fixed bottom-0 left-0 right-0">
        <PermissionButton permission="export_data" className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-green-500 hover:bg-green-600 text-white rounded-md" onClick={handlePrint}>
          <Printer className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Print</span>
        </PermissionButton>
        <PermissionButton permission="export_data" className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md" onClick={handleExcel}>
          <FileIcon className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Excel</span>
        </PermissionButton>
        <Button className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md" onClick={handleShare}>
          <Share2 className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Share</span>
        </Button>
        <Button
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-slate-500 hover:bg-slate-600 text-white rounded-md"
          onClick={() => {
            openingModalRef.current = true;
            openModalInUrl();
            setIsCalendarOpen(true);
          }}
        >
          <CalendarIcon className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Date</span>
        </Button>
        <Button className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-violet-500 hover:bg-violet-600 text-white rounded-md" onClick={() => setView((v) => (v === "list" ? "chart" : "list"))}>
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

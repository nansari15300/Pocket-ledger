
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PermissionButton } from "@/components/permission";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdCalendar from "@/components/ui/ad-calendar";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { Combobox } from "@/components/ui/combobox";
import { ArrowLeft, Calendar as CalendarIcon, ChevronDown, File, Printer, Layers, BarChart2, X } from "lucide-react";
import type { Party, Group } from "@/components/party/types";
import type { DateRange } from "@/components/ui/ad-calendar";
import { startOfMonth, endOfMonth, format, isSameDay } from "date-fns";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { useTransactions } from "@/hooks/use-transactions";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect } from "@/lib/printDirect";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import * as XLSX from 'xlsx';
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";

// Summary card outside page so it only re-renders when amount/title/color change (data change), not on parent re-renders (e.g. userNames)
const ReportSummaryCard = React.memo(function ReportSummaryCard({ title, amount, color }: { title: string; amount: number; color: string }) {
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

export default function DesktopPartyStatementPage() {
    const { processedParties, processedPartiesForSelection, processedGroups, vouchers, loading, journalAccountNames } = useVouchers();
    const { company } = useCompany();
    const { formatDateBS, formatDate, formatCurrency, dateSystem } = useDate();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const calendarMonths = useCalendarMonths();
    const openingModalRef = useRef(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
    const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
    const [transactionSearch, setTransactionSearch] = useState("");
    const [mobileSearchTerm, setMobileSearchTerm] = useState("");
    const [isDateSearchMode, setIsDateSearchMode] = useState(false);
    const [view, setView] = useState<'list' | 'chart'>('list');
    // Same preference as Party Details: Statement vs Bill wise (running balance vs per-voucher status).
    const { balanceMode, setBalanceMode } = useBalanceMode();

    const [selectedParty, setSelectedParty] = useState<Party | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const fetchedUidsRef = useRef<Set<string>>(new Set());
    
    const pageTitle = selectedGroup ? 'Party Group Report' : 'Party Report';

    const fetchUserName = useCallback(async (userId: string): Promise<string> => {
        try {
            const userDoc = await getDoc(doc(firestore, 'users', userId));
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

    const handleEditVoucher = useCallback((voucher: any) => {
        openingModalRef.current = true;
        setSelectedVoucher(voucher);
        openModalInUrl();
        setIsVoucherDialogOpen(true);
    }, [openModalInUrl]);

    useEffect(() => {
        const partyId = searchParams.get('partyId');
        const groupId = searchParams.get('groupId');

        if (partyId && processedParties.length > 0) {
            const party = processedParties.find(p => p.id === partyId);
            setSelectedParty((prev) => (prev?.id === party?.id ? prev : party || null));
            setSelectedGroup((prev) => (prev !== null ? null : prev));
        } else if (groupId && processedGroups.length > 0) {
            const group = processedGroups.find(g => g.id === groupId);
            setSelectedGroup((prev) => (prev?.id === group?.id ? prev : group || null));
            setSelectedParty((prev) => (prev !== null ? null : prev));
        } else if (processedParties.length > 0) {
            const first = processedParties[0];
            setSelectedParty((prev) => {
                if (!first) return null;
                if (prev?.id === first.id) return prev;
                if (prev && processedParties.some((p) => p.id === prev.id)) return prev;
                return first;
            });
            setSelectedGroup((prev) => (prev !== null ? null : prev));
        }
    }, [searchParams, processedParties, processedGroups]);
    
      useEffect(() => {
        if (isMobile && dateRange?.from) {
          const from = formatDate(dateRange.from);
          const to = dateRange.to ? formatDate(dateRange.to) : from;
          setMobileSearchTerm(from === to ? from + " to " + to : from);
          setIsDateSearchMode(true);
        }
      }, [dateRange, isMobile, formatDate]);
      
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
      
    const activeEntity = selectedParty || (selectedGroup ? { ...selectedGroup, items: processedParties.filter(p => p.groupId === selectedGroup.id) } : null);
    const activeContext = selectedParty ? 'party' : 'group';

    const {
        processedTransactions,
        openingBalanceForPeriod,
        periodDr,
        periodCr,
        closingBalance,
        openingBalanceOutstanding,
        openingBalanceLinkedVoucherNos,
    } = useTransactions(activeEntity as any, activeContext, dateRange);

    // Same as Party Details: when no date filter show last 10 only; when filter applied show all in range
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
          summaryData: { sales: 0, purchases: 0, moneyIn: 0, moneyOut: 0 },
          chartData: { balance: [], sales: [], purchases: [], moneyIn: [], moneyOut: [] }
        };
        if (!activeEntity) return emptyData;
        const entityVouchers = processedTransactions;

        const summary = {
            sales: entityVouchers.filter(v => v.type === 'sale').reduce((sum, v) => sum + (v.total || 0), 0),
            purchases: entityVouchers.filter(v => v.type === 'purchase').reduce((sum, v) => sum + (v.total || 0), 0),
            moneyIn: entityVouchers.filter(v => v.type === 'payment_in').reduce((sum, v) => sum + (v.amount || 0), 0),
            moneyOut: entityVouchers.filter(v => v.type === 'payment_out').reduce((sum, v) => sum + (v.amount || 0), 0),
        }
        
        const generateChartData = (type: 'sale' | 'purchase' | 'payment_in' | 'payment_out') => {
            let cumulative = 0;
            return entityVouchers.map(v => {
                if (v.type === type) {
                    cumulative += v.total || v.amount || 0;
                }
                return { date: v.date.toDate(), value: cumulative };
            });
        };

        const charts = {
            balance: entityVouchers.map(t => ({ date: t.date.toDate(), value: t.balance })),
            sales: generateChartData('sale'),
            purchases: generateChartData('purchase'),
            moneyIn: generateChartData('payment_in'),
            moneyOut: generateChartData('payment_out'),
        };

        return { summaryData: summary, chartData: charts };
    }, [processedTransactions, activeEntity]);

    // Only recompute when numeric data changes; stable so cards don't re-render on unrelated state (e.g. userNames)
    const summaryCards = useMemo(() => [
        { title: "Balance", amount: closingBalance, color: closingBalance >= 0 ? "text-green-600" : "text-red-600" },
        { title: "Sales", amount: summaryData.sales, color: "text-green-600" },
        { title: "Purchases", amount: summaryData.purchases, color: "text-red-600" },
        { title: "Money In", amount: summaryData.moneyIn, color: "text-green-600" },
        { title: "Money Out", amount: summaryData.moneyOut, color: "text-red-600" },
    ], [closingBalance, summaryData.sales, summaryData.purchases, summaryData.moneyIn, summaryData.moneyOut]);

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

        const isBillWise = balanceMode === "bill_wise";
        const baseTitle = `${selectedParty ? "Party" : "Group"} Statement: ${activeEntity.name}`;
        openPrintDirect(
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
                title: isBillWise ? `Bill Wise ${baseTitle}` : baseTitle,
                context: activeContext,
                contextId: activeEntity.id,
                dateSystem: dateSystem,
                dateRangeText,
                vouchersCount: processedTransactions.length,
                openingBalance: openingBalanceForPeriod,
                transactions: processedTransactions.map((t: any) => ({ ...t, dueDate: t.dueDate ?? t.due_date })),
                showNarration: true,
                visibleColumns: isBillWise ? { status: true } : undefined,
                billWise: isBillWise,
                ...(isBillWise && {
                    openingBalanceOutstanding,
                    openingBalanceLinkedVoucherNos,
                    vouchers,
                }),
            },
            true
        );
    };
    
    const handleExcel = () => {
        if (!activeEntity) return;
    
        const dataForExport = processedTransactions.map(t => {
            const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
            return {
                "Date (BS)": formatDateBS(d),
                "Date (AD)": formatDate(d),
                "Voucher No.": t.voucherNumber,
                "Type": t.type.replace(/_/g, ' '),
                "Narration": t.narration || "",
                "Debit": t.debit,
                "Credit": t.credit,
                "Balance": `${Math.abs(t.balance).toFixed(2)} ${t.balance >= 0 ? 'Dr' : 'Cr'}`
            };
        });

        // Add summary rows
        const summaryRows = [
            { "Date (BS)": "Opening Balance", "Balance": `${Math.abs(openingBalanceForPeriod).toFixed(2)} ${openingBalanceForPeriod >= 0 ? 'Dr' : 'Cr'}` },
            { "Date (BS)": "Total", "Debit": periodDr, "Credit": periodCr },
            { "Date (BS)": "Closing Balance", "Balance": `${Math.abs(closingBalance).toFixed(2)} ${closingBalance >= 0 ? 'Dr' : 'Cr'}` }
        ];

        const finalData = [...dataForExport, {}, ...summaryRows];

        const worksheet = XLSX.utils.json_to_sheet(finalData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Party Statement");
    
        XLSX.writeFile(workbook, `${activeEntity.name}_statement.xlsx`);
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

    // Party dropdown: report-only (Opening Balance, Owner's Capital) excluded; keep current if selected via URL
    const partyReportOptions = useMemo(() => {
        const options = processedPartiesForSelection.map((p) => ({ value: p.id, label: p.name }));
        if (selectedParty?.id && !options.some((o) => o.value === selectedParty.id)) {
            options.push({ value: selectedParty.id, label: selectedParty.name || selectedParty.id });
        }
        return options;
    }, [processedPartiesForSelection, selectedParty?.id, selectedParty?.name]);

    // Group dropdown: hide Assets, Equity, Expenses, Income, Liabilities (same as Group Details)
    const groupReportOptions = useMemo(() => {
        const exclude = ["assets", "equity", "expenses", "income", "liabilities", "liability"];
        const currentId = selectedGroup?.id;
        return processedGroups
            .filter((g) => g.id === currentId || !exclude.includes((g.name || "").trim().toLowerCase()))
            .map((g) => ({ value: g.id, label: g.name }));
    }, [processedGroups, selectedGroup?.id]);

    if (loading && !activeEntity) {
        return <LoadingSpinner />;
    }

    return (
        <div className="h-full min-h-0 flex flex-col bg-gray-50 overflow-hidden">
             <header className="sticky top-0 z-10 flex-shrink-0 flex flex-col gap-2 p-3 border-b bg-white">
                 {/* Row 1: Back | Title | Showing X of Y voucher(s) */}
                 <div className="flex items-center gap-2 min-w-0">
                    <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleReportBack}><ArrowLeft className="h-4 w-4" /></Button>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <h1 className="shrink-0 text-base font-bold">{pageTitle}</h1>
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
                    <span className="flex-shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        Showing {reportDisplayTransactions.length} of {processedTransactions.length} voucher(s)
                    </span>
                 </div>
                 {/* Row 2: Date range label (All Time or range) + reset icon when filtered */}
                 <div className="flex justify-center items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
                    {hasDateFilter && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setDateRange(undefined)} title="Clear date filter">
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    )}
                 </div>
                 {/* Row 3: Party dropdown | Group dropdown */}
                 <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <Combobox
                            options={partyReportOptions}
                            value={selectedParty?.id || ""}
                            onChange={(value) => {
                                const party = processedParties.find(p => p.id === value);
                                if (party) {
                                    const newUrl = new URL(window.location.href);
                                    newUrl.searchParams.set('partyId', party.id);
                                    newUrl.searchParams.delete('groupId');
                                    window.history.pushState({}, '', newUrl);
                                    setSelectedParty(party);
                                    setSelectedGroup(null);
                                }
                            }}
                            placeholder="Select a party"
                         />
                    </div>
                    <div className="flex-1 min-w-0">
                        <Combobox
                            options={groupReportOptions}
                            value={selectedGroup?.id || ""}
                            onChange={(value) => {
                                const group = processedGroups.find(g => g.id === value);
                                if (group) {
                                    const newUrl = new URL(window.location.href);
                                    newUrl.searchParams.set('groupId', group.id);
                                    newUrl.searchParams.delete('partyId');
                                    window.history.pushState({}, '', newUrl);
                                    setSelectedGroup(group);
                                    setSelectedParty(null);
                                }
                            }}
                            placeholder="Select a group"
                        />
                    </div>
                 </div>
            </header>

            {/* Date range drawer (opened from footer Date button) */}
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
                                />
                            </div>
                        )}
                    </div>
                    <DrawerFooter className="p-4 pt-2">
                        <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            {/* Mobile: no pb-20 so scroll extends to footer; inner pb-24 so last row clears fixed footer */}
            <main className={cn("flex-1 flex flex-col min-h-0 px-4 pt-0.5", !isMobile && "pb-20")}>
                 {view === 'chart' ? (
                     <div className="-mx-4 w-[calc(100%+2rem)] max-w-none flex-shrink-0">
                         <RunningBalanceFullChart transactions={reportDisplayTransactions} openingBalance={openingBalanceForPeriod} />
                     </div>
                 ) : (
                    <>
                        <div className="flex flex-nowrap gap-2 pt-0.5 pb-3 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
                            {summaryCards.map(card => (
                                <ReportSummaryCard key={card.title} title={card.title} amount={card.amount} color={card.color} />
                            ))}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-0.5 -mx-4 md:mx-0 md:px-0" data-floating-button-scroll>
                            {isMobile ? (
                                <div className="pb-24">
                                    <TransactionsTable
                                        transactions={filteredReportTransactions}
                                        context={activeContext}
                                        contextId={activeEntity?.id}
                                        openingBalance={openingBalanceForPeriod}
                                        openingBalanceOutstanding={openingBalanceOutstanding}
                                        openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
                                        userNames={userNames}
                                        journalAccountNames={journalAccountNames}
                                        onRowClick={handleEditVoucher}
                                        openingBalanceLabel="Opening"
                                        forceBalanceMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
                                        groupEntityType={activeContext === "group" ? "party" : undefined}
                                        visibleColumns={balanceMode === "bill_wise" ? { status: true } : undefined}
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
                                    openingBalanceOutstanding={openingBalanceOutstanding}
                                    openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
                                    userNames={userNames}
                                    journalAccountNames={journalAccountNames}
                                    onRowClick={handleEditVoucher}
                                    openingBalanceLabel="Opening"
                                    forceBalanceMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
                                    groupEntityType={activeContext === "group" ? "party" : undefined}
                                    visibleColumns={balanceMode === "bill_wise" ? { status: true } : undefined}
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
                 )}
            </main>

            <footer className="flex items-stretch justify-around p-1.5 border-t bg-white gap-1 fixed bottom-0 left-0 right-0">
                <PermissionButton permission="export_data" className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-green-500 hover:bg-green-600 text-white rounded-md" onClick={handlePrint}>
                    <Printer className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Print</span>
                </PermissionButton>
                <PermissionButton permission="export_data" className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md" onClick={handleExcel}>
                    <File className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Excel</span>
                </PermissionButton>
                {/* Bill wise / Statement: same UX as Party Details & Bank Statement/Spend wise toggle position */}
                <Button
                    type="button"
                    className={cn(
                        "flex-1 flex flex-col items-center justify-center py-1 min-w-0 rounded-md text-white",
                        balanceMode === "bill_wise" ? "bg-orange-500 hover:bg-orange-600" : "bg-violet-500 hover:bg-violet-600"
                    )}
                    onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
                >
                    <span className="text-[10px] leading-tight text-center px-0.5">{balanceMode === "bill_wise" ? "Statement" : "Bill wise"}</span>
                </Button>
                <Button className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-slate-500 hover:bg-slate-600 text-white rounded-md" onClick={() => { openingModalRef.current = true; setIsCalendarOpen(true); openModalInUrl(); }}>
                    <CalendarIcon className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Date</span>
                </Button>
                <Button className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-violet-500 hover:bg-violet-600 text-white rounded-md" onClick={() => setView(v => v === 'list' ? 'chart' : 'list')}>
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

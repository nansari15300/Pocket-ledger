"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import { format, getYear, getMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";
import { adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { DashboardScopeApplyPayload, DashboardSummaryFyPick } from "@/lib/dashboardSummaryCardScope";

export type MonthYearFilterMode = "current" | "full_fy" | "all" | "custom";

const bsMonths = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

function sameDay(a: Date | undefined, b: Date | undefined) {
    if (!a || !b) return false;
    return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function isBsMode(dateSystem: string) {
    return dateSystem === "BS";
}

export function getCurrentMonthDateRange(dateSystem: string, baseDate = new Date()): DateRange {
    if (isBsMode(dateSystem)) {
        const currentBs = adToBs(baseDate);
        const startAd = bsToAd({ y: currentBs.y, m: currentBs.m, d: 1 });
        const daysInMonth = getBSMonthDays(currentBs.y)[currentBs.m - 1];
        const endAd = bsToAd({ y: currentBs.y, m: currentBs.m, d: daysInMonth });
        return { from: startOfDay(startAd), to: endOfDay(endAd) };
    }
    const start = new Date(getYear(baseDate), getMonth(baseDate), 1);
    return { from: startOfDay(start), to: endOfDay(endOfMonth(start)) };
}

export function isCurrentMonthDateRange(dateRange: DateRange | undefined, dateSystem: string, baseDate = new Date()) {
    if (!dateRange?.from) return false;
    const current = getCurrentMonthDateRange(dateSystem, baseDate);
    return sameDay(dateRange.from, current.from) && sameDay(dateRange.to ?? dateRange.from, current.to);
}

export function formatMonthYearRangeLabel(
    dateRange: DateRange | undefined,
    dateSystem: string,
    baseDate = new Date(),
    mode?: MonthYearFilterMode,
) {
    if (mode === "full_fy") return "Full FY";
    if (!dateRange?.from) return mode === "all" ? "All Time" : "Full FY";
    if (isCurrentMonthDateRange(dateRange, dateSystem, baseDate)) return "Current Month";
    if (isBsMode(dateSystem)) {
        const bs = adToBs(dateRange.from);
        return `${bsMonths[bs.m - 1]} ${bs.y}`;
    }
    return format(dateRange.from, "MMM yyyy");
}

export function MonthYearFilter({ 
    dateRange, 
    setDateRange, 
    dateSystem,
    triggerClassName,
    filterMode,
    onFilterModeChange,
    showFullFyOption = false,
    showDashboardFyScope = false,
    dashboardFyPick = "current",
    runningFyKey = "",
    extraFyKeys = [],
    showApplyOnAll = false,
    onDashboardScopeApply,
}: { 
    dateRange: DateRange | undefined, 
    setDateRange: (range: DateRange | undefined) => void, 
    dateSystem: string;
    triggerClassName?: string;
    filterMode?: MonthYearFilterMode;
    onFilterModeChange?: (mode: MonthYearFilterMode) => void;
    /** Dashboard summary cards: Full FY in same pill as Current Month. */
    showFullFyOption?: boolean;
    /** Dashboard summary cards: FY pick inside same popover (no separate FY pill). */
    showDashboardFyScope?: boolean;
    dashboardFyPick?: DashboardSummaryFyPick;
    runningFyKey?: string;
    extraFyKeys?: string[];
    showApplyOnAll?: boolean;
    onDashboardScopeApply?: (payload: DashboardScopeApplyPayload) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<MonthYearFilterMode>(filterMode ?? 'all');
    const [localFyPick, setLocalFyPick] = useState<DashboardSummaryFyPick>(dashboardFyPick ?? "current");
    const [applyOnAll, setApplyOnAll] = useState(false);
    
    // Current Date Infos
    const today = useMemo(() => new Date(), []);
    const currentBs = adToBs(today);
    
    // Selection State
    const [selectedBsYear, setSelectedBsYear] = useState(currentBs.y);
    const [selectedBsMonth, setSelectedBsMonth] = useState(currentBs.m);
    const [selectedAdYear, setSelectedAdYear] = useState(getYear(today));
    const [selectedAdMonth, setSelectedAdMonth] = useState(getMonth(today)); // 0-11

    const bsYears = Array.from({length: 10}, (_, i) => currentBs.y - 5 + i);
    const adYears = Array.from({length: 10}, (_, i) => getYear(today) - 5 + i);
    const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Sync internal state with dateRange prop
    useEffect(() => {
        if (filterMode) {
            setMode(filterMode);
            return;
        }
        if (!dateRange?.from) {
            setMode(showFullFyOption ? 'full_fy' : 'all');
        } else {
            setMode(isCurrentMonthDateRange(dateRange, dateSystem, today) ? 'current' : 'custom');
            if (isBsMode(dateSystem)) {
                const bs = adToBs(dateRange.from);
                setSelectedBsYear(bs.y);
                setSelectedBsMonth(bs.m);
            } else {
                setSelectedAdYear(getYear(dateRange.from));
                setSelectedAdMonth(getMonth(dateRange.from));
            }
        }
    }, [dateRange, dateSystem, filterMode, showFullFyOption]);

    useEffect(() => {
        if (showDashboardFyScope) {
            setLocalFyPick(dashboardFyPick);
        }
    }, [dashboardFyPick, showDashboardFyScope, isOpen]);

    const applyFilter = () => {
        let nextRange: DateRange | undefined;
        if (mode === 'current') {
            nextRange = getCurrentMonthDateRange(dateSystem, today);
            if (!onDashboardScopeApply) {
                setDateRange(nextRange);
                onFilterModeChange?.('current');
            }
        } else if (mode === 'full_fy') {
            nextRange = undefined;
            if (!onDashboardScopeApply) {
                setDateRange(undefined);
                onFilterModeChange?.('full_fy');
            }
        } else if (mode === 'all') {
            nextRange = undefined;
            if (!onDashboardScopeApply) {
                setDateRange(undefined);
                onFilterModeChange?.('all');
            }
        } else {
            if (isBsMode(dateSystem)) {
                const startAd = bsToAd({ y: selectedBsYear, m: selectedBsMonth, d: 1 });
                const daysInMonth = getBSMonthDays(selectedBsYear)[selectedBsMonth - 1];
                const endAd = bsToAd({ y: selectedBsYear, m: selectedBsMonth, d: daysInMonth });
                nextRange = {
                    from: startOfDay(startAd),
                    to: endOfDay(endAd),
                };
            } else {
                const start = new Date(selectedAdYear, selectedAdMonth, 1);
                const end = endOfMonth(start);
                nextRange = {
                    from: startOfDay(start),
                    to: endOfDay(end),
                };
            }
            if (!onDashboardScopeApply) {
                onFilterModeChange?.('custom');
                setDateRange(nextRange);
            }
        }
        if (onDashboardScopeApply) {
            onDashboardScopeApply({
                applyOnAll,
                fyPick: showDashboardFyScope ? localFyPick : "current",
                mode,
                dateRange: nextRange,
            });
        }
        setIsOpen(false);
    };

    const displayText = useMemo(() => {
        return formatMonthYearRangeLabel(dateRange, dateSystem, today, mode);
    }, [dateRange, dateSystem, today, mode]);

    const periodOptions = useMemo(() => {
        const rows: { value: MonthYearFilterMode; label: string }[] = [
            { value: "current", label: "Current Month" },
        ];
        if (showFullFyOption) rows.push({ value: "full_fy", label: "Full FY" });
        rows.push({ value: "all", label: "All Time" });
        rows.push({ value: "custom", label: "Custom Month" });
        return rows;
    }, [showFullFyOption]);

    const fyOptionRows = useMemo(() => {
        if (!showDashboardFyScope) return [] as { value: DashboardSummaryFyPick; label: string }[];
        const rows: { value: DashboardSummaryFyPick; label: string }[] = [
            {
                value: "current",
                label: runningFyKey ? `Current FY (${runningFyKey})` : "Current FY",
            },
            { value: "all", label: "All FY" },
        ];
        for (const fyKey of extraFyKeys) {
            if (fyKey === runningFyKey) continue;
            rows.push({ value: fyKey, label: fyKey });
        }
        return rows;
    }, [showDashboardFyScope, runningFyKey, extraFyKeys]);

    const directListRowCn = (active: boolean) =>
        cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            active
                ? "border border-green-600 bg-green-50/90 font-medium text-foreground"
                : "border border-transparent hover:bg-muted/60",
        );

    return (
        <Popover
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (open && showApplyOnAll) setApplyOnAll(false);
            }}
            modal={false}
        >
            <PopoverTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className={cn("h-7 px-2 text-xs font-normal", triggerClassName)}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {displayText}
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className={cn(
                    "z-[9999]",
                    mode === "custom" ? "w-72 p-3" : "w-56 p-2",
                )} 
                align="end" 
                onClick={(e) => e.stopPropagation()}
                onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[data-radix-select-content]')) {
                        e.preventDefault();
                    }
                }}
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[data-radix-select-content]')) {
                        e.preventDefault();
                    }
                }}
            >
                <div className="space-y-2">
                    <div className="flex flex-col gap-0.5" role="listbox" aria-label="Period">
                        {periodOptions.map((opt) => {
                            const active = mode === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    className={directListRowCn(active)}
                                    onClick={() => setMode(opt.value)}
                                >
                                    <Check
                                        className={cn("h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-0")}
                                        aria-hidden
                                    />
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {showDashboardFyScope ? (
                        <div className="border-t border-border/80 pt-2">
                            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Financial year
                            </p>
                            <div className="flex flex-col gap-0.5" role="listbox" aria-label="Financial year">
                                {fyOptionRows.map((opt) => {
                                    const active = localFyPick === opt.value;
                                    return (
                                        <button
                                            key={String(opt.value)}
                                            type="button"
                                            role="option"
                                            aria-selected={active}
                                            className={directListRowCn(active)}
                                            onClick={() => setLocalFyPick(opt.value)}
                                        >
                                            <Check
                                                className={cn(
                                                    "h-4 w-4 shrink-0",
                                                    active ? "opacity-100" : "opacity-0",
                                                )}
                                                aria-hidden
                                            />
                                            <span className="truncate">{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    {mode === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                            {dateSystem === 'BS' ? (
                                <>
                                    <Select value={selectedBsYear.toString()} onValueChange={(v) => setSelectedBsYear(Number(v))}>
                                        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                                        <SelectContent className="z-[99999]">
                                            {bsYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={selectedBsMonth.toString()} onValueChange={(v) => setSelectedBsMonth(Number(v))}>
                                        <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                                        <SelectContent className="z-[99999]">
                                            {bsMonths.map((m, i) => <SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </>
                            ) : (
                                <>
                                    <Select value={selectedAdYear.toString()} onValueChange={(v) => setSelectedAdYear(Number(v))}>
                                        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                                        <SelectContent className="z-[99999]">
                                            {adYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={selectedAdMonth.toString()} onValueChange={(v) => setSelectedAdMonth(Number(v))}>
                                        <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                                        <SelectContent className="z-[99999]">
                                            {adMonths.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}
                        </div>
                    )}

                    {showApplyOnAll ? (
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="dashboard-scope-apply-on-all"
                                checked={applyOnAll}
                                onCheckedChange={(c) => setApplyOnAll(Boolean(c))}
                            />
                            <label
                                htmlFor="dashboard-scope-apply-on-all"
                                className="text-sm font-medium leading-none cursor-pointer"
                            >
                                Apply On All
                            </label>
                        </div>
                    ) : null}

                    <Button className="w-full" onClick={applyFilter}>Ok</Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

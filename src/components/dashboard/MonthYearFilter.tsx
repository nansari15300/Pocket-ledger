"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, getYear, getMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";
import { adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";

export type MonthYearFilterMode = "current" | "all" | "custom";

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

export function formatMonthYearRangeLabel(dateRange: DateRange | undefined, dateSystem: string, baseDate = new Date()) {
    if (!dateRange?.from) return "All Time";
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
    dateSystem 
}: { 
    dateRange: DateRange | undefined, 
    setDateRange: (range: DateRange | undefined) => void, 
    dateSystem: string 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<MonthYearFilterMode>('all');
    
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
        if (!dateRange?.from) {
            setMode('all');
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
    }, [dateRange, dateSystem]);

    const applyFilter = () => {
        if (mode === 'current') {
            setDateRange(getCurrentMonthDateRange(dateSystem, today));
        } else if (mode === 'all') {
            setDateRange(undefined);
        } else {
            if (isBsMode(dateSystem)) {
                const startAd = bsToAd({ y: selectedBsYear, m: selectedBsMonth, d: 1 });
                const daysInMonth = getBSMonthDays(selectedBsYear)[selectedBsMonth - 1];
                const endAd = bsToAd({ y: selectedBsYear, m: selectedBsMonth, d: daysInMonth });
                // Normalize dates to start/end of day for proper filtering
                setDateRange({ 
                    from: startOfDay(startAd), 
                    to: endOfDay(endAd) 
                });
            } else {
                const start = new Date(selectedAdYear, selectedAdMonth, 1);
                const end = endOfMonth(start);
                // Normalize dates to start/end of day for proper filtering
                setDateRange({ 
                    from: startOfDay(start), 
                    to: endOfDay(end) 
                });
            }
        }
        setIsOpen(false);
    };

    const displayText = useMemo(() => {
        return formatMonthYearRangeLabel(dateRange, dateSystem, today);
    }, [dateRange, dateSystem, today]);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
            <PopoverTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 px-2 text-xs font-normal"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {displayText}
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="w-80 p-4 z-[9999]" 
                align="end" 
                onClick={(e) => e.stopPropagation()}
                onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    // Prevent closing when clicking on Select dropdown (portal)
                    if (target.closest('[data-radix-select-content]')) {
                        e.preventDefault();
                    }
                }}
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    // Prevent closing when clicking on Select dropdown (portal)
                    if (target.closest('[data-radix-select-content]')) {
                        e.preventDefault();
                    }
                }}
            >
                <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[99999]">
                                <SelectItem value="current">Current Month</SelectItem>
                                <SelectItem value="all">All Time</SelectItem>
                                <SelectItem value="custom">Custom Month</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

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

                    <Button className="w-full" onClick={applyFilter}>Ok</Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

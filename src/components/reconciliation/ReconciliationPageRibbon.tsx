"use client";

import * as React from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import AdCalendar, { type DateRange } from "@/components/ui/ad-calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import { RECON_PAGE_TITLE } from "@/lib/reconciliation/labels";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { ArrowLeft, CalendarIcon, Info, Loader2, RefreshCw, X } from "lucide-react";

/** Legend — ribbon ke Info icon tooltip me (Share dialog jaisa). */
const RECON_PAGE_LEGEND_INFO =
  "Green rows = same date + same amount on both sides. Left = your account, Right = remote linked account.";

/** Reconciling ribbon — saare pills halka blue (Add Purchase / Share dialog jaisa). */
const reconRibbonPillBtnCn = cn(
  chromeProPillCn,
  "h-8 min-h-8 rounded-full border px-2.5 text-xs font-medium shadow-none",
);

/** Read-only range chip — button jaisa blue pill. */
const reconRibbonPillChipCn = cn(
  reconRibbonPillBtnCn,
  "inline-flex max-w-full min-w-0 items-center truncate font-normal text-muted-foreground",
);

/** Reconciling labels — muted se zyada dark + !important taaki theme override na kare */
const RECON_RIBBON_LABEL_CLASS = "!font-bold text-[11px] leading-none text-foreground/85";

/** Range label button ke upar, pill niche — ribbon stacked field. */
function ReconRibbonRangeStacked({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={RECON_RIBBON_LABEL_CLASS} data-pl-recon-label="">
        {label}
      </span>
      {children}
    </div>
  );
}

export type ReconciliationPageRibbonProps = {
  onBack: () => void;
  matchedCount: number;
  totalRows: number;
  refreshing: boolean;
  onRefresh: () => void;
  dateSystem: "AD" | "BS" | "Both";
  myDateRange: DateRange | undefined;
  tempMyDateRange: DateRange | undefined;
  isAdCalendarOpen: boolean;
  setMyDateRange: (r: DateRange | undefined) => void;
  setTempMyDateRange: (r: DateRange | undefined) => void;
  setIsAdCalendarOpen: (open: boolean) => void;
  myRangeLabel: string;
  sharedRangeLabel: string;
  calendarMonths: number;
  companyCountry?: string;
};

/** Reconciling page top ribbon — title, ranges, stats, refresh, legend properly aligned. */
export function ReconciliationPageRibbon({
  onBack,
  matchedCount,
  totalRows,
  refreshing,
  onRefresh,
  dateSystem,
  myDateRange,
  tempMyDateRange,
  isAdCalendarOpen,
  setMyDateRange,
  setTempMyDateRange,
  setIsAdCalendarOpen,
  myRangeLabel,
  sharedRangeLabel,
  calendarMonths,
  companyCountry,
}: ReconciliationPageRibbonProps) {
  /** AD range picker — BS ke right me inline (Both mode); duplicate Popover ek jagah. */
  const myAdRangePicker = (
    <Popover open={isAdCalendarOpen} onOpenChange={setIsAdCalendarOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            reconRibbonPillBtnCn,
            "max-w-full min-w-0 font-normal truncate",
            !myDateRange?.from && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
          {myDateRange?.from ? (
            myDateRange.to ? (
              <>
                {format(myDateRange.from, "LLL dd, y")} – {format(myDateRange.to, "LLL dd, y")}
              </>
            ) : (
              format(myDateRange.from, "LLL dd, y")
            )
          ) : (
            <span>{myRangeLabel}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <AdCalendar
          rangePresetSlot={
            <DateRangePresetRow
              country={companyCountry}
              onApply={(r) => {
                setMyDateRange(r);
                setTempMyDateRange(r);
                setIsAdCalendarOpen(false);
              }}
            />
          }
          valueAD={tempMyDateRange}
          isRange
          numberOfMonths={calendarMonths}
          onSelect={(adDate) => {
            const range = tempMyDateRange;
            if (!range?.from || (range.from && range.to)) {
              setTempMyDateRange({ from: adDate, to: undefined });
            } else if (adDate < range.from) {
              const next = { from: adDate, to: range.from };
              setTempMyDateRange(next);
              setMyDateRange(next);
              setIsAdCalendarOpen(false);
            } else {
              const next = { from: range.from, to: adDate };
              setTempMyDateRange(next);
              setMyDateRange(next);
              setIsAdCalendarOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <div
      data-pl-reconciliation-ribbon
      className={cn(
        "pl-chrome-card app-chrome-top-ribbon pl-chrome-tone-sky pl-dashboard-ribbon-sky shrink-0",
        "overflow-hidden rounded-lg border border-sky-300/70",
        "min-w-0",
      )}
    >
      {/* 2-col grid — right col `border-l` ledger split (50%) ke exact upar align */}
      <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 md:items-stretch">
        {/* Left 50% — Back, title, Your range (BS/AD) */}
        <div className="flex min-w-0 flex-wrap items-end gap-x-2 gap-y-2 p-2 md:p-3">
          <div className="mb-0.5 flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onBack} className={cn(reconRibbonPillBtnCn, "shrink-0")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-base font-semibold shrink-0 md:text-lg">{RECON_PAGE_TITLE}</h1>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-sky-100/80 hover:text-foreground"
                    aria-label="Reconciling legend and layout help"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  {RECON_PAGE_LEGEND_INFO}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="sr-only">{RECON_PAGE_LEGEND_INFO}</span>
          </div>

          <div className="mb-0.5 hidden h-8 w-px shrink-0 self-end bg-sky-400/70 md:block" aria-hidden />

          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-2 gap-y-1 text-xs md:flex-nowrap md:gap-x-3">
            {(dateSystem === "BS" || dateSystem === "Both") && (
              <ReconRibbonRangeStacked label={dateSystem === "Both" ? "Your range (BS)" : "Your range"}>
                <BsDatePicker
                  isRange
                  skipDateRangeThemeDetail
                  rangeEmptyLabel={myRangeLabel}
                  valueAD={myDateRange}
                  onChangeAD={(range) => setMyDateRange(range as DateRange | undefined)}
                  className={cn(reconRibbonPillBtnCn, "h-8 w-auto max-w-full min-w-0 justify-start text-left font-normal")}
                />
              </ReconRibbonRangeStacked>
            )}

            {dateSystem === "Both" && (
              <ReconRibbonRangeStacked label="Your range (AD)">{myAdRangePicker}</ReconRibbonRangeStacked>
            )}

            {dateSystem === "AD" && (
              <ReconRibbonRangeStacked label="Your range">{myAdRangePicker}</ReconRibbonRangeStacked>
            )}

            {(myDateRange?.from || myDateRange?.to) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-0.5 h-7 w-7 shrink-0"
                title="Clear your date range"
                onClick={() => setMyDateRange(undefined)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Right 50% — full-height vertical line + Their range + stats (ledger right column ke upar) */}
        <div className="flex min-h-full min-w-0 items-end gap-2 border-t border-sky-400/70 p-2 md:border-l md:border-t-0 md:p-3">
          <ReconRibbonRangeStacked label="Their range">
            <span className={reconRibbonPillChipCn} title={sharedRangeLabel}>
              {sharedRangeLabel}
            </span>
          </ReconRibbonRangeStacked>

          <div className="mb-0.5 ml-auto flex shrink-0 items-center gap-2">
            {/* Matched stats — Refresh jaisa blue pill chip */}
            <span
              className={cn(reconRibbonPillBtnCn, "inline-flex cursor-default items-center whitespace-nowrap px-3 font-medium")}
              title="Matched transaction pairs on this page"
            >
              {matchedCount} matched / {totalRows} rows
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className={reconRibbonPillBtnCn}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Refresh my ledger
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
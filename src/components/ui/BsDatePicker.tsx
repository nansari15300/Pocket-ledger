"use client";
import * as React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as Icon } from "lucide-react";
import { type BSDate, bsToAd, BS_CALENDAR_MIN_YEAR, canConvertAdDateToBs } from "@/lib/bs-date";
import type { DateRange } from "@/components/ui/ad-calendar";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useCalendarMonths } from "@/hooks/use-mobile";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";

type BsDatePickerBaseProps = {
  numberOfMonths?: number;
  transactionDates?: Date[];
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
};

type BsDatePickerConditionalProps =
  | {
      isRange?: true;
      valueAD?: DateRange;
      onChangeAD: (date?: DateRange | undefined) => void;
    }
  | {
      isRange: false;
      valueAD?: Date;
      onChangeAD: (date?: Date | undefined) => void;
    };

type BsDatePickerProps = BsDatePickerBaseProps & BsDatePickerConditionalProps;


/** AD day can convert to BS (nepali-date-converter + datex-bs extended map). */
function isValidForBS(date?: Date | null): boolean {
    if (!date) return false;
    if (!(date instanceof Date)) return false;
    return canConvertAdDateToBs(date);
}

/** AD date ko calendar noon pe — BS/ad-calendar ke saath timezone drift avoid */
function atNoon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export default function BsDatePicker({ valueAD, onChangeAD, numberOfMonths: numberOfMonthsProp, transactionDates = [], isRange: isRangeProp, disabled = false, children, className }: BsDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const { formatDateBS } = useDate();
  const { company } = useCompany();
  const calendarMonths = useCalendarMonths(); // mobile: 1 month, PC: 2 months (date range)
  const isRange = isRangeProp ?? true;
  const numberOfMonths = numberOfMonthsProp ?? (isRange ? calendarMonths : 1);
  
  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    // ✅ FINAL FIX: Do NOT use startOfDay. Use Noon (12:00 PM).
    
    // १. मितिको Year, Month, Day निकाल्ने (Timezone Issue हटाउन)
    const y = adDate.getFullYear();
    const m = adDate.getMonth();
    const d = adDate.getDate();

    // २. नयाँ मिति बनाउने तर समय १२ बजे (12:00:00) राख्ने
    // यसले गर्दा UTC मा जाँदा पनि दिन घट्दैन (किनकि 12:00 - 5:45 = 06:15 हुन्छ, जुन सोही दिन हो)
    const normalizedAdDate = new Date(y, m, d, 12, 0, 0, 0); 

    // ❌ startOfDay(normalizedAdDate) - यो प्रयोग नगर्नुहोस, यसले फेरि समस्या ल्याउँछ।

    if (!isRange) {
        (onChangeAD as (date?: Date) => void)(normalizedAdDate);
        setOpen(false);
    } else {
        const range = valueAD as DateRange | undefined;
        let newRange: DateRange | undefined;
        
        if (!range?.from || (range.from && range.to)) {
            // First date selection or reset - don't close calendar
            newRange = { from: normalizedAdDate, to: undefined };
        } else {
            // Second date selection - only close when both dates are set
            // समय १२ बजे भएकोले तुलना (Comparison) सही हुन्छ
            if (normalizedAdDate < range.from) {
                newRange = { from: normalizedAdDate, to: range.from };
            } else {
                newRange = { from: range.from, to: normalizedAdDate };
            }
            // Only close calendar when both from and to are set
            if (newRange.from && newRange.to) {
                setOpen(false);
            }
        }
        (onChangeAD as (date?: DateRange) => void)(newRange);
    }
  }

  /** Range shortcuts — top row; company country se F Y; All = BS min year se aaj tak */
  const applyRangePreset = React.useCallback(
    (preset: "7d" | "month" | "3m" | "6m" | "fy" | "all") => {
      if (!isRange) return;
      const today = new Date();
      const onRange = onChangeAD as (date?: DateRange | undefined) => void;
      let from: Date;
      let to: Date = atNoon(today);

      switch (preset) {
        case "7d":
          from = atNoon(subDays(today, 6));
          break;
        case "month":
          from = atNoon(startOfMonth(today));
          to = atNoon(endOfMonth(today));
          break;
        case "3m":
          from = atNoon(startOfMonth(subMonths(today, 2)));
          to = atNoon(endOfMonth(today));
          break;
        case "6m":
          from = atNoon(startOfMonth(subMonths(today, 5)));
          to = atNoon(endOfMonth(today));
          break;
        case "fy": {
          const { start, end } = getFiscalRangeForCountry(company?.country ?? "Nepal", today);
          from = atNoon(start);
          to = atNoon(end);
          break;
        }
        case "all":
          from = atNoon(bsToAd({ y: BS_CALENDAR_MIN_YEAR, m: 1, d: 1 }));
          to = atNoon(today);
          break;
        default:
          return;
      }
      onRange({ from, to });
      setOpen(false);
    },
    [isRange, onChangeAD, company?.country]
  );

  const displayValue = () => {
    if (children) return children;
    if (!valueAD) return isRange ? "Pick a date range" : "Pick a date";

    if (isRange) {
        const range = valueAD as DateRange | undefined;
        if (!range?.from) return "Pick a date range";
        const fromBS = isValidForBS(range.from) ? formatDateBS(range.from) : "";
        const toBS = range.to && isValidForBS(range.to) ? formatDateBS(range.to) : "";
        if (fromBS && toBS) {
          if (fromBS === toBS) return fromBS;
          return `${fromBS} - ${toBS}`;
        }
        return fromBS;
    }

    const singleDate = valueAD as Date;
    if (!isValidForBS(singleDate)) return "Select BS Date";
    return formatDateBS(singleDate);
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className={cn("w-auto justify-start text-left font-normal h-10 px-2 gap-1 min-w-0", !valueAD && "text-muted-foreground", className)} 
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-theme-detail="date-range"
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate min-w-0">{displayValue()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 z-50">
        <NepaliCalendar
            onSelect={handleNepaliSelect}
            valueAD={valueAD}
            isRange={isRange}
            numberOfMonths={numberOfMonths}
            transactionDates={transactionDates}
            disabled={disabled}
            rangePresetSlot={
              isRange ? (
                <>
                  {(
                    [
                      { key: "7d" as const, label: "7 days" },
                      { key: "month" as const, label: "Month" },
                      { key: "3m" as const, label: "3 months" },
                      { key: "6m" as const, label: "6 months" },
                      { key: "fy" as const, label: "F Y" },
                      { key: "all" as const, label: "All" },
                    ] as const
                  ).map(({ key, label }) => (
                    <Button
                      key={key}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs px-2 shrink-0"
                      disabled={disabled}
                      onClick={() => applyRangePreset(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </>
              ) : undefined
            }
        />
      </PopoverContent>
    </Popover>
  );
}
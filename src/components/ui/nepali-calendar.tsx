
"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  adToBs,
  bsToAd,
  type BSDate,
  sameBSDay,
  NEPALI_MONTHS,
  NEPALI_WEEKDAYS_SHORT,
  canConvertAdDateToBs,
  BS_CALENDAR_MIN_YEAR,
  BS_CALENDAR_MAX_YEAR,
} from "@/lib/bs-date";
import type { DateRange } from "@/components/ui/ad-calendar";
import { cn } from "@/lib/utils";
import { isSameDay, startOfDay } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { ChevronLeft, ChevronRight } from "lucide-react";


type NepaliCalendarProps = {
  valueAD?: Date | DateRange;
  onSelect?: (bs: BSDate, ad: Date) => void,
  numberOfMonths?: number,
  transactionDates?: Date[],
  isRange?: boolean,
  disabled?: boolean,
};

/** AD → BS for initial view: same rules as formatDateBS / BsDatePicker (nepali + datex-bs). */
function isInitialAdInBsRange(date?: Date | null): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
  return canConvertAdDateToBs(date);
}

export default function NepaliCalendar({ valueAD, onSelect, numberOfMonths = 2, transactionDates = [], isRange: isRangeProp, disabled = false }: NepaliCalendarProps) {
  const todayAD = new Date();
  const todayBS = adToBs(todayAD);
  const isRange = isRangeProp === undefined ? valueAD === undefined || !(valueAD instanceof Date) : isRangeProp;

  const transactionDatesSet = React.useMemo(() => new Set(transactionDates?.map(d => startOfDay(d).getTime())), [transactionDates]);

  const initialDate = React.useMemo(() => {
    let dateToConvert = todayAD;
    if (valueAD instanceof Date) {
      dateToConvert = valueAD;
    } else if (valueAD && 'from' in (valueAD as object) && (valueAD as DateRange).from) {
      dateToConvert = (valueAD as DateRange).from!;
    }
    return isInitialAdInBsRange(dateToConvert) ? adToBs(dateToConvert) : todayBS;
  }, [valueAD, todayAD, todayBS]);

  const [current, setCurrent] = React.useState<Pick<BSDate, "y" | "m">>({ y: initialDate.y, m: initialDate.m });

  const [secondMonth, setSecondMonth] = React.useState<Pick<BSDate, "y" | "m">>(() => {
    let ny = initialDate.y;
    let nm = initialDate.m + 1;
    if (initialDate.m === 12) {
      ny = initialDate.y + 1;
      nm = 1;
    }
    if (ny > BS_CALENDAR_MAX_YEAR) {
      ny = BS_CALENDAR_MAX_YEAR;
      nm = 12;
    }
    return { y: ny, m: nm };
  });

  React.useEffect(() => {
    setSecondMonth((prev) => {
      let next = current.m === 12 ? { y: current.y + 1, m: 1 } : { y: current.y, m: current.m + 1 };
      if (next.y > BS_CALENDAR_MAX_YEAR) {
        next = { y: BS_CALENDAR_MAX_YEAR, m: 12 };
      }
      if (prev.y === next.y && prev.m === next.m) return prev;
      return next;
    });
  }, [current.y, current.m]);

  const bsYearOptions = React.useMemo(
    () =>
      Array.from(
        { length: BS_CALENDAR_MAX_YEAR - BS_CALENDAR_MIN_YEAR + 1 },
        (_, i) => BS_CALENDAR_MIN_YEAR + i
      ),
    []
  );

  /** Month grid — BS years from datex-bs only (replaces old 2000–2090 cap). */
  function getMonthDays(y: number, m: number) {
    if (y < BS_CALENDAR_MIN_YEAR || y > BS_CALENDAR_MAX_YEAR) return { firstW: 0, days: [] as BSDate[] };
    try {
      const firstAD = bsToAd({ y, m, d: 1 });
      const next = m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 };
      const nextAD = bsToAd(next);
      const MS_DAY = 24 * 60 * 60 * 1000;
      const daysInMonth = Math.round((toUtcNoon(nextAD).getTime() - toUtcNoon(firstAD).getTime()) / MS_DAY);
      const firstW = firstAD.getDay();
      const days: BSDate[] = Array.from({ length: daysInMonth }, (_, i) => ({ y, m, d: i + 1 }));
      return { firstW, days };
    } catch {
      return { firstW: 0, days: [] as BSDate[] };
    }
  }

  function toUtcNoon(d: Date) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
  }

  function renderMonth(
    y: number,
    m: number,
    setMonth: (fn: (prev: Pick<BSDate, "y" | "m">) => Pick<BSDate, "y" | "m">) => void
  ) {
    const { firstW, days } = getMonthDays(y, m);
    const blanks = Array(firstW > 0 ? firstW : 0).fill(null);
    const all = [...blanks, ...days];
    while (all.length % 7 !== 0) all.push(null);
    
    const adSelectedDate = (valueAD instanceof Date) ? valueAD : undefined;
    const adRange = valueAD && 'from' in (valueAD as object) ? (valueAD as DateRange) : undefined;
    
    return (
      <div className="flex-1">
        <div className="text-center font-semibold mb-2 flex justify-between items-center px-1">
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonth((v) => {
              if (v.m === 1) {
                if (v.y <= BS_CALENDAR_MIN_YEAR) return v;
                return { y: v.y - 1, m: 12 };
              }
              return { y: v.y, m: v.m - 1 };
            })}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex gap-2">
                <Select value={String(m)} onValueChange={(newMonth) => setMonth(prev => ({...prev, m: Number(newMonth)}))}><SelectTrigger className="w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent>{NEPALI_MONTHS.map((month, index) => (<SelectItem key={month} value={String(index + 1)}>{month}</SelectItem>))}</SelectContent></Select>
                <Select value={String(y)} onValueChange={(newYear) => setMonth(prev => ({...prev, y: Number(newYear)}))}><SelectTrigger className="w-[90px] h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent>{bsYearOptions.map((year) => (<SelectItem key={year} value={String(year)}>{year}</SelectItem>))}</SelectContent></Select>
            </div>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonth((v) => {
              if (v.m === 12) {
                if (v.y >= BS_CALENDAR_MAX_YEAR) return v;
                return { y: v.y + 1, m: 1 };
              }
              return { y: v.y, m: v.m + 1 };
            })}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        <div className="grid grid-cols-7 text-xs text-gray-500">{NEPALI_WEEKDAYS_SHORT.map((w, i) => (<div key={`weekday-${i}`} className="h-7 flex items-center justify-center">{w}</div>))}</div>
        <div className="grid grid-cols-7 text-sm">
          {all.map((bs, i) => {
            if (!bs) return <div key={`empty-${i}`} className="h-9" />;
            const adDate = bsToAd(bs);
            const isToday = sameBSDay(bs, todayBS);
            const hasTransactions = transactionDatesSet.has(startOfDay(adDate).getTime());
            
            let isSelected = false;
            let isInRange = false;
            let isStart = false;
            let isEnd = false;

            if (isRange) {
              const range = valueAD as DateRange | undefined;
              if (range?.from) {
                isStart = isSameDay(adDate, range.from);
                if (range.to) {
                  isEnd = isSameDay(adDate, range.to);
                  isInRange = adDate >= range.from && adDate <= range.to;
                  isSelected = isStart || isEnd;
                } else {
                  isSelected = isStart;
                }
              }
            } else {
              const singleDate = valueAD as Date | undefined;
              if(singleDate) {
                 isSelected = isSameDay(adDate, singleDate);
              }
            }
            
            const isDaySelectedForStyle = isSelected || (isRange && isInRange);

            return (
              <button
                type="button"
                key={`day-${bs.y}-${bs.m}-${bs.d}`}
                onClick={() => onSelect?.(bs, adDate)}
                className={cn(
                  "h-9 w-9 m-auto flex items-center justify-center rounded-full transition-colors",
                  "focus:relative focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring",
                  !isSelected && !isInRange && "hover:bg-accent/80",
                  {
                    "is-today": isToday,
                    "has-transactions": hasTransactions,
                    "day_selected": isSelected,
                    "day_range_middle": isRange && isInRange && !isSelected
                  }
                )}
              >
                {bs.d}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-lg shadow-md bg-card text-card-foreground w-full">
      <div className={cn("flex flex-col md:flex-row gap-6", numberOfMonths === 1 && "justify-center")}>
        {renderMonth(current.y, current.m, setCurrent)}
        {isRange && numberOfMonths === 2 && renderMonth(secondMonth.y, secondMonth.m, setSecondMonth)}
      </div>
    </div>
  );
}

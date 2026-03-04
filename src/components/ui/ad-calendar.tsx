"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isSameDay,
  startOfDay,
  startOfMonth,
  endOfMonth,
  getDate,
  addMonths,
  getMonth,
  getYear,
} from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { ChevronLeft, ChevronRight } from "lucide-react";

const AD_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const AD_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DateRange = { from?: Date; to?: Date };

/** Cast app DateRange for react-day-picker Calendar (mode="range") selected prop. */
type RDPDateRange = import("react-day-picker").DateRange;
export function asCalendarRange(r: DateRange | undefined): RDPDateRange | undefined {
  return r as RDPDateRange | undefined;
}

type AdCalendarProps = {
  valueAD?: Date | DateRange;
  onSelect?: (ad: Date) => void;
  numberOfMonths?: number;
  transactionDates?: Date[];
  isRange?: boolean;
  disabled?: boolean;
};

function getMonthDays(year: number, month: number) {
  const first = startOfMonth(new Date(year, month, 1));
  const last = endOfMonth(first);
  const firstW = first.getDay();
  const daysInMonth = getDate(last);
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  return { firstW, days };
}

export default function AdCalendar({
  valueAD,
  onSelect,
  numberOfMonths = 2,
  transactionDates = [],
  isRange: isRangeProp,
  disabled = false,
}: AdCalendarProps) {
  const todayAD = new Date();
  const isRange =
    isRangeProp === undefined
      ? valueAD === undefined || !(valueAD instanceof Date)
      : isRangeProp;

  const transactionDatesSet = React.useMemo(
    () => new Set(transactionDates?.map((d) => startOfDay(d).getTime())),
    [transactionDates]
  );

  const initialDate = React.useMemo(() => {
    if (valueAD instanceof Date) return valueAD;
    if (valueAD && "from" in valueAD && valueAD.from) return valueAD.from;
    return todayAD;
  }, [valueAD, todayAD]);

  const [current, setCurrent] = React.useState(() => ({
    y: getYear(initialDate),
    m: getMonth(initialDate),
  }));

  const [secondMonth, setSecondMonth] = React.useState(() => {
    const next = addMonths(initialDate, 1);
    return { y: getYear(next), m: getMonth(next) };
  });

  React.useEffect(() => {
    const next = current.m === 11 ? { y: current.y + 1, m: 0 } : { y: current.y, m: current.m + 1 };
    setSecondMonth((prev) => (prev.y === next.y && prev.m === next.m ? prev : next));
  }, [current.y, current.m]);

  function renderMonth(
    year: number,
    month: number,
    setMonth: (fn: (prev: { y: number; m: number }) => { y: number; m: number }) => void
  ) {
    const { firstW, days } = getMonthDays(year, month);
    const blanks = Array(firstW).fill(null);
    const all: (Date | null)[] = [...blanks, ...days];
    while (all.length % 7 !== 0) all.push(null);

    const adRange = valueAD && "from" in valueAD ? (valueAD as DateRange) : undefined;
    const singleDate = valueAD instanceof Date ? valueAD : undefined;

    return (
      <div className="flex-1 w-full min-w-0">
        <div className="text-center font-semibold mb-2 flex justify-between items-center px-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() =>
              setMonth((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex gap-2 flex-1 justify-center min-w-0">
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth((prev) => ({ ...prev, m: Number(v) }))}
            >
              <SelectTrigger className="w-[120px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AD_MONTHS.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(year)}
              onValueChange={(v) => setMonth((prev) => ({ ...prev, y: Number(v) }))}
            >
              <SelectTrigger className="w-[90px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 80 }, (_, i) => 1950 + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() =>
              setMonth((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 text-xs text-muted-foreground">
          {AD_WEEKDAYS.map((w, i) => (
            <div key={w} className="h-7 flex items-center justify-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 text-sm">
          {all.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} className="h-9" />;
            const isToday = isSameDay(d, todayAD);
            const hasTransactions = transactionDatesSet.has(startOfDay(d).getTime());

            let isSelected = false;
            let isInRange = false;

            if (isRange && adRange) {
              if (adRange.from) {
                isSelected = isSameDay(d, adRange.from);
                if (adRange.to) {
                  isSelected = isSelected || isSameDay(d, adRange.to);
                  isInRange = d >= adRange.from && d <= adRange.to;
                }
              }
            } else if (singleDate) {
              isSelected = isSameDay(d, singleDate);
            }

            return (
              <button
                type="button"
                key={d.getTime()}
                disabled={disabled}
                onClick={() => onSelect?.(d)}
                className={cn(
                  "h-9 w-9 m-auto flex items-center justify-center rounded-full transition-colors",
                  "focus:relative focus:z-10 focus:outline-none focus:ring-2 focus:ring-ring",
                  !isSelected && !isInRange && "hover:bg-accent/80",
                  {
                    "is-today": isToday,
                    "has-transactions": hasTransactions,
                    "day_selected": isSelected,
                    "day_range_middle": isRange && isInRange && !isSelected,
                  }
                )}
              >
                {getDate(d)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-lg shadow-md bg-card text-card-foreground w-full">
      <div
        className={cn(
          "flex flex-col md:flex-row gap-6 w-full",
          numberOfMonths === 1 && "justify-center"
        )}
      >
        {renderMonth(current.y, current.m, setCurrent)}
        {isRange &&
          numberOfMonths === 2 &&
          renderMonth(secondMonth.y, secondMonth.m, setSecondMonth)}
      </div>
    </div>
  );
}

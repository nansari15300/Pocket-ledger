"use client";

import { useEffect } from "react";
import type { DateRange } from "@/components/ui/ad-calendar";

/** dateRange prop ke from/to timestamps — effect deps me poora object mat rakho. */
export function useDateRangeTimestamps(dateRange?: DateRange) {
  return {
    fromMs: dateRange?.from?.getTime(),
    toMs: dateRange?.to?.getTime(),
  };
}

/** Parent `dateRange` → local `tempDateRange` sync; same dates par re-set avoid (loop guard). */
export function useSyncTempDateRangeFromProp(
  dateRange: DateRange | undefined,
  setTempDateRange: React.Dispatch<React.SetStateAction<DateRange | undefined>>
) {
  const { fromMs, toMs } = useDateRangeTimestamps(dateRange);
  useEffect(() => {
    setTempDateRange((prev) => {
      if (prev?.from?.getTime() === fromMs && prev?.to?.getTime() === toMs) return prev;
      return dateRange;
    });
  }, [fromMs, toMs, dateRange, setTempDateRange]);
}

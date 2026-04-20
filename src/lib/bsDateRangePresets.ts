import { subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { bsToAd, BS_CALENDAR_MIN_YEAR } from "@/lib/bs-date";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";
import type { DateRange } from "@/components/ui/ad-calendar";

export type BsDateRangePresetKey = "7d" | "month" | "3m" | "6m" | "fy" | "all";

/** AD date at local noon — matches BsDatePicker / Nepali flows (timezone-safe day boundary). */
export function atNoonAd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export const BS_DATE_RANGE_PRESETS = [
  { key: "7d" as const, label: "7 days" },
  { key: "month" as const, label: "Month" },
  { key: "3m" as const, label: "3 months" },
  { key: "6m" as const, label: "6 months" },
  { key: "fy" as const, label: "F Y" },
  { key: "all" as const, label: "All" },
] as const;

export function dateRangeFromPreset(
  preset: BsDateRangePresetKey,
  options: { country?: string | null }
): DateRange | undefined {
  const today = new Date();
  let from: Date;
  let to: Date = atNoonAd(today);

  switch (preset) {
    case "7d":
      from = atNoonAd(subDays(today, 6));
      break;
    case "month":
      from = atNoonAd(startOfMonth(today));
      to = atNoonAd(endOfMonth(today));
      break;
    case "3m":
      from = atNoonAd(startOfMonth(subMonths(today, 2)));
      to = atNoonAd(endOfMonth(today));
      break;
    case "6m":
      from = atNoonAd(startOfMonth(subMonths(today, 5)));
      to = atNoonAd(endOfMonth(today));
      break;
    case "fy": {
      const { start, end } = getFiscalRangeForCountry(options.country ?? "Nepal", today);
      from = atNoonAd(start);
      to = atNoonAd(end);
      break;
    }
    case "all":
      from = atNoonAd(bsToAd({ y: BS_CALENDAR_MIN_YEAR, m: 1, d: 1 }));
      to = atNoonAd(today);
      break;
    default:
      return undefined;
  }
  return { from, to };
}

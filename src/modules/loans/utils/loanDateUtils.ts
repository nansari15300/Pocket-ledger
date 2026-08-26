import { FREQUENCY_MONTHS, type PAYMENT_FREQUENCIES } from "../constants/loanConstants";
import type { PaymentDayMode, PaymentFrequency } from "../types/loanTypes";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date at noon — avoids UTC off-by-one. */
export function parseIsoDate(iso: string): Date {
  const match = String(iso || "").trim().match(ISO_DATE);
  if (!match) throw new Error(`Invalid date: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new Error(`Invalid calendar date: ${iso}`);
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return formatIsoDate(new Date());
}

export function isValidIsoDate(iso: string): boolean {
  try {
    parseIsoDate(iso);
    return true;
  } catch {
    return false;
  }
}

/** Date-only ISO stays local noon; timestamps use the local calendar day. */
export function tryParseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length === 10 && ISO_DATE.test(s)) {
    try {
      return parseIsoDate(s);
    } catch {
      return null;
    }
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
}

export function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function addCalendarDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function addMonthsClamped(
  iso: string,
  months: number,
  options?: { paymentDayMode?: PaymentDayMode; paymentDay?: number }
): string {
  const date = parseIsoDate(iso);
  const mode = options?.paymentDayMode ?? "same_day";
  const requestedDay =
    mode === "custom_day" && options?.paymentDay
      ? options.paymentDay
      : date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
  const last = daysInMonth(target.getFullYear(), target.getMonth());
  if (mode === "month_end") {
    target.setDate(last);
  } else {
    target.setDate(Math.min(Math.max(1, requestedDay), last));
  }
  return formatIsoDate(target);
}

export function frequencyMonths(
  frequency: PaymentFrequency,
  customIntervalMonths = 1
): number {
  if (frequency === "custom") return Math.max(1, Math.floor(customIntervalMonths || 1));
  return FREQUENCY_MONTHS[frequency as (typeof PAYMENT_FREQUENCIES)[number]] || 1;
}

export function generateDueDates(params: {
  firstPaymentDate: string;
  installmentCount: number;
  frequency: PaymentFrequency;
  customIntervalMonths?: number;
  paymentDayMode?: PaymentDayMode;
  paymentDay?: number;
}): string[] {
  const count = Math.max(0, Math.floor(params.installmentCount));
  if (count === 0) return [];
  const step = frequencyMonths(params.frequency, params.customIntervalMonths);
  const dates: string[] = [params.firstPaymentDate];
  for (let i = 1; i < count; i++) {
    dates.push(
      addMonthsClamped(params.firstPaymentDate, step * i, {
        paymentDayMode: params.paymentDayMode,
        paymentDay: params.paymentDay,
      })
    );
  }
  return dates;
}

export function journalDateFromIso(iso: string): string {
  return formatIsoDate(parseIsoDate(iso));
}

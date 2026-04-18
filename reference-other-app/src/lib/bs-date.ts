"use client";
import NepaliDate from "nepali-date-converter";
import { ADToBS, BSToAD, getBSSupportedRange } from "datex-bs";
import type { BSFormatKey } from "@/lib/dateFormatOptions";

export type BSDate = { y: number; m: number; d: number };

// datex-bs bundled map — NepaliCalendar year dropdown + month grid must stay inside this inclusive range.
const _bsRange = getBSSupportedRange();
export const BS_CALENDAR_MIN_YEAR = _bsRange.minYear;
export const BS_CALENDAR_MAX_YEAR = _bsRange.maxYear;

// Helper to check if a date is a valid JS Date
const isValidDate = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());

/** BS day from AD — datex-bs extended map (BS ~1977–2200); use Date object for local calendar day (string path is UTC). */
function fallbackBsFromAd(date: Date): BSDate {
  const bsStr = ADToBS(date);
  const [y, m, d] = bsStr.split("-").map(Number);
  if (!y || !m || !d) throw new Error("ADToBS parse");
  return { y, m, d };
}

/** Today in BS when input invalid — avoids broken pickers. */
function fallbackBsToday(): BSDate {
  const today = new NepaliDate();
  const bs = today.getBS();
  return { y: bs.year, m: bs.month + 1, d: bs.date };
}

export function adToBs(date: Date): BSDate {
  if (!isValidDate(date)) {
    return fallbackBsToday();
  }
  try {
    const nd = new NepaliDate(date);
    const bs = nd.getBS();
    return { y: bs.year, m: bs.month + 1, d: bs.date };
  } catch {
    try {
      return fallbackBsFromAd(date);
    } catch {
      return fallbackBsToday();
    }
  }
}

export function bsToAd(bs: BSDate): Date {
  try {
    // NepaliDate constructor uses 0-indexed months (0 = Baisakh, 11 = Chaitra)
    const ad = new NepaliDate(bs.y, bs.m - 1, bs.d).getAD();
    return new Date(ad.year, ad.month, ad.date);
  } catch {
    const bsStr = `${bs.y}-${String(bs.m).padStart(2, "0")}-${String(bs.d).padStart(2, "0")}`;
    const adIso = BSToAD(bsStr);
    const [y, m, d] = adIso.split("-").map(Number);
    if (!y || !m || !d) throw new Error("BSToAD parse");
    // Local Gregorian day — consistent with NepaliDate.getAD(), not UTC-from-ISO shift.
    return new Date(y, m - 1, d);
  }
}

/**
 * Returns an array of days for each month in the given BS year.
 * e.g., [31, 32, 31, 32, 31, 30, 29, 30, 29, 30, 29, 30]
 */
export function getBSMonthDays(bsYear: number): number[] {
  const daysInMonths: number[] = [];
  
  for (let m = 1; m <= 12; m++) {
    // 1. Get AD date for the 1st of the current month
    const currentMonthStartAD = bsToAd({ y: bsYear, m: m, d: 1 });

    // 2. Get AD date for the 1st of the next month
    // If current is Chaitra (12), next is Baisakh (1) of next year
    const nextYear = m === 12 ? bsYear + 1 : bsYear;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextMonthStartAD = bsToAd({ y: nextYear, m: nextMonth, d: 1 });

    // 3. The difference in milliseconds divided by one day gives the number of days
    const diffTime = nextMonthStartAD.getTime() - currentMonthStartAD.getTime();
    const days = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    daysInMonths.push(days);
  }

  return daysInMonths;
}

export const NEPALI_MONTHS = ["Baisakh","Jestha","Asar","Shrawan","Bhadra","Aswin","Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];
export const NEPALI_WEEKDAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/** 2-digit pad — matches NepaliDate-style numeric BS segments. */
function padBsPart(n: number) {
  return String(n).padStart(2, "0");
}

/** BS display for one calendar day — keys match BS_DATE_FORMATS / NepaliDate.format. */
function formatBsYmdWithKey(y: number, m: number, d: number, fmt: BSFormatKey): string {
  const monthFull = NEPALI_MONTHS[m - 1] ?? "";
  const monthShort = monthFull.slice(0, 3);
  switch (fmt) {
    case "MM-DD-YYYY":
      return `${padBsPart(m)}-${padBsPart(d)}-${y}`;
    case "DD-MM-YYYY":
      return `${padBsPart(d)}-${padBsPart(m)}-${y}`;
    case "YYYY-MM-DD":
      return `${y}-${padBsPart(m)}-${padBsPart(d)}`;
    case "DD/MM/YYYY":
      return `${padBsPart(d)}/${padBsPart(m)}/${y}`;
    case "MMMM DD, YYYY":
      return `${monthFull} ${d}, ${y}`;
    case "MMM DD, YYYY":
      return `${monthShort} ${d}, ${y}`;
    default: {
      const _exhaustive: never = fmt;
      return `${y}-${padBsPart(m)}-${padBsPart(d)}`;
    }
  }
}

/**
 * BS label for an AD Date: nepali-date-converter first, then datex-bs (~BS 1977–2200).
 * Empty string if out of range (caller should fall back to AD).
 */
export function formatBsFromAD(date: Date, fmt: BSFormatKey): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  try {
    return new NepaliDate(date).format(fmt);
  } catch {
    try {
      const bsStr = ADToBS(date);
      const [y, m, d] = bsStr.split("-").map(Number);
      if (!y || !m || !d) return "";
      return formatBsYmdWithKey(y, m, d, fmt);
    } catch {
      return "";
    }
  }
}

/** Whether this AD day can be converted for BS UI (picker label + lists). */
export function canConvertAdDateToBs(date: Date): boolean {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  try {
    new NepaliDate(date);
    return true;
  } catch {
    try {
      ADToBS(date);
      return true;
    } catch {
      return false;
    }
  }
}

export const sameBSDay = (a?: BSDate|null,b?: BSDate|null) => !!a && !!b && a.y===b.y && a.m===b.m && a.d===b.d;

export function toNepaliDigits(n: number | string) {
    if (typeof n === 'number') {
        n = n.toString();
    }
    const nepaliDigits = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
    return n.replace(/[0-9]/g, (digit) => nepaliDigits[parseInt(digit, 10)]);
}
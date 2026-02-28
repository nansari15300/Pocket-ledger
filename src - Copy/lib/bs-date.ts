"use client";
import NepaliDate from "nepali-date-converter";

export type BSDate = { y: number; m: number; d: number };

// Helper to check if a date is a valid JS Date
const isValidDate = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());

export function adToBs(date: Date): BSDate {
  if (!isValidDate(date)) {
    const today = new NepaliDate();
    const bs = today.getBS();
    return { y: bs.year, m: bs.month + 1, d: bs.date };
  }
  const nd = new NepaliDate(date);
  const bs = nd.getBS();
  return { y: bs.year, m: bs.month + 1, d: bs.date };
}

export function bsToAd(bs: BSDate): Date {
  // NepaliDate constructor uses 0-indexed months (0 = Baisakh, 11 = Chaitra)
  const ad = new NepaliDate(bs.y, bs.m - 1, bs.d).getAD();
  return new Date(ad.year, ad.month, ad.date);
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

export const sameBSDay = (a?: BSDate|null,b?: BSDate|null) => !!a && !!b && a.y===b.y && a.m===b.m && a.d===b.d;

export function toNepaliDigits(n: number | string) {
    if (typeof n === 'number') {
        n = n.toString();
    }
    const nepaliDigits = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
    return n.replace(/[0-9]/g, (digit) => nepaliDigits[parseInt(digit, 10)]);
}
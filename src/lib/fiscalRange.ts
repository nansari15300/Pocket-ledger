/**
 * Running fiscal year (AD) by country — same rules as company create form.
 * Nepal: BS Shrawan 1 → Asar last day; others: templates (India Apr–Mar, etc.).
 */
import { adToBs, bsToAd, getBSMonthDays } from "@/lib/bs-date";

type FiscalTemplate = {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
};

function getFiscalTemplateForCountry(country?: string): FiscalTemplate {
  const normalized = (country || "").trim().toLowerCase();
  if (normalized === "india") return { startMonth: 3, startDay: 1, endMonth: 2, endDay: 31 };
  if (
    normalized === "bangladesh" ||
    normalized === "pakistan" ||
    normalized === "australia" ||
    normalized === "new zealand"
  ) {
    return { startMonth: 6, startDay: 1, endMonth: 5, endDay: 30 };
  }
  return { startMonth: 0, startDay: 1, endMonth: 11, endDay: 31 };
}

/** Running fiscal start/end (AD) for `baseDate` — BsDatePicker shortcuts / company defaults ke liye */
export function getFiscalRangeForCountry(country?: string, baseDate: Date = new Date()) {
  const normalized = (country || "").trim().toLowerCase();
  if (normalized === "nepal") {
    const bsToday = adToBs(baseDate);
    const runningStartYear = bsToday.m >= 4 ? bsToday.y : bsToday.y - 1;
    const runningEndYear = runningStartYear + 1;
    const asarDays = getBSMonthDays(runningEndYear)[2] || 32;
    return {
      start: bsToAd({ y: runningStartYear, m: 4, d: 1 }),
      end: bsToAd({ y: runningEndYear, m: 3, d: asarDays }),
    };
  }

  const template = getFiscalTemplateForCountry(country);
  const isCrossYear =
    template.endMonth < template.startMonth ||
    (template.endMonth === template.startMonth && template.endDay < template.startDay);
  const year = baseDate.getFullYear();

  let startYear = year;
  let start = new Date(startYear, template.startMonth, template.startDay);
  let end = new Date(isCrossYear ? startYear + 1 : startYear, template.endMonth, template.endDay);

  if (baseDate < start) {
    startYear = startYear - 1;
    start = new Date(startYear, template.startMonth, template.startDay);
    end = new Date(isCrossYear ? startYear + 1 : startYear, template.endMonth, template.endDay);
  } else if (baseDate > end) {
    startYear = startYear + 1;
    start = new Date(startYear, template.startMonth, template.startDay);
    end = new Date(isCrossYear ? startYear + 1 : startYear, template.endMonth, template.endDay);
  }
  return { start, end };
}

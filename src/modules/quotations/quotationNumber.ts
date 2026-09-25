import { adToBs } from "@/lib/bs-date";
import { getFiscalRangeForCompany } from "@/lib/fiscalRange";

export type QuotationFyCompany = {
  country?: string;
  fiscalYearStart?: unknown;
  fiscalYearEnd?: unknown;
} | null | undefined;

function asDate(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (raw && typeof raw === "object" && "toDate" in raw) {
    try {
      const d = (raw as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Short FY token used in QT numbers — e.g. 2083/84 → `83-84`. */
export function quotationFyShort(company: QuotationFyCompany, date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const nepalish = !company?.country || company.country === "Nepal";
  if (nepalish) {
    const bs = adToBs(date);
    const startYear = bs.m >= 4 ? bs.y : bs.y - 1;
    return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
  }
  const start = asDate(company?.fiscalYearStart);
  const end = asDate(company?.fiscalYearEnd);
  const range = getFiscalRangeForCompany(
    company?.country,
    date,
    start && end ? { fiscalYearStart: start, fiscalYearEnd: end } : null
  );
  let startYear = range.start.getFullYear();
  let endYear = range.end.getFullYear();
  if (endYear <= startYear) endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

export function formatQuotationNumber(fy: string, serial: number): string {
  return `QT-${fy}-${String(Math.max(1, serial)).padStart(3, "0")}`;
}

export function nextQuotationNumber(
  existing: { quotationNumber?: string }[],
  company: QuotationFyCompany,
  date: Date = new Date()
): string {
  const fy = quotationFyShort(company, date) || "00-00";
  const fyRe = new RegExp(`^QT-${fy.replace(/-/g, "\\-")}-(\\d+)$`, "i");
  let max = 0;
  for (const row of existing) {
    const num = String(row.quotationNumber || "").trim();
    const fyMatch = num.match(fyRe);
    if (fyMatch) {
      const n = Number(fyMatch[1]);
      if (Number.isFinite(n) && n > max) max = n;
      continue;
    }
    const old = num.match(/^QT-(\d+)$/i);
    if (old) {
      const n = Number(old[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return formatQuotationNumber(fy, max + 1);
}

/** Keep serial, swap FY when the letter date moves to another year. */
export function retagQuotationNumberFy(
  current: string,
  company: QuotationFyCompany,
  date: Date
): string {
  const fy = quotationFyShort(company, date);
  if (!fy) return current;
  const cur = String(current || "").trim();
  const fyMatch = cur.match(/^QT-\d{2}-\d{2}-(\d+)$/i);
  if (fyMatch) return formatQuotationNumber(fy, Number(fyMatch[1]));
  const old = cur.match(/^QT-(\d+)$/i);
  if (old) return formatQuotationNumber(fy, Number(old[1]));
  return cur || formatQuotationNumber(fy, 1);
}

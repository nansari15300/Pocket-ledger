import { format } from "date-fns";
import { adToBs } from "@/lib/bs-date";

/**
 * Nepal FY tag (Shrawan–Ashadh): Chaitra 2082 → FY 2082/83 boundary rule.
 * Month 1–3 BS = pehle saal ki FY ka end.
 */
export function nepalFiscalYearLabelFromAdDate(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const bs = adToBs(date);
  const fyStartYear = bs.m >= 4 ? bs.y : bs.y - 1;
  return `FY ${fyStartYear}/${String(fyStartYear + 1).slice(-2)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Merge partition din — neele divider ke "Start Date" ke baad BS YYYY-MM-DD (Nepal/custom) ya AD. */
export function formatFiscalMergePartitionStartDateYmd(
  company: { country?: string; fiscalYearStart?: unknown } | null | undefined,
  partitionAt: Date
): string {
  const nepalish = company?.country === "Nepal" || !!company?.fiscalYearStart;
  if (nepalish) {
    const bs = adToBs(partitionAt);
    return `${bs.y}-${pad2(bs.m)}-${pad2(bs.d)}`;
  }
  return format(partitionAt, "yyyy-MM-dd");
}

/**
 * FY merge divider row: "FY 2082/83 Start Date 2084-03-31" (BS/AD company ke hisaab se).
 * Settings optional text — suffix mein.
 */
export function buildFiscalMergePartitionBannerLabel(
  company: { country?: string; fiscalYearStart?: unknown } | null | undefined,
  partitionAt: Date,
  optionalNote?: string | null
): string {
  const note = (optionalNote && String(optionalNote).trim()) || "";
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) {
    return note || "── Closing fiscal period · New fiscal period ──";
  }
  const nepalish = company?.country === "Nepal" || !!company?.fiscalYearStart;
  const fyTag = nepalish ? nepalFiscalYearLabelFromAdDate(partitionAt) : `FY ${partitionAt.getFullYear()}`;
  const startYmd = formatFiscalMergePartitionStartDateYmd(company, partitionAt);
  const base = `${fyTag} Start Date ${startYmd}`;
  return note ? `${base} — ${note}` : base;
}

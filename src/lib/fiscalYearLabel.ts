import { format } from "date-fns";
import { adToBs } from "@/lib/bs-date";
import {
  type FyOpeningPillFormat,
  readFyOpeningPillFormat,
} from "@/lib/fyOpeningPillFormat";
import { getFiscalRangeForCompany, type CompanyFiscalYearDates } from "@/lib/fiscalRange";

export type LedgerDateSystem = "AD" | "BS" | "Both";

type FiscalCompanyLike = {
  country?: string;
  fiscalYearStart?: unknown;
  fiscalYearEnd?: unknown;
};

function companyFiscalYearDates(company: FiscalCompanyLike | null | undefined): CompanyFiscalYearDates | null {
  const start = coerceCompanyFyDate(company?.fiscalYearStart);
  const end = coerceCompanyFyDate(company?.fiscalYearEnd);
  if (!start || !end) return null;
  return { fiscalYearStart: start, fiscalYearEnd: end };
}

function coerceCompanyFyDate(raw: unknown): Date | null {
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

/** `__fiscal_partition_{ms}_…` synthetic row id → boundary ms. */
export function parseFiscalPartitionBoundaryMs(row: { id?: string } | null | undefined): number | null {
  const id = String(row?.id || "");
  const match = /^__fiscal_partition_(\d+)_/.exec(id);
  if (!match) return null;
  const ms = Number(match[1]);
  return Number.isFinite(ms) ? ms : null;
}

function bsFyYearSpan(partitionAt: Date): { startYear: number; endYear: number } {
  const bs = adToBs(partitionAt);
  const startYear = bs.m >= 4 ? bs.y : bs.y - 1;
  return { startYear, endYear: startYear + 1 };
}

function adFyYearSpan(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date
): { startYear: number; endYear: number } {
  const { start, end } = getFiscalRangeForCompany(
    company?.country,
    partitionAt,
    companyFiscalYearDates(company)
  );
  let startYear = start.getFullYear();
  let endYear = end.getFullYear();
  // Calendar-year template (Jan–Dec) on a mid-year partition → same AD year both ends (26-26). Anchor +1 FY.
  if (endYear <= startYear) endYear = startYear + 1;
  return { startYear, endYear };
}

function formatFyOpeningYearSpan(
  formatStyle: FyOpeningPillFormat,
  startYear: number,
  endYear: number
): string {
  if (formatStyle === "full") return `${startYear}-${endYear}`;
  if (formatStyle === "mixed") return `${startYear}-${String(endYear).slice(-2)}`;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

function fiscalYearShortYyRangeBs(partitionAt: Date, formatStyle: FyOpeningPillFormat = "short"): string {
  const { startYear, endYear } = bsFyYearSpan(partitionAt);
  return formatFyOpeningYearSpan(formatStyle, startYear, endYear);
}

function fiscalYearShortYyRangeAd(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  formatStyle: FyOpeningPillFormat = "short"
): string {
  const { startYear, endYear } = adFyYearSpan(company, partitionAt);
  return formatFyOpeningYearSpan(formatStyle, startYear, endYear);
}

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

function fiscalYearShortYyRange(
  company: { country?: string; fiscalYearStart?: unknown } | null | undefined,
  partitionAt: Date,
  formatStyle: FyOpeningPillFormat = "short"
): string {
  const nepalish = company?.country === "Nepal" || !!company?.fiscalYearStart;
  if (nepalish) return fiscalYearShortYyRangeBs(partitionAt, formatStyle);
  return fiscalYearShortYyRangeAd(company, partitionAt, formatStyle);
}

/** Auto voucher no FY segment — e.g. `82-83` (country + company FY template). */
export function voucherFySegmentForDate(
  company: FiscalCompanyLike | null | undefined,
  date: Date,
  formatStyle: FyOpeningPillFormat = "short"
): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  return fiscalYearShortYyRange(company, date, formatStyle);
}

/**
 * FY merge divider row: "FY 2082/83 Start Date 2084-03-31" (BS/AD company ke hisaab se).
 * Settings optional text — suffix mein.
 */
/** FY merge divider ke turant baad wali opening row pill — e.g. "fy 83-84 opening". */
export function buildFyPartitionOpeningPillLabel(
  company: { country?: string; fiscalYearStart?: unknown } | null | undefined,
  partitionAt: Date,
  formatStyle: FyOpeningPillFormat = readFyOpeningPillFormat()
): string {
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) return "fy opening";
  return `fy ${fiscalYearShortYyRange(company, partitionAt, formatStyle)} opening`;
}

export function buildFiscalMergePartitionBannerLabel(
  company: { country?: string; fiscalYearStart?: unknown } | null | undefined,
  partitionAt: Date,
  optionalNote?: string | null
): string {
  const nepalish = company?.country === "Nepal" || !!company?.fiscalYearStart;
  const defaultSystem: LedgerDateSystem = nepalish ? "BS" : "AD";
  return buildFiscalMergePartitionBannerLabelForDateSystem(
    company,
    partitionAt,
    defaultSystem,
    undefined,
    optionalNote
  );
}

function partitionBannerFyTag(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  calendar: "bs" | "ad",
  formatStyle: FyOpeningPillFormat
): string {
  const range =
    calendar === "bs"
      ? fiscalYearShortYyRangeBs(partitionAt, formatStyle)
      : fiscalYearShortYyRangeAd(company, partitionAt, formatStyle);
  return `FY ${range.replace("-", "/")}`;
}

function adDateToBsYmd(d: Date): string {
  const bs = adToBs(d);
  return `${bs.y}-${pad2(bs.m)}-${pad2(bs.d)}`;
}

function addCalendarDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export type FiscalMergePartitionBannerSplit = {
  /** Band hone wale FY — partition se ek din pehle. */
  closingEndLabel: string;
  /** Naya FY — partition start date. */
  newStartLabel: string;
};

/** Top = closing End Date; neeche = new Start Date (ledger merge divider). */
export function buildFiscalMergePartitionBannerSplitForDateSystem(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  dateSystem: LedgerDateSystem,
  formatDate?: (d: Date) => string,
  optionalNote?: string | null,
  formatStyle: FyOpeningPillFormat = readFyOpeningPillFormat()
): FiscalMergePartitionBannerSplit {
  const fallback = "── Closing fiscal period · New fiscal period ──";
  const note = (optionalNote && String(optionalNote).trim()) || "";
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) {
    const fb = note || fallback;
    return { closingEndLabel: fb, newStartLabel: fb };
  }

  const lastDayClosed = addCalendarDays(partitionAt, -1);
  const bsStartYmd = adDateToBsYmd(partitionAt);
  const bsEndYmd = adDateToBsYmd(lastDayClosed);
  const adStartFormatted = formatDate ? formatDate(partitionAt) : format(partitionAt, "yyyy-MM-dd");
  const adEndFormatted = formatDate ? formatDate(lastDayClosed) : format(lastDayClosed, "yyyy-MM-dd");

  const closingTagBs = partitionBannerFyTag(company, lastDayClosed, "bs", formatStyle);
  const closingTagAd = partitionBannerFyTag(company, lastDayClosed, "ad", formatStyle);
  const newTagBs = partitionBannerFyTag(company, partitionAt, "bs", formatStyle);
  const newTagAd = partitionBannerFyTag(company, partitionAt, "ad", formatStyle);

  let closingEndLabel: string;
  let newStartLabel: string;
  if (dateSystem === "Both") {
    closingEndLabel = `${closingTagBs} End Date ${bsEndYmd} · AD End ${adEndFormatted}`;
    newStartLabel = `${newTagBs} Start Date ${bsStartYmd} · AD Start ${adStartFormatted}`;
  } else if (dateSystem === "BS") {
    closingEndLabel = `${closingTagBs} End Date ${bsEndYmd}`;
    newStartLabel = `${newTagBs} Start Date ${bsStartYmd}`;
  } else {
    closingEndLabel = `${closingTagAd} End Date ${adEndFormatted}`;
    newStartLabel = `${newTagAd} Start Date ${adStartFormatted}`;
  }
  if (note) newStartLabel = `${newStartLabel} — ${note}`;
  return { closingEndLabel, newStartLabel };
}

/** Ledger divider — respects user date system (AD / BS / Both). */
export function buildFiscalMergePartitionBannerLabelForDateSystem(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  dateSystem: LedgerDateSystem,
  formatDate?: (d: Date) => string,
  optionalNote?: string | null,
  formatStyle: FyOpeningPillFormat = readFyOpeningPillFormat()
): string {
  const { closingEndLabel, newStartLabel } = buildFiscalMergePartitionBannerSplitForDateSystem(
    company,
    partitionAt,
    dateSystem,
    formatDate,
    optionalNote,
    formatStyle
  );
  if (closingEndLabel === newStartLabel) return closingEndLabel;
  return `${closingEndLabel} · ${newStartLabel}`;
}

/** FY opening row pills — Both: type = BS range, voucher no = AD range. */
export function buildFyOpeningPillSplit(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  dateSystem: LedgerDateSystem,
  formatStyle: FyOpeningPillFormat = readFyOpeningPillFormat()
): { typePill: string; voucherPill: string | null } {
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) {
    return { typePill: "fy opening", voucherPill: null };
  }
  const bsRange = fiscalYearShortYyRangeBs(partitionAt, formatStyle);
  const adRange = fiscalYearShortYyRangeAd(company, partitionAt, formatStyle);
  if (dateSystem === "Both") {
    return {
      typePill: `fy ${bsRange} opening`,
      voucherPill: `fy ${adRange} opening`,
    };
  }
  if (dateSystem === "BS") {
    return { typePill: `fy ${bsRange} opening`, voucherPill: null };
  }
  return { typePill: `fy ${adRange} opening`, voucherPill: null };
}

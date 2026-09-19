import { format } from "date-fns";
import { adToBs } from "@/lib/bs-date";
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

function fiscalYearShortYyRangeBs(partitionAt: Date): string {
  const bs = adToBs(partitionAt);
  const fyStartYear = bs.m >= 4 ? bs.y : bs.y - 1;
  return `${String(fyStartYear).slice(-2)}-${String(fyStartYear + 1).slice(-2)}`;
}

function fiscalYearShortYyRangeAd(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date
): string {
  const { start, end } = getFiscalRangeForCompany(
    company?.country,
    partitionAt,
    companyFiscalYearDates(company)
  );
  return `${String(start.getFullYear()).slice(-2)}-${String(end.getFullYear()).slice(-2)}`;
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
  partitionAt: Date
): string {
  const nepalish = company?.country === "Nepal" || !!company?.fiscalYearStart;
  if (nepalish) {
    const bs = adToBs(partitionAt);
    const fyStartYear = bs.m >= 4 ? bs.y : bs.y - 1;
    return `${String(fyStartYear).slice(-2)}-${String(fyStartYear + 1).slice(-2)}`;
  }
  const y = partitionAt.getFullYear();
  return `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
}

/**
 * FY merge divider row: "FY 2082/83 Start Date 2084-03-31" (BS/AD company ke hisaab se).
 * Settings optional text — suffix mein.
 */
/** FY merge divider ke turant baad wali opening row pill — e.g. "fy 83-84 opening". */
export function buildFyPartitionOpeningPillLabel(
  company: { country?: string; fiscalYearStart?: unknown } | null | undefined,
  partitionAt: Date
): string {
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) return "fy opening";
  return `fy ${fiscalYearShortYyRange(company, partitionAt)} opening`;
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

/** Ledger divider — respects user date system (AD / BS / Both). */
export function buildFiscalMergePartitionBannerLabelForDateSystem(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  dateSystem: LedgerDateSystem,
  formatDate?: (d: Date) => string,
  optionalNote?: string | null
): string {
  const note = (optionalNote && String(optionalNote).trim()) || "";
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) {
    return note || "── Closing fiscal period · New fiscal period ──";
  }
  const bs = adToBs(partitionAt);
  const bsYmd = `${bs.y}-${pad2(bs.m)}-${pad2(bs.d)}`;
  const adFormatted = formatDate ? formatDate(partitionAt) : format(partitionAt, "yyyy-MM-dd");
  const nepalish = company?.country === "Nepal" || !!company?.fiscalYearStart;
  const fyTagBs = nepalish ? nepalFiscalYearLabelFromAdDate(partitionAt) : `FY ${bs.y}/${String(bs.y + 1).slice(-2)}`;
  const { start, end } = getFiscalRangeForCompany(
    company?.country,
    partitionAt,
    companyFiscalYearDates(company)
  );
  const fyTagAd = `FY ${start.getFullYear()}/${String(end.getFullYear()).slice(-2)}`;

  let base: string;
  if (dateSystem === "Both") {
    base = `${fyTagBs} Start Date ${bsYmd} · AD ${adFormatted}`;
  } else if (dateSystem === "BS") {
    base = `${fyTagBs} Start Date ${bsYmd}`;
  } else {
    base = `${fyTagAd} Start Date ${adFormatted}`;
  }
  return note ? `${base} — ${note}` : base;
}

/** FY opening row pills — Both: type = BS range, voucher no = AD range. */
export function buildFyOpeningPillSplit(
  company: FiscalCompanyLike | null | undefined,
  partitionAt: Date,
  dateSystem: LedgerDateSystem
): { typePill: string; voucherPill: string | null } {
  if (!(partitionAt instanceof Date) || isNaN(partitionAt.getTime())) {
    return { typePill: "fy opening", voucherPill: null };
  }
  const bsRange = fiscalYearShortYyRangeBs(partitionAt);
  const adRange = fiscalYearShortYyRangeAd(company, partitionAt);
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

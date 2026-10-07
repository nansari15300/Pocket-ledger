import { startOfDay } from "date-fns";
import { adToBs } from "@/lib/bs-date";
import type { CompanyFiscalYearDates } from "@/lib/fiscalRange";
import { getAnusuchi13FyKey, getFiscalRangeForFyKey } from "@/lib/reports/anusuchi13Confirmation";

export type FiscalYearMergeRow = {
  fyKey: string;
  start: Date;
  end: Date;
  /** False for FY gaps between first/last voucher years with no transactions. */
  hasTransactions: boolean;
};

const MAX_FY_GAP_FILL_STEPS = 80;
const MAX_SUPPORTED_FY_YEAR = 99_999;

function parseFyYears(fyKey: string): [number, number] | null {
  const match = /^(\d{1,5})-(\d{1,5})$/.exec(String(fyKey || "").trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(endYear) ||
    startYear < 1 ||
    endYear < 1 ||
    startYear > MAX_SUPPORTED_FY_YEAR ||
    endYear > MAX_SUPPORTED_FY_YEAR ||
    Math.abs(endYear - startYear) > 1
  ) {
    return null;
  }
  return [startYear, endYear];
}

function nextFyKey(fyKey: string): string | null {
  const parts = parseFyYears(fyKey);
  if (!parts) return null;
  return `${parts[0] + 1}-${parts[1] + 1}`;
}

function fillFyKeysBetween(sortedVoucherKeys: string[]): string[] {
  if (!sortedVoucherKeys.length) return [];
  const out: string[] = [sortedVoucherKeys[0]];
  for (let i = 1; i < sortedVoucherKeys.length; i++) {
    const target = sortedVoucherKeys[i];
    let cursor = out[out.length - 1];
    const cursorYears = parseFyYears(cursor);
    const targetYears = parseFyYears(target);
    const yearGap = cursorYears && targetYears ? targetYears[0] - cursorYears[0] : 0;
    if (!cursorYears || !targetYears || yearGap <= 0 || yearGap > MAX_FY_GAP_FILL_STEPS) {
      if (yearGap > MAX_FY_GAP_FILL_STEPS) {
        console.warn("[FY-SCAN] skipped oversized FY gap", {
          from: cursor,
          to: target,
          yearGap,
          maxSteps: MAX_FY_GAP_FILL_STEPS,
        });
      }
      if (cursor !== target) out.push(target);
      continue;
    }
    let steps = 0;
    while (cursor !== target && steps < MAX_FY_GAP_FILL_STEPS) {
      const next = nextFyKey(cursor);
      if (!next || next === cursor) break;
      out.push(next);
      cursor = next;
      steps += 1;
    }
    if (cursor !== target && steps >= MAX_FY_GAP_FILL_STEPS) {
      console.warn("[FY-SCAN] stopped non-converging FY gap", {
        from: out[out.length - steps - 1] ?? null,
        to: target,
        maxSteps: MAX_FY_GAP_FILL_STEPS,
      });
    }
    if (out[out.length - 1] !== target) out.push(target);
  }
  return out;
}

export function firstTickableFyRowIndex(fyRows: FiscalYearMergeRow[]): number {
  return fyRows.findIndex((row) => row.hasTransactions);
}

export function isFiscalYearMergeRowTickable(fyRows: FiscalYearMergeRow[], index: number): boolean {
  const row = fyRows[index];
  if (!row?.hasTransactions) return false;
  return index !== firstTickableFyRowIndex(fyRows);
}

function voucherJsDate(date: unknown): Date | null {
  if (!date) return null;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  if (typeof date === "object" && date !== null && "toDate" in date) {
    try {
      const d = (date as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof date === "string" || typeof date === "number") {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** System calendar for FY merge labels — AD / BS / Both (Both = AD + BS). */
export type FiscalMergeDateSystem = "AD" | "BS" | "Both";

function formatFiscalBoundaryAd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${date.getDate()}`;
}

function formatFiscalBoundaryBs(date: Date): string {
  const bs = adToBs(date);
  return `${bs.y}-${pad2(bs.m)}-${bs.d}`;
}

function resolveFiscalMergeDateSystem(
  dateSystem: FiscalMergeDateSystem | boolean | undefined,
  country?: string
): FiscalMergeDateSystem {
  if (dateSystem === "AD" || dateSystem === "BS" || dateSystem === "Both") return dateSystem;
  // Legacy boolean preferBs
  if (dateSystem === true) return "BS";
  if (dateSystem === false) return "AD";
  return (country || "").trim().toLowerCase() === "nepal" ? "BS" : "AD";
}

/** e.g. Nepal BS: `2078-04-01 To 2079-03-32`; Both: `BS To BS / AD To AD` */
export function formatFiscalYearMergeRowLabel(
  country: string | undefined,
  start: Date,
  end: Date,
  dateSystem: FiscalMergeDateSystem | boolean = false
): string {
  return formatFiscalYearMergeRangeLabel(country, start, end, dateSystem);
}

/** Single boundary — Both still returns one calendar pair (`AD / BS`) for rare single-date use. */
export function formatFiscalYearMergeBoundaryDate(
  country: string | undefined,
  date: Date,
  dateSystem: FiscalMergeDateSystem | boolean = false
): string {
  const system = resolveFiscalMergeDateSystem(dateSystem, country);
  if (system === "BS") return formatFiscalBoundaryBs(date);
  if (system === "Both") return `${formatFiscalBoundaryBs(date)} / ${formatFiscalBoundaryAd(date)}`;
  return formatFiscalBoundaryAd(date);
}

/**
 * FY row / merged period range label.
 * Both → `BS start To BS end / AD start To AD end` (not interleaved per boundary).
 */
export function formatFiscalYearMergeRangeLabel(
  country: string | undefined,
  start: Date,
  end: Date,
  dateSystem: FiscalMergeDateSystem | boolean = false
): string {
  const system = resolveFiscalMergeDateSystem(dateSystem, country);
  if (system === "Both") {
    return `${formatFiscalBoundaryBs(start)} To ${formatFiscalBoundaryBs(end)} / ${formatFiscalBoundaryAd(start)} To ${formatFiscalBoundaryAd(end)}`;
  }
  if (system === "BS") {
    return `${formatFiscalBoundaryBs(start)} To ${formatFiscalBoundaryBs(end)}`;
  }
  return `${formatFiscalBoundaryAd(start)} To ${formatFiscalBoundaryAd(end)}`;
}

/** FY keys oldest → newest; gaps filled; `transactionKeys` marks voucher-backed rows. */
export function listFiscalYearMergeRowsFromFyKeySet(
  fyKeys: Iterable<string>,
  country?: string,
  transactionKeys?: Set<string>,
  companyDates?: CompanyFiscalYearDates | null,
  includeGapYears = true
): FiscalYearMergeRow[] {
  const sortedVoucherKeys = [...new Set(fyKeys)].sort((a, b) => {
    const aStart = Number(a.split("-")[0]) || 0;
    const bStart = Number(b.split("-")[0]) || 0;
    return aStart - bStart;
  });
  if (!sortedVoucherKeys.length) return [];

  const txnKeys = transactionKeys ?? new Set(sortedVoucherKeys);
  const allKeys = includeGapYears
    ? fillFyKeysBetween(sortedVoucherKeys).filter((fyKey, index, keys) => keys.indexOf(fyKey) === index)
    : sortedVoucherKeys;
  return allKeys.map((fyKey) => {
    const { start, end } = getFiscalRangeForFyKey(country, fyKey, companyDates);
    return {
      fyKey,
      start: startOfDay(start),
      end: startOfDay(end),
      hasTransactions: txnKeys.has(fyKey),
    };
  });
}

/**
 * Fiscal years from voucher dates, oldest → newest.
 * Gaps between voucher FYs are included with `hasTransactions: false`.
 */
export function listFiscalYearMergeRowsFromVouchers(
  vouchers: Array<{ date?: unknown }>,
  country?: string,
  companyDates?: CompanyFiscalYearDates | null
): FiscalYearMergeRow[] {
  const voucherKeys = new Set<string>();
  for (const v of vouchers) {
    const d = voucherJsDate(v.date);
    if (d) voucherKeys.add(getAnusuchi13FyKey(country, d, companyDates));
  }
  return listFiscalYearMergeRowsFromFyKeySet(voucherKeys, country, voucherKeys, companyDates);
}

/**
 * Ticked FY = naya merged period yahan se start.
 * Unticked FY pichhle ticked period me merge.
 * Partition divider = har ticked FY ka start (pehli row ke alawa).
 */
export function mergePartitionDatesFromTickedFyKeys(
  fyRows: FiscalYearMergeRow[],
  tickedFyKeys: Set<string> | string[]
): Date[] {
  if (!fyRows.length) return [];
  const ticked = tickedFyKeys instanceof Set ? tickedFyKeys : new Set(tickedFyKeys);
  const partitions: Date[] = [];
  for (let i = 1; i < fyRows.length; i++) {
    const row = fyRows[i];
    if (ticked.has(row.fyKey)) {
      partitions.push(startOfDay(row.start));
    }
  }
  return partitions;
}

/** Saved partition ISO list → ticked FY keys (legacy single partition supported). */
export function inferTickedFyKeysFromPartitions(
  fyRows: FiscalYearMergeRow[],
  partitionIsos: string[] | null | undefined
): Set<string> {
  const ticked = new Set<string>();
  if (!fyRows.length) return ticked;
  const firstWithTxn = fyRows.find((row) => row.hasTransactions);
  if (firstWithTxn) ticked.add(firstWithTxn.fyKey);
  const isos = (partitionIsos ?? []).filter(Boolean);
  if (!isos.length) return ticked;

  const boundaries = isos
    .map((iso) => startOfDay(new Date(iso)).getTime())
    .filter((t) => Number.isFinite(t));

  for (const row of fyRows) {
    const rowStart = startOfDay(row.start).getTime();
    if (boundaries.some((b) => b === rowStart)) {
      ticked.add(row.fyKey);
    }
  }
  return ticked;
}

/** Run split: har FY row alag merged period (sab tick). */
export function buildAllFySplitTickedKeys(fyRows: FiscalYearMergeRow[]): Set<string> {
  return normalizeTickedFyKeys(fyRows, new Set(fyRows.map((row) => row.fyKey)));
}

/** True when merge mode has every FY row ticked (har FY alag period). */
export function isAllFySplitComplete(
  fyRows: FiscalYearMergeRow[],
  tickedFyKeys: Set<string> | string[]
): boolean {
  if (!fyRows.length) return false;
  const ticked = normalizeTickedFyKeys(
    fyRows,
    tickedFyKeys instanceof Set ? tickedFyKeys : new Set(tickedFyKeys)
  );
  return fyRows.every((row) => ticked.has(row.fyKey));
}

/** Default: sirf pehla FY ticked — baaki sab ek period me merge. */
export function defaultTickedFyKeys(fyRows: FiscalYearMergeRow[]): Set<string> {
  const ticked = new Set<string>();
  const firstWithTxn = fyRows.find((row) => row.hasTransactions);
  if (firstWithTxn) ticked.add(firstWithTxn.fyKey);
  return ticked;
}

export function normalizeTickedFyKeys(
  fyRows: FiscalYearMergeRow[],
  ticked: Set<string>
): Set<string> {
  const next = new Set<string>();
  if (!fyRows.length) return next;
  const firstWithTxn = fyRows.find((row) => row.hasTransactions);
  if (firstWithTxn) next.add(firstWithTxn.fyKey);
  for (const row of fyRows) {
    if (ticked.has(row.fyKey)) next.add(row.fyKey);
  }
  return next;
}

export type FiscalMergeRowVisual = {
  dimmed: boolean;
  highlightStart: boolean;
  highlightEnd: boolean;
};

/** Merged period block: start date + end date highlight; beech ki rows dim. */
export function buildFiscalMergeRowVisuals(
  fyRows: FiscalYearMergeRow[],
  tickedFyKeys: Set<string> | string[]
): FiscalMergeRowVisual[] {
  const visuals: FiscalMergeRowVisual[] = fyRows.map(() => ({
    dimmed: false,
    highlightStart: false,
    highlightEnd: false,
  }));
  if (!fyRows.length) return visuals;

  const ticked = normalizeTickedFyKeys(
    fyRows,
    tickedFyKeys instanceof Set ? tickedFyKeys : new Set(tickedFyKeys)
  );
  const periodStarts: number[] = [];
  for (let i = 0; i < fyRows.length; i++) {
    if (ticked.has(fyRows[i].fyKey)) periodStarts.push(i);
  }

  for (let p = 0; p < periodStarts.length; p++) {
    const startIdx = periodStarts[p];
    const endIdx = p + 1 < periodStarts.length ? periodStarts[p + 1] - 1 : fyRows.length - 1;

    if (startIdx === endIdx) {
      visuals[startIdx].highlightStart = true;
      visuals[startIdx].highlightEnd = true;
      continue;
    }

    visuals[startIdx].highlightStart = true;
    visuals[endIdx].highlightEnd = true;
    for (let i = startIdx + 1; i < endIdx; i++) {
      visuals[i].dimmed = true;
    }
  }

  return visuals;
}

export type FiscalMergePeriod = {
  serial: number;
  start: Date;
  end: Date;
  fyKeys: string[];
};

/** Ticked FY keys se merged period blocks (partition ke baad dikhne wali ranges). */
export function buildFiscalMergePeriods(
  fyRows: FiscalYearMergeRow[],
  tickedFyKeys: Set<string> | string[]
): FiscalMergePeriod[] {
  if (!fyRows.length) return [];

  const ticked = normalizeTickedFyKeys(
    fyRows,
    tickedFyKeys instanceof Set ? tickedFyKeys : new Set(tickedFyKeys)
  );
  const periodStarts: number[] = [];
  for (let i = 0; i < fyRows.length; i++) {
    if (ticked.has(fyRows[i].fyKey)) periodStarts.push(i);
  }

  return periodStarts.map((startIdx, p) => {
    const endIdx = p + 1 < periodStarts.length ? periodStarts[p + 1] - 1 : fyRows.length - 1;
    const slice = fyRows.slice(startIdx, endIdx + 1);
    return {
      serial: p + 1,
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      fyKeys: slice.map((row) => row.fyKey),
    };
  });
}

/** Ticked FY row index → merged period (right column aligned with tick row). */
export function buildFiscalMergePeriodsByRowIndex(
  fyRows: FiscalYearMergeRow[],
  tickedFyKeys: Set<string> | string[]
): Map<number, FiscalMergePeriod> {
  const periods = buildFiscalMergePeriods(fyRows, tickedFyKeys);
  const ticked = normalizeTickedFyKeys(
    fyRows,
    tickedFyKeys instanceof Set ? tickedFyKeys : new Set(tickedFyKeys)
  );
  const map = new Map<number, FiscalMergePeriod>();
  let periodIndex = 0;
  for (let i = 0; i < fyRows.length; i++) {
    if (ticked.has(fyRows[i].fyKey)) {
      const period = periods[periodIndex];
      if (period) map.set(i, period);
      periodIndex++;
    }
  }
  return map;
}

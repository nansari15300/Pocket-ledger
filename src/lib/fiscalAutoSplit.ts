import { differenceInCalendarDays, startOfDay } from "date-fns";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { type CompanyFiscalYearDates, getFiscalRangeForCompany } from "@/lib/fiscalRange";
import {
  defaultTickedFyKeys,
  listFiscalYearMergeRowsFromFyKeySet,
  mergePartitionDatesFromTickedFyKeys,
  normalizeTickedFyKeys,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";
import {
  getLocalFiscalSplitOrDefaults,
  writeLocalFiscalSplit,
  type LocalFiscalSplitPayload,
} from "@/lib/localFiscalSplitStore";
import { persistFiscalSplitSettingsToCompany } from "@/lib/persistFiscalSplitSettings";

/** 45 full days in running FY spent → auto split on calendar day 46 (inclusive). */
export const FISCAL_AUTO_SPLIT_TRIGGER_DAY = 46;

export function localCalendarDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getRunningFyElapsedDays(
  country?: string,
  today = new Date(),
  companyDates?: CompanyFiscalYearDates | null
): { fyKey: string; fyStart: Date; elapsedDays: number } {
  const { start } = getFiscalRangeForCompany(country, today, companyDates);
  const fyStart = startOfDay(start);
  const fyKey = getAnusuchi13FyKey(country, today, companyDates);
  const elapsedDays = differenceInCalendarDays(startOfDay(today), fyStart) + 1;
  return { fyKey, fyStart, elapsedDays };
}

export function shouldTriggerFiscalAutoSplit(
  country?: string,
  today = new Date(),
  companyDates?: CompanyFiscalYearDates | null
): boolean {
  return getRunningFyElapsedDays(country, today, companyDates).elapsedDays >= FISCAL_AUTO_SPLIT_TRIGGER_DAY;
}

/** Voucher FY rows + running FY (real today) so auto split can tick current year even with no vouchers yet. */
export function listFiscalYearMergeRowsForAutoSplit(
  vouchers: Array<{ date?: unknown }>,
  country?: string,
  today = new Date(),
  companyDates?: CompanyFiscalYearDates | null
): FiscalYearMergeRow[] {
  const voucherKeys = new Set<string>();
  for (const v of vouchers) {
    const d = voucherJsDate(v.date);
    if (d) voucherKeys.add(getAnusuchi13FyKey(country, d, companyDates));
  }
  const runningKey = getAnusuchi13FyKey(country, today, companyDates);
  const keys = new Set(voucherKeys);
  keys.add(runningKey);
  return listFiscalYearMergeRowsFromFyKeySet(keys, country, voucherKeys, companyDates);
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

function buildAutoSplitPayload(
  current: LocalFiscalSplitPayload,
  fyRows: FiscalYearMergeRow[],
  runningFyKey: string
): LocalFiscalSplitPayload {
  const ticked =
    current.fiscalSplitMode === "merge" && current.fiscalMergeTickedFyKeys?.length
      ? normalizeTickedFyKeys(fyRows, new Set(current.fiscalMergeTickedFyKeys))
      : defaultTickedFyKeys(fyRows);

  const nextTicked = normalizeTickedFyKeys(fyRows, new Set([...ticked, runningFyKey]));
  // Running FY may have no voucher transactions — still store as ticked for partition + UI.
  const partitionDates = mergePartitionDatesFromTickedFyKeys(fyRows, nextTicked);
  const partitionIsos = partitionDates.map((d) => startOfDay(d).toISOString());

  return {
    ...current,
    fiscalSplitMode: "merge",
    fiscalMergePartitionAtIso: partitionIsos[0] ?? null,
    fiscalMergePartitionAtIsos: partitionIsos.length ? partitionIsos : null,
    fiscalMergeTickedFyKeys: [...nextTicked],
    fiscalPartitionLabel: null,
    fiscalAutoSplitEnabled: true,
  };
}

/**
 * Silent daily check (real calendar date): on day 46+ of running FY, enable merge split at running FY start
 * unless the user already saved fiscal split settings manually on this device.
 */
type FiscalAutoSplitCompany = {
  id?: string;
  country?: string;
  storageOption?: string | null;
  syncedFromCloud?: boolean;
  syncPolicy?: string | null;
  plServerShared?: boolean;
  authoritativeCompanyId?: string;
};

function persistAutoSplitPayload(
  companyId: string,
  company: FiscalAutoSplitCompany | null | undefined,
  payload: LocalFiscalSplitPayload
): void {
  if (!company) return;
  void persistFiscalSplitSettingsToCompany({
    companyId,
    company,
    payload,
  }).catch((err) => {
    console.warn("[fiscalAutoSplit] persist fiscal split", err);
  });
}

export function runFiscalAutoSplitDailyCheck(options: {
  companyId: string;
  company?: FiscalAutoSplitCompany | null;
  country?: string;
  companyDates?: CompanyFiscalYearDates | null;
  vouchers: Array<{ date?: unknown }>;
  today?: Date;
}): boolean {
  const today = options.today ?? new Date();
  const dayKey = localCalendarDayKey(today);
  const current = getLocalFiscalSplitOrDefaults(options.companyId);

  if (current.fiscalAutoSplitLastCheckDay === dayKey) return false;

  const afterCheck = { ...current, fiscalAutoSplitLastCheckDay: dayKey };

  const shouldApply =
    current.fiscalAutoSplitEnabled &&
    !current.fiscalSplitConfiguredByUser &&
    shouldTriggerFiscalAutoSplit(options.country, today, options.companyDates);

  if (!shouldApply) {
    writeLocalFiscalSplit(options.companyId, afterCheck);
    return false;
  }

  const { fyKey: runningFyKey } = getRunningFyElapsedDays(options.country, today, options.companyDates);
  const fyRows = listFiscalYearMergeRowsForAutoSplit(
    options.vouchers,
    options.country,
    today,
    options.companyDates
  );
  if (!fyRows.length) {
    writeLocalFiscalSplit(options.companyId, afterCheck);
    return false;
  }

  const existingTicked =
    current.fiscalSplitMode === "merge" && current.fiscalMergeTickedFyKeys?.length
      ? normalizeTickedFyKeys(fyRows, new Set(current.fiscalMergeTickedFyKeys))
      : defaultTickedFyKeys(fyRows);

  if (existingTicked.has(runningFyKey) && current.fiscalSplitMode === "merge") {
    writeLocalFiscalSplit(options.companyId, afterCheck);
    return false;
  }

  const next = buildAutoSplitPayload(current, fyRows, runningFyKey);
  const saved = { ...next, fiscalAutoSplitLastCheckDay: dayKey };
  writeLocalFiscalSplit(options.companyId, saved);
  persistAutoSplitPayload(options.companyId, options.company, saved);
  return true;
}

import { isSameDay, startOfDay, subDays } from "date-fns";
import { buildDaybookDailySummary } from "@/lib/accountLedgerDaySummary";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import type {
  DaybookWedgeCompanyOption,
  DaybookWedgeDayBucket,
  DaybookWedgeRow,
  DaybookWedgeSnapshot,
  DaybookWedgeSummary,
} from "@wedge/daybook/types/daybookWedgeRow";
import { mapDaybookWedgeRow } from "@wedge/daybook/sync/mapDaybookWedgeRow";
import { effectiveWedgeDateSystem, isNepalCalendarCompany } from "@wedge/shared/isNepalCalendarCompany";
import { WEDGE_SNAPSHOT_VERSION } from "@wedge/shared/types/wedgeSnapshot";

export const DAYBOOK_WEDGE_SYNC_DAY_COUNT = 14;

type BuildFromProcessedOpts = {
  companyId: string;
  companyName: string;
  company: Parameters<typeof isNepalCalendarCompany>[0];
  companies: DaybookWedgeCompanyOption[];
  dateSystem: "AD" | "BS" | "Both";
  accounts: any[];
  vouchers: any[];
  processedTransactions: any[];
  formatCurrency: (n: number, opts?: { noSuffix?: boolean; context?: string }) => string;
  formatDate: (d: Date) => string;
  formatDateBS: (d: Date) => string;
  formatDayLabel: (day: Date) => string;
  dayCount?: number;
};

function mapSummary(summary: ReturnType<typeof buildDaybookDailySummary>): DaybookWedgeSummary {
  const mapAcct = (row: { id: string; name: string; yesterday: number; in: number; out: number; today: number }) => ({
    id: String(row.id),
    name: String(row.name || "Account"),
    yesterday: row.yesterday,
    in: row.in,
    out: row.out,
    today: row.today,
  });
  return {
    bankYesterday: summary.bank.yesterday,
    bankIn: summary.bank.in,
    bankOut: summary.bank.out,
    bankToday: summary.bank.today,
    cashYesterday: summary.cash.yesterday,
    cashIn: summary.cash.in,
    cashOut: summary.cash.out,
    cashToday: summary.cash.today,
    totalYesterday: summary.total.yesterday,
    totalIn: summary.total.in,
    totalOut: summary.total.out,
    totalToday: summary.total.today,
    bankAccounts: (summary.bankAccounts || []).map(mapAcct),
    cashAccounts: (summary.cashAccounts || []).map(mapAcct),
  };
}

function txOnDay(t: any, day: Date): boolean {
  const d = parseFirestoreDateFieldToJsDate(t?.date) ?? parseFirestoreDateFieldToJsDate(t?.createdAt);
  return d ? isSameDay(d, day) : false;
}

/** useTransactions processed rows + per-day summary → wedge snapshot (14 days). */
export function buildDaybookWedgeSnapshotFromProcessed(opts: BuildFromProcessedOpts): DaybookWedgeSnapshot | null {
  const {
    companyId,
    companyName,
    company,
    companies,
    dateSystem: preferredDateSystem,
    accounts,
    vouchers,
    processedTransactions,
    formatCurrency,
    formatDate,
    formatDateBS,
    formatDayLabel,
  } = opts;
  const dayCount = opts.dayCount ?? DAYBOOK_WEDGE_SYNC_DAY_COUNT;
  if (!companyId) return null;

  const isNepalCalendar = isNepalCalendarCompany(company);
  const dateSystem = effectiveWedgeDateSystem(company, preferredDateSystem);
  const rowCtx = { formatCurrency, dateSystem, formatDate, formatDateBS };
  const today = startOfDay(new Date());
  const days: DaybookWedgeDayBucket[] = [];

  for (let i = 0; i < dayCount; i++) {
    const day = subDays(today, i);
    const summaryRaw = buildDaybookDailySummary({ accounts, vouchers, selectedDay: day });
    const dayTx = (processedTransactions || []).filter((t) => txOnDay(t, day));
    const rows = dayTx
      .map((t) => mapDaybookWedgeRow(t, rowCtx))
      .filter((r) => r.id)
      .sort((a, b) => a.sortKey - b.sortKey);

    days.push({
      dayIso: day.toISOString(),
      dayLabel: formatDayLabel(day),
      dayLabelAd: formatDate(day),
      dayLabelBs: formatDateBS(day),
      summary: mapSummary(summaryRaw),
      rows,
      voucherCount: rows.length,
    });
  }

  const head = days[0];
  if (!head) return null;

  return {
    version: WEDGE_SNAPSHOT_VERSION,
    wedgeId: "daybook",
    companyId,
    companyName: companyName || "Company",
    updatedAt: Date.now(),
    defaultDayIso: head.dayIso,
    selectedDayIso: head.dayIso,
    selectedDayLabel: head.dayLabel,
    summary: head.summary,
    rows: head.rows,
    days,
    dateSystem,
    isNepalCalendar,
    companies,
    voucherCount: head.voucherCount,
  };
}

export function resolveDaybookWedgeDay(
  snapshot: DaybookWedgeSnapshot | null,
  selectedDayIso?: string | null
): DaybookWedgeDayBucket | null {
  if (!snapshot) return null;
  const target = selectedDayIso || snapshot.defaultDayIso || snapshot.selectedDayIso;
  const fromDays = snapshot.days?.find((d) => d.dayIso === target);
  if (fromDays) return fromDays;
  if (snapshot.selectedDayIso === target || !selectedDayIso) {
    const rows = snapshot.rows;
    return {
      dayIso: snapshot.selectedDayIso,
      dayLabel: snapshot.selectedDayLabel,
      summary: snapshot.summary,
      rows,
      voucherCount: rows.length,
    };
  }
  return null;
}

export function listDaybookWedgeDayIsos(snapshot: DaybookWedgeSnapshot | null): string[] {
  if (!snapshot) return [];
  if (snapshot.days?.length) return snapshot.days.map((d) => d.dayIso);
  return [snapshot.selectedDayIso];
}

export function shiftDaybookWedgeDayIso(
  snapshot: DaybookWedgeSnapshot | null,
  currentIso: string,
  delta: number
): string | null {
  const list = listDaybookWedgeDayIsos(snapshot);
  const idx = list.indexOf(currentIso);
  if (idx < 0) return null;
  const next = idx + delta;
  if (next < 0 || next >= list.length) return null;
  return list[next] ?? null;
}

export { formatDayLabelForSystem } from "@wedge/daybook/sync/formatWedgeDates";

import { startOfDay } from "date-fns";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";
import { BOOK_OB_EPS, isMasterOpeningDateInLedgerQueryRange, shouldStackBookOpeningAboveDatedRow } from "@/lib/ledgerOpeningBalanceDisplay";
import { isOpeningBoundaryPeriodKey } from "@/lib/fyPagination/openingBoundaryKeys";
import type { FyActiveScope, FyPeriodKind } from "@/lib/fyPagination/types";

export type LedgerOpeningPillKind = "book" | "fy" | "dated";

/** Month snapshot keys are `YYYY-MM`; FY keys are e.g. `2081-2082`. */
export function isMonthSnapshotPeriodKey(key: string | null | undefined): boolean {
  return Boolean(key && /^\d{4}-\d{2}$/.test(key));
}

export function resolveOpeningSnapshotKind(openingSnapshotId: string | null | undefined): FyPeriodKind {
  if (!openingSnapshotId) return "month";
  if (isOpeningBoundaryPeriodKey(openingSnapshotId)) return "month";
  return isMonthSnapshotPeriodKey(openingSnapshotId) ? "month" : "fy";
}

/** Snapshot rows may be stored as `periodKey::entityId` — collapse to entityId. */
export function normalizeFyOpeningBalances(balances: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(balances ?? {})) {
    const idx = key.lastIndexOf("::");
    const entityId = idx >= 0 ? key.slice(idx + 2) : key;
    if (!entityId) continue;
    out[entityId] = val;
  }
  return out;
}

export function extractEntityBalanceFromFySnapshot(
  balances: Record<string, number> | null | undefined,
  entityId: string | null | undefined
): number | undefined {
  const id = String(entityId || "").trim();
  if (!id) return undefined;
  const normalized = normalizeFyOpeningBalances(balances ?? {});
  const val = normalized[id];
  return val != null && Number.isFinite(val) ? val : undefined;
}

export function isScopeAtFyFloor(scope: FyActiveScope | null | undefined): boolean {
  if (!scope?.fyFloorMs) return false;
  return scope.range.fromMs <= scope.fyFloorMs;
}

export type ResolveTopLedgerOpeningPillInput = {
  ledgerDateFilterActive: boolean;
  ledgerShowBookOpeningRow: boolean;
  booksOpeningBalance?: number | null;
  periodOpeningBalance: number;
  masterOpeningDateWithinLedgerRange: boolean;
  dateRange?: { from?: Date | null; to?: Date | null };
  country?: string;
  fyScopeEnabled?: boolean;
  activeScope?: FyActiveScope | null;
  entitySnapshotOpening?: number | null;
};

/** Date filter `from` = fiscal year start (e.g. F Y preset Shrawan-01). */
export function isLedgerDateFilterFromAtFyStart(
  country?: string,
  dateRange?: { from?: Date | null; to?: Date | null }
): boolean {
  if (!dateRange?.from) return false;
  const from = startOfDay(dateRange.from);
  const { start } = getFiscalRangeForCountry(country ?? "Nepal", from);
  return startOfDay(start).getTime() === from.getTime();
}

function periodMatchesBooksOpening(booksOb: number, period: number, booksOpeningBalance?: number | null): boolean {
  if (booksOpeningBalance == null) return true;
  return Math.abs(period - booksOb) < BOOK_OB_EPS || Math.abs(period) < BOOK_OB_EPS;
}

/**
 * Top standalone opening row pill (embedded FY rows after divider use their own label):
 * 1. Book Opening — master form OB at ledger chronological start
 * 2. FY xx-xx Opening — date filter from FY start (carry ≠ book OB); divider rows are separate
 * 3. Dated Opening — pagination slice / mid-range date filter carry
 */
export function resolveTopLedgerOpeningPillKind(input: ResolveTopLedgerOpeningPillInput): LedgerOpeningPillKind {
  const booksOb = input.booksOpeningBalance ?? 0;
  const period = Number(input.periodOpeningBalance) || 0;

  const showBookOpeningAboveDatedRow = shouldStackBookOpeningAboveDatedRow({
    ledgerDateFilterActive: input.ledgerDateFilterActive,
    ledgerShowBookOpeningRow: input.ledgerShowBookOpeningRow,
    booksOpeningBalance: input.booksOpeningBalance,
    periodOpeningBalance: period,
    masterOpeningDateWithinLedgerRange: input.masterOpeningDateWithinLedgerRange,
  });
  // Stacked: period carry row; Book Opening is the separate row above.
  if (showBookOpeningAboveDatedRow) return "dated";

  // Page 2+ / slice not at ledger start — period carry only.
  if (!input.ledgerShowBookOpeningRow) return "dated";

  if (input.ledgerDateFilterActive) {
    const atFyStart = isLedgerDateFilterFromAtFyStart(input.country, input.dateRange);
    const looksLikeBookOb =
      input.masterOpeningDateWithinLedgerRange &&
      periodMatchesBooksOpening(booksOb, period, input.booksOpeningBalance);

    if (atFyStart) {
      if (
        !looksLikeBookOb &&
        input.entitySnapshotOpening != null &&
        Number.isFinite(input.entitySnapshotOpening)
      ) {
        return "fy";
      }
      if (looksLikeBookOb) return "book";
      return "fy";
    }

    if (looksLikeBookOb) return "book";
    return "dated";
  }

  // Default / Last N / fiscal-merge full load — top row = master Book Opening.
  return "book";
}

export function ledgerOpeningPillLabel(kind: LedgerOpeningPillKind): string {
  if (kind === "book") return "Book Opening";
  if (kind === "fy") return "FY Opening";
  return "Dated Opening";
}

/** FY Opening row date = 1st day of new FY (partition boundary). */
export function fyOpeningRowDateFromBoundaryMs(boundaryMs: number): Date {
  return startOfDay(new Date(boundaryMs));
}

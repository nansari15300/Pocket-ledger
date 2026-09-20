"use client";

import { startOfDay, startOfMonth, subMonths } from "date-fns";
import { bsToAd, BS_CALENDAR_MIN_YEAR } from "@/lib/bs-date";
import type { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import { voucherTouchesLedger } from "@/lib/billWiseSettledUnlinkedDetector";
import { MASTER_LEDGER_DEFAULT_TXN_COUNT } from "@/lib/ledgerMasterDefaultView";
import { voucherTouchesPartyLedger } from "@/lib/voucherTouchesPartyLedger";
import {
  hydrateLedgerHistoryBeforeMs,
  hydrateLedgerOpeningBalances,
  readLocalFyOpeningBalances,
} from "@/lib/fyPagination/openingSnapshotHydrate";
import { scheduleBackgroundOnlineFyRangeHydrate } from "@/lib/fyPagination/sqliteFirstFyLoad";
import { notifyBrowserDbCollectionUpdated } from "@/lib/localCompanyDocMirror";
import type { LedgerDateRangeInput } from "@/lib/fyPagination/ledgerDateRangeLoad";
import { atNoonAd } from "@/lib/bsDateRangePresets";
import {
  currentFiscalYearRange,
  priorFyKeyFromRunning,
  runningFyKey,
} from "@/lib/fyPagination/periodBounds";
import { openingBoundaryPeriodKey } from "@/lib/fyPagination/openingBoundaryKeys";
import type { FyActiveScope, FyDateRangeMs } from "@/lib/fyPagination/types";
import { listVouchersFromBrowserDbByDateRange } from "@/lib/fyPagination/voucherQueries";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";

export type MasterLedgerEntityKind = "party" | "staff" | "account" | "tax" | "expense" | "item";

type FyScopeCompany = CompanyStorageRow & { country?: string };

const MAX_WIDEN_MONTHS = 120;

function ledgerIdEq(a: unknown, b: string): boolean {
  const nb = String(b ?? "").trim();
  if (!nb) return false;
  const norm = (x: unknown): string => {
    if (x == null || x === "") return "";
    if (typeof x === "string") return x.trim();
    if (typeof x === "object" && x !== null && "id" in (x as Record<string, unknown>)) {
      const id = (x as { id?: unknown }).id;
      return typeof id === "string" ? id.trim() : String(id ?? "");
    }
    return String(x).trim();
  };
  return norm(a) === nb;
}

export function countEntityVouchersInList(
  vouchers: readonly any[],
  entityId: string,
  kind: MasterLedgerEntityKind
): number {
  const id = String(entityId || "").trim();
  if (!id || !vouchers.length) return 0;
  let n = 0;
  for (const v of vouchers) {
    if (!v || v.isDeleted === true) continue;
    if (kind === "party" && voucherTouchesPartyLedger(v, id)) {
      n++;
      continue;
    }
    if (kind === "staff" && voucherTouchesLedger(v, id, "staff")) {
      n++;
      continue;
    }
    if (kind === "account") {
      if (
        ledgerIdEq(v.accountId, id) ||
        ledgerIdEq(v.fromAccountId, id) ||
        ledgerIdEq(v.toAccountId, id) ||
        ledgerIdEq(v.bankAccountId, id) ||
        (Array.isArray(v.entries) && v.entries.some((e: any) => ledgerIdEq(e?.accountId, id))) ||
        (v.type === "contra" && (ledgerIdEq(v.fromAccountId, id) || ledgerIdEq(v.toAccountId, id)))
      ) {
        n++;
      }
      continue;
    }
    if (kind === "tax") {
      if (
        ledgerIdEq(v.taxAccountId, id) ||
        (Array.isArray(v.lineItems) && v.lineItems.some((li: any) => ledgerIdEq(li?.taxAccountId, id))) ||
        (Array.isArray(v.entries) && v.entries.some((e: any) => ledgerIdEq(e?.accountId, id)))
      ) {
        n++;
      }
      continue;
    }
    if (kind === "expense") {
      if (ledgerIdEq(v.expenseAccountId, id) || ledgerIdEq(v.accountId, id)) {
        n++;
      }
      continue;
    }
    if (kind === "item") {
      if (
        (Array.isArray(v.lineItems) && v.lineItems.some((li: any) => ledgerIdEq(li?.itemId, id))) ||
        (Array.isArray(v.items) && v.items.some((li: any) => ledgerIdEq(li?.itemId, id)))
      ) {
        n++;
      }
    }
  }
  return n;
}

/** Full SQLite mirror count for this entity — used so default view loads all txns, not just min 10. */
export async function countEntityVouchersInSqliteFull(
  companyId: string,
  entityId: string,
  kind: MasterLedgerEntityKind
): Promise<number> {
  const cid = String(companyId || "").trim();
  const id = String(entityId || "").trim();
  if (!cid || !id) return 0;
  try {
    const rows = await listCompanyDocsFromBrowserDb(cid, "vouchers", { forBackupMerge: true });
    return countEntityVouchersInList(rows, id, kind);
  } catch {
    return 0;
  }
}

function resolveOpeningSnapshotIdForWiden(
  today: Date,
  effectiveRange: FyDateRangeMs,
  fyRange: FyDateRangeMs,
  country?: string
): string | null {
  if (effectiveRange.fromMs <= fyRange.fromMs) {
    return priorFyKeyFromRunning(runningFyKey(country, today));
  }
  return openingBoundaryPeriodKey(effectiveRange.fromMs);
}

/**
 * Master ledger default view: walk scope backward month-by-month (cross-FY) until this entity
 * has at least `minTxn` vouchers in SQLite, or we hit the calendar floor.
 */
export async function widenFyScopeUntilEntityMinTxns(params: {
  company: FyScopeCompany | null | undefined;
  fy: ReturnType<typeof useFyVoucherScope>;
  entityId: string;
  entityKind: MasterLedgerEntityKind;
  minTxn?: number;
  targetTxnCount?: number;
  today?: Date;
}): Promise<void> {
  const { company, fy, entityId, entityKind, minTxn = MASTER_LEDGER_DEFAULT_TXN_COUNT, today = new Date() } =
    params;
  const companyId = String(company?.id || "").trim();
  if (!companyId || !fy.enabled || !fy.activeScope) return;

  const fullEntityCount =
    typeof params.targetTxnCount === "number" && params.targetTxnCount > 0
      ? params.targetTxnCount
      : await countEntityVouchersInSqliteFull(companyId, entityId, entityKind);
  const targetCount = Math.max(minTxn, fullEntityCount);

  const absoluteFloorMs = atNoonAd(bsToAd({ y: BS_CALENDAR_MIN_YEAR, m: 1, d: 1 })).getTime();
  let scope: FyActiveScope = fy.activeScope;
  let stagnantPasses = 0;
  let lastCount = -1;

  for (let i = 0; i < MAX_WIDEN_MONTHS; i++) {
    const rows = await listVouchersFromBrowserDbByDateRange(companyId, scope.range);
    const count = countEntityVouchersInList(rows, entityId, entityKind);
    if (count >= targetCount) return;
    if (count === lastCount) stagnantPasses++;
    else stagnantPasses = 0;
    lastCount = count;
    if (stagnantPasses >= 6) return;

    const monthCursor = subMonths(new Date(scope.range.fromMs), 1);
    const newFromMs = startOfDay(startOfMonth(monthCursor)).getTime();
    if (newFromMs >= scope.range.fromMs || newFromMs < absoluteFloorMs) return;

    const newRange: FyDateRangeMs = { fromMs: newFromMs, toMs: scope.range.toMs };

    const fyRange = currentFiscalYearRange(company?.country, today);
    scope = {
      ...scope,
      range: newRange,
      fyFloorMs: newFromMs,
      openingSnapshotId: resolveOpeningSnapshotIdForWiden(today, newRange, fyRange, company?.country),
    };

    fy.setActiveScope(scope);

    const localOpening = await readLocalFyOpeningBalances(companyId, scope);
    if (localOpening) fy.applyOpeningHydrateResult(localOpening);
    else fy.setOpeningBalancesLoading();

    const allInRange = await listVouchersFromBrowserDbByDateRange(companyId, newRange);
    if (allInRange.length) {
      fy.mergeHydratedVouchers(allInRange);
      fy.registerInMemoryVoucherIds(allInRange.map((v) => String(v.id || "")));
    }

    scheduleBackgroundOnlineFyRangeHydrate({
      company,
      companyId,
      range: newRange,
      fy,
    });

    if (!isCloudLinkedCompanyStorage(company) && newRange.fromMs > 0) {
      void hydrateLedgerHistoryBeforeMs(company, companyId, company?.country, newRange.fromMs)
        .then(async () => {
          const refreshed = await listVouchersFromBrowserDbByDateRange(companyId, newRange);
          if (refreshed.length) {
            fy.mergeHydratedVouchers(refreshed);
            fy.registerInMemoryVoucherIds(refreshed.map((v) => String(v.id || "")));
          }
          notifyBrowserDbCollectionUpdated(companyId, "vouchers", {
            immediate: true,
            source: "fy_range_hydrate",
          });
        })
        .catch((err) => {
          console.warn("[entityMinTxnScope] background local history hydrate", err);
        });
    }

    void hydrateLedgerOpeningBalances({ company, companyId, scope })
      .then((opening) => fy.applyOpeningHydrateResult(opening))
      .catch((err) => {
        console.warn("[entityMinTxnScope] background opening hydrate", err);
      });
  }
}

export function isDefaultLedgerDateRange(dateRange?: LedgerDateRangeInput): boolean {
  return !dateRange?.from && !dateRange?.to;
}

"use client";

import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import {
  fiscalYearRangeForKey,
  priorFyKeyFromRunning,
  runningFyKey,
} from "@/lib/fyPagination/periodBounds";
import {
  invalidateAllLocalOpeningSnapshots,
  listFyBalanceSnapshotPeriodKeys,
} from "@/lib/fyPagination/snapshotStore";
import { fetchServerFyClosingSnapshot } from "@/lib/fyPagination/serverFyClosingSnapshotClient";
import { invalidateServerOpeningSnapshots } from "@/lib/fyPagination/serverFyOpeningInvalidateClient";
import { parseOpeningBalanceDateToLocalNoon } from "@/lib/voucherDateNormalize";
import { balanceOpeningBalanceWithCapital } from "@/lib/voucherActionsClient";

export const MASTER_OPENING_BALANCE_CHANGED_EVENT = "pl:master-opening-balance-changed";

export type MasterOpeningBalanceChangedDetail = {
  companyId: string;
};

export function dispatchMasterOpeningBalanceChanged(companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  window.dispatchEvent(
    new CustomEvent<MasterOpeningBalanceChangedDetail>(MASTER_OPENING_BALANCE_CHANGED_EVENT, {
      detail: { companyId },
    })
  );
}

function fyKeyAfterPrior(priorKey: string): string | null {
  const parts = priorKey.split("-").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return `${parts[0] + 1}-${parts[1] + 1}`;
}

async function collectFyOpeningSnapshotKeys(companyId: string, country?: string): Promise<string[]> {
  const keys = new Set<string>();
  const fromDb = await listFyBalanceSnapshotPeriodKeys(companyId, "fy");
  for (const key of fromDb) keys.add(key);

  let cursor = runningFyKey(country);
  for (let i = 0; i < 20; i++) {
    const prior = priorFyKeyFromRunning(cursor);
    if (!prior) break;
    keys.add(prior);
    cursor = prior;
  }
  return [...keys];
}

type FyScopeCompany = CompanyStorageRow & { country?: string };

type OpeningBalanceMasterCollection =
  | "parties"
  | "bank_accounts"
  | "staff"
  | "taxes"
  | "expense_accounts";

/** SQLite read-back / persisted doc → live list patch fields. */
export function masterOpeningPatchFromPersisted(persisted: Record<string, unknown>): {
  openingBalance: number;
  openingBalanceDate?: Date;
  openingBalanceNarration?: string;
} {
  const openingBalance = Number(persisted.openingBalance) || 0;
  const openingBalanceDate = parseOpeningBalanceDateToLocalNoon(persisted.openingBalanceDate) ?? undefined;
  const openingBalanceNarration =
    typeof persisted.openingBalanceNarration === "string" ? persisted.openingBalanceNarration : "";
  return { openingBalance, openingBalanceDate, openingBalanceNarration };
}

export function masterOpeningFieldsChanged(
  before: { openingBalance?: unknown; openingBalanceDate?: unknown },
  after: { openingBalance?: unknown; openingBalanceDate?: unknown }
): boolean {
  const obBefore = Number(before.openingBalance) || 0;
  const obAfter = Number(after.openingBalance) || 0;
  if (Math.abs(obAfter - obBefore) > 0.01) return true;
  const dBefore = parseOpeningBalanceDateToLocalNoon(before.openingBalanceDate)?.getTime() ?? null;
  const dAfter = parseOpeningBalanceDateToLocalNoon(after.openingBalanceDate)?.getTime() ?? null;
  return dBefore !== dAfter;
}

/** System opening balance ledger + all FY server snapshots after book OB / As-on save. */
export async function finalizeMasterOpeningBalanceSideEffects(params: {
  company: FyScopeCompany | null | undefined;
  companyId: string;
  collection: OpeningBalanceMasterCollection;
  entityId: string;
  oldOpeningBalance: number;
  newOpeningBalance: number;
  oldOpeningBalanceDate?: unknown;
  newOpeningBalanceDate?: unknown;
}): Promise<void> {
  const {
    company,
    companyId,
    collection,
    entityId,
    oldOpeningBalance,
    newOpeningBalance,
    oldOpeningBalanceDate,
    newOpeningBalanceDate,
  } = params;
  if (
    !masterOpeningFieldsChanged(
      { openingBalance: oldOpeningBalance, openingBalanceDate: oldOpeningBalanceDate },
      { openingBalance: newOpeningBalance, openingBalanceDate: newOpeningBalanceDate }
    )
  ) {
    return;
  }
  await balanceOpeningBalanceWithCapital(
    companyId,
    collection,
    entityId,
    oldOpeningBalance,
    newOpeningBalance
  );
  if (isCloudLinkedCompanyStorage(company)) {
    try {
      const { flushVoucherOutbox } = await import("@/lib/localVoucherOutbox");
      await flushVoucherOutbox();
    } catch (err) {
      console.warn("[finalizeMasterOpeningBalanceSideEffects] outbox flush", err);
    }
  }
  await scheduleAllFyOpeningSnapshotRebuildsAfterMasterChange({ company, companyId });
}

/**
 * Book opening / As-on edit: rebuild every known FY opening snapshot on server
 * (book OB change shifts all later FY dividers).
 */
export async function scheduleAllFyOpeningSnapshotRebuildsAfterMasterChange(params: {
  company: FyScopeCompany | null | undefined;
  companyId: string;
}): Promise<void> {
  const { company, companyId } = params;
  const cid = String(companyId || "").trim();
  if (!cid) return;

  dispatchMasterOpeningBalanceChanged(cid);

  if (!isCloudLinkedCompanyStorage(company)) return;

  await invalidateServerOpeningSnapshots({ companyId: cid, invalidateAll: true });
  await invalidateAllLocalOpeningSnapshots(cid);

  const priorKeys = await collectFyOpeningSnapshotKeys(cid, company?.country);
  for (const priorKey of priorKeys) {
    const runningKey = fyKeyAfterPrior(priorKey);
    if (!runningKey) continue;
    const range = fiscalYearRangeForKey(company?.country, runningKey);
    if (!range) continue;
    void fetchServerFyClosingSnapshot({
      companyId: cid,
      periodKind: "fy",
      periodKey: priorKey,
      beforeMs: range.fromMs,
      forceRebuild: true,
    }).catch((err) => {
      console.warn("[scheduleAllFyOpeningSnapshotRebuildsAfterMasterChange]", priorKey, err);
    });
  }

}

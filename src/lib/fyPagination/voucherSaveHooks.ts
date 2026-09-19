"use client";

import { startOfDay } from "date-fns";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import { currentMonthRange, monthPeriodKey } from "@/lib/fyPagination/periodBounds";
import { rebuildFySnapshotsAfterVoucherSave } from "@/lib/fyPagination/rebuildSnapshots";
import {
  invalidateLocalOpeningSnapshotsAfterMs,
  readFyBalanceSnapshot,
} from "@/lib/fyPagination/snapshotStore";
import { fiscalYearRangeForKey, priorFyKeyFromRunning } from "@/lib/fyPagination/periodBounds";
import { fetchServerFyClosingSnapshot } from "@/lib/fyPagination/serverFyClosingSnapshotClient";
import { invalidateServerOpeningSnapshots } from "@/lib/fyPagination/serverFyOpeningInvalidateClient";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { syncFyBalanceSnapshotToFirestore } from "@/lib/ledgerModes/online/fySnapshotSync";
import { listVouchersFromBrowserDbByDateRange } from "@/lib/fyPagination/voucherQueries";
import { touchFyVoucherIndexOnVoucherSave } from "@/lib/fiscalSplit/fyVoucherIndex";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";

type FyScopeCompany = CompanyStorageRow & { country?: string };

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

/**
 * Back-date / in-period save: rebuild month/FY snapshot locally (+ cloud when online).
 */
export async function scheduleFySnapshotRebuildAfterVoucherSave(params: {
  company: FyScopeCompany | null | undefined;
  voucher: Record<string, unknown>;
  vouchersInMemory?: Array<Record<string, unknown>>;
}): Promise<void> {
  const { company, voucher, vouchersInMemory = [] } = params;
  const companyId = String(company?.id || "").trim();
  if (!companyId) return;
  const savedDate = voucherJsDate(voucher.date);
  if (!savedDate) return;

  const online = isCloudLinkedCompanyStorage(company);
  const periodKind = "month";
  const range = currentMonthRange(savedDate);

  const vouchers =
    vouchersInMemory.length > 0
      ? vouchersInMemory
      : await listVouchersFromBrowserDbByDateRange(companyId, range);

  await rebuildFySnapshotsAfterVoucherSave({
    companyId,
    country: company?.country,
    vouchers,
    savedVoucherDate: savedDate,
    periodKind,
  });

  await touchFyVoucherIndexOnVoucherSave({
    companyId,
    company: company!,
    voucherDate: savedDate,
  }).catch((err) => {
    console.warn("[scheduleFySnapshotRebuildAfterVoucherSave] fy index touch", err);
  });

  if (!online) return;
  const fsCompanyId = String(company?.authoritativeCompanyId || companyId).trim();
  const periodKey = monthPeriodKey(savedDate);
  const written = await readFyBalanceSnapshot(companyId, periodKind, periodKey);
  if (written) {
    await syncFyBalanceSnapshotToFirestore(fsCompanyId, written).catch((err) => {
      console.warn("[scheduleFySnapshotRebuildAfterVoucherSave] cloud snapshot sync", err);
    });
  }

  const savedMs = startOfDay(savedDate).getTime();
  await invalidateServerOpeningSnapshots({ companyId, afterMs: savedMs });
  await invalidateLocalOpeningSnapshotsAfterMs(companyId, savedMs);

  const fyKey = getAnusuchi13FyKey(company?.country, savedDate);
  const fyRange = fiscalYearRangeForKey(company?.country, fyKey);
  const priorFyKey = priorFyKeyFromRunning(fyKey);
  if (priorFyKey && fyRange) {
    void fetchServerFyClosingSnapshot({
      companyId,
      periodKind: "fy",
      periodKey: priorFyKey,
      beforeMs: fyRange.fromMs,
      forceRebuild: true,
    }).catch((err) => {
      console.warn("[scheduleFySnapshotRebuildAfterVoucherSave] server FY snapshot", err);
    });
  }
}

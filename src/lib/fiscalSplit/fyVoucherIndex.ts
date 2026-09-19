"use client";

import { startOfDay } from "date-fns";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import { listFyKeysWithVouchersInSqlite } from "@/lib/fyPagination/archiveBootstrap";
import { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import { listAllFyKeysFromFirestore } from "@/lib/fiscalSplit/listAllFyKeysFromFirestore";
import {
  readFyVoucherIndexFromFirestore,
  writeFyVoucherIndexToFirestore,
} from "@/lib/fiscalSplit/fyVoucherIndexFirestore";
import {
  readFyVoucherIndexFromSqlite,
  writeFyVoucherIndexToSqlite,
  writeFyVoucherIndexKeysToSqlite,
} from "@/lib/fiscalSplit/fyVoucherIndexSqlite";
import {
  buildFyVoucherIndexFromKeys,
  mergeFyKeyIntoIndex,
  type FyVoucherIndex,
} from "@/lib/fiscalSplit/fyVoucherIndexTypes";

export type FyVoucherIndexLoadSource =
  | "firestore_cache"
  | "sqlite_cache"
  | "firestore_scan"
  | "sqlite_projection";

export type EnsureFyVoucherIndexResult = {
  index: FyVoucherIndex;
  source: FyVoucherIndexLoadSource;
  vouchersScanned: number;
};

type FyScopeCompany = CompanyStorageRow & {
  country?: string;
  authoritativeCompanyId?: string;
};

function voucherJsDate(date: unknown): Date | null {
  return parseFirestoreDateFieldToJsDate(date);
}

async function readVoucherDateSpanFromSqliteProjection(companyId: string): Promise<{
  minDateMs: number | null;
  maxDateMs: number | null;
}> {
  if (typeof window === "undefined" || !companyId) {
    return { minDateMs: null, maxDateMs: null };
  }
  const { getBrowserDbForCompanyId } = await import("@/lib/localSqlite");
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return { minDateMs: null, maxDateMs: null };
  try {
    const row = db
      .prepare(
        `SELECT MIN(doc_date_ms) AS min_ms, MAX(doc_date_ms) AS max_ms
         FROM company_docs_projection
         WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL`
      )
      .get(companyId) as { min_ms?: number; max_ms?: number } | undefined;
    const minDateMs = row?.min_ms != null && Number.isFinite(row.min_ms) ? Number(row.min_ms) : null;
    const maxDateMs = row?.max_ms != null && Number.isFinite(row.max_ms) ? Number(row.max_ms) : null;
    return { minDateMs, maxDateMs };
  } catch {
    return { minDateMs: null, maxDateMs: null };
  }
}

async function rebuildIndexFromSqliteProjection(
  companyId: string,
  country?: string
): Promise<FyVoucherIndex> {
  const keys = await listFyKeysWithVouchersInSqlite(companyId, country);
  const span = await readVoucherDateSpanFromSqliteProjection(companyId);
  return writeFyVoucherIndexKeysToSqlite(companyId, keys, span.minDateMs, span.maxDateMs);
}

async function rebuildIndexFromFirestoreScan(params: {
  fsCompanyId: string;
  companyId: string;
  country?: string;
  onProgress?: (scanned: number) => void;
}): Promise<{ index: FyVoucherIndex; vouchersScanned: number }> {
  const { fsCompanyId, companyId, country, onProgress } = params;
  const scan = await listAllFyKeysFromFirestore({
    fsCompanyId,
    country,
    onProgress: (p) => onProgress?.(p.vouchersScanned),
  });
  const vouchersScanned = scan.vouchersScanned;
  const index = buildFyVoucherIndexFromKeys(scan.fyKeys, scan.minDateMs, scan.maxDateMs);
  await writeFyVoucherIndexToSqlite(companyId, index);
  await writeFyVoucherIndexToFirestore(fsCompanyId, index).catch((err) => {
    console.warn("[rebuildIndexFromFirestoreScan] cloud write", err);
  });
  return { index, vouchersScanned };
}

/**
 * Fiscal split settings: prefer cached index (1 Firestore doc / SQLite row).
 * Full voucher scan only when cache missing (one-time bootstrap per company).
 */
export async function ensureFyVoucherIndex(params: {
  companyId: string;
  company: FyScopeCompany;
  onFirestoreScanProgress?: (scanned: number) => void;
}): Promise<EnsureFyVoucherIndexResult> {
  const { companyId, company, onFirestoreScanProgress } = params;
  const country = company.country;
  const online = isCloudLinkedCompanyStorage(company);
  const fsCompanyId = String(company.authoritativeCompanyId || companyId).trim();

  if (online && fsCompanyId) {
    const cloud = await readFyVoucherIndexFromFirestore(fsCompanyId);
    if (cloud?.fyKeys.length) {
      await writeFyVoucherIndexToSqlite(companyId, cloud).catch(() => {});
      return { index: cloud, source: "firestore_cache", vouchersScanned: 0 };
    }
    const { index, vouchersScanned } = await rebuildIndexFromFirestoreScan({
      fsCompanyId,
      companyId,
      country,
      onProgress: onFirestoreScanProgress,
    });
    return { index, source: "firestore_scan", vouchersScanned };
  }

  const localCache = await readFyVoucherIndexFromSqlite(companyId);
  if (localCache?.fyKeys.length) {
    return { index: localCache, source: "sqlite_cache", vouchersScanned: 0 };
  }

  const index = await rebuildIndexFromSqliteProjection(companyId, country);
  return { index, source: "sqlite_projection", vouchersScanned: 0 };
}

/** Voucher save: add FY key to index (local + cloud). Skip if key already present. */
export async function touchFyVoucherIndexOnVoucherSave(params: {
  companyId: string;
  company: FyScopeCompany;
  voucherDate: unknown;
}): Promise<void> {
  const { companyId, company, voucherDate } = params;
  const d = voucherJsDate(voucherDate);
  if (!d || !companyId) return;

  const country = company.country;
  const companyDates = resolveCompanyFiscalYearDates(
    company as { fiscalYearStart?: unknown; fiscalYearEnd?: unknown }
  );
  const fyKey = getAnusuchi13FyKey(country, d, companyDates);
  const dateMs = startOfDay(d).getTime();
  const online = isCloudLinkedCompanyStorage(company);
  const fsCompanyId = String(company.authoritativeCompanyId || companyId).trim();

  let index = await readFyVoucherIndexFromSqlite(companyId);
  if (!index && online && fsCompanyId) {
    index = await readFyVoucherIndexFromFirestore(fsCompanyId);
  }

  if (index?.fyKeys.includes(fyKey)) {
    const nextMin = index.minDateMs != null ? Math.min(index.minDateMs, dateMs) : dateMs;
    const nextMax = index.maxDateMs != null ? Math.max(index.maxDateMs, dateMs) : dateMs;
    if (nextMin === index.minDateMs && nextMax === index.maxDateMs) return;
    const bumped: FyVoucherIndex = {
      ...index,
      minDateMs: nextMin,
      maxDateMs: nextMax,
      updatedAtMs: Date.now(),
    };
    await writeFyVoucherIndexToSqlite(companyId, bumped);
    if (online && fsCompanyId) {
      await writeFyVoucherIndexToFirestore(fsCompanyId, bumped).catch(() => {});
    }
    return;
  }

  const merged = mergeFyKeyIntoIndex(index, fyKey, dateMs);
  await writeFyVoucherIndexToSqlite(companyId, merged);
  if (online && fsCompanyId) {
    await writeFyVoucherIndexToFirestore(fsCompanyId, merged).catch((err) => {
      console.warn("[touchFyVoucherIndexOnVoucherSave] cloud sync", err);
    });
  }
}

/** Force rebuild (e.g. admin refresh) — expensive for online. */
export async function rebuildFyVoucherIndex(params: {
  companyId: string;
  company: FyScopeCompany;
  onFirestoreScanProgress?: (scanned: number) => void;
}): Promise<EnsureFyVoucherIndexResult> {
  const { companyId, company, onFirestoreScanProgress } = params;
  const online = isCloudLinkedCompanyStorage(company);
  const fsCompanyId = String(company.authoritativeCompanyId || companyId).trim();

  if (online && fsCompanyId) {
    const { index, vouchersScanned } = await rebuildIndexFromFirestoreScan({
      fsCompanyId,
      companyId,
      country: company.country,
      onProgress: onFirestoreScanProgress,
    });
    return { index, source: "firestore_scan", vouchersScanned };
  }

  const index = await rebuildIndexFromSqliteProjection(companyId, company.country);
  return { index, source: "sqlite_projection", vouchersScanned: 0 };
}

/** Min/max voucher dates from cached index (suggestion card). */
export function dateSpanFromFyVoucherIndex(index: FyVoucherIndex): {
  from: Date | null;
  to: Date | null;
} {
  if (index.minDateMs != null && index.maxDateMs != null) {
    return { from: new Date(index.minDateMs), to: new Date(index.maxDateMs) };
  }
  return { from: null, to: null };
}

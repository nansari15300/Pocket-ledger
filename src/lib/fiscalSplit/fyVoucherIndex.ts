"use client";

import { startOfDay } from "date-fns";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { CompanyStorageRow } from "@/lib/companyStorageKind";
import type { CompanyFiscalYearDates } from "@/lib/fiscalRange";
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
  rebuildFyVoucherIndexFromCompanyDocs,
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
  | "sqlite_document_scan"
  | "sqlite_projection";

export type EnsureFyVoucherIndexResult = {
  index: FyVoucherIndex;
  source: FyVoucherIndexLoadSource;
  vouchersScanned: number;
};

function mergeFyVoucherIndexes(...indexes: FyVoucherIndex[]): FyVoucherIndex {
  const keys = new Set<string>();
  let minDateMs: number | null = null;
  let maxDateMs: number | null = null;
  for (const index of indexes) {
    for (const fyKey of index.fyKeys) keys.add(fyKey);
    if (index.minDateMs != null) {
      minDateMs = minDateMs == null ? index.minDateMs : Math.min(minDateMs, index.minDateMs);
    }
    if (index.maxDateMs != null) {
      maxDateMs = maxDateMs == null ? index.maxDateMs : Math.max(maxDateMs, index.maxDateMs);
    }
  }
  return buildFyVoucherIndexFromKeys([...keys], minDateMs, maxDateMs);
}

function fyVoucherIndexesEqual(a: FyVoucherIndex, b: FyVoucherIndex): boolean {
  return (
    a.minDateMs === b.minDateMs &&
    a.maxDateMs === b.maxDateMs &&
    a.fyKeys.length === b.fyKeys.length &&
    a.fyKeys.every((key, index) => key === b.fyKeys[index])
  );
}

type FyScopeCompany = CompanyStorageRow & {
  country?: string;
  authoritativeCompanyId?: string;
};

function voucherJsDate(date: unknown): Date | null {
  return parseFirestoreDateFieldToJsDate(date);
}

async function rebuildIndexFromSqliteProjection(
  companyId: string,
  country?: string,
  companyDates?: CompanyFiscalYearDates | null,
  onProgress?: (scanned: number, total: number) => void
): Promise<{ index: FyVoucherIndex; source: "sqlite_document_scan" | "sqlite_projection" }> {
  let minDateMs: number | null = null;
  let maxDateMs: number | null = null;
  const keys = await listFyKeysWithVouchersInSqlite(companyId, country, companyDates, (p) => {
    onProgress?.(p.scanned, p.total);
    minDateMs = p.minDateMs ?? minDateMs;
    maxDateMs = p.maxDateMs ?? maxDateMs;
  });
  if (!keys.length) {
    const recovered = await rebuildFyVoucherIndexFromCompanyDocs({
      companyId,
      country,
      companyDates,
      onProgress,
    });
    if (recovered.fyKeys.length) {
      console.info("[FY-SCAN] recovered FY keys from local voucher documents", {
        companyId,
        fyKeyCount: recovered.fyKeys.length,
        keys: recovered.fyKeys.slice(0, 12),
      });
      return { index: recovered, source: "sqlite_document_scan" };
    }
  }
  return {
    index: await writeFyVoucherIndexKeysToSqlite(companyId, keys, minDateMs, maxDateMs),
    source: "sqlite_projection",
  };
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
 *
 * Order (responsive): SQLite cache → Firestore 1-doc cache → SQLite projection →
 * Firestore full scan last (yields between pages). Never block Settings on cloud scan
 * when local projection already has FY keys.
 */
export async function ensureFyVoucherIndex(params: {
  companyId: string;
  company: FyScopeCompany;
  onFirestoreScanProgress?: (scanned: number) => void;
  onSqliteScanProgress?: (scanned: number, total: number) => void;
  onIndexUpdate?: (index: FyVoucherIndex, source: FyVoucherIndexLoadSource) => void;
}): Promise<EnsureFyVoucherIndexResult> {
  const { companyId, company, onFirestoreScanProgress, onSqliteScanProgress, onIndexUpdate } = params;
  const country = company.country;
  const companyDates = resolveCompanyFiscalYearDates(
    company as { fiscalYearStart?: unknown; fiscalYearEnd?: unknown }
  );
  const online = isCloudLinkedCompanyStorage(company);
  const fsCompanyId = String(company.authoritativeCompanyId || companyId).trim();

  console.info("[FY-SCAN] ensure start", {
    companyId,
    firestoreCompanyId: online ? fsCompanyId : null,
    online,
    country: country ?? null,
  });

  const localCache = await readFyVoucherIndexFromSqlite(companyId);
  if (localCache?.fyKeys.length) {
    if (online && fsCompanyId) {
      // SQLite paints the page immediately; refresh the one small cloud index in
      // the background so new FY keys from another device appear without rescanning.
      void readFyVoucherIndexFromFirestore(fsCompanyId)
        .then(async (remote) => {
          const merged = remote?.fyKeys.length
            ? mergeFyVoucherIndexes(localCache, remote)
            : localCache;
          if (!fyVoucherIndexesEqual(localCache, merged)) {
            await writeFyVoucherIndexToSqlite(companyId, merged);
            onIndexUpdate?.(merged, "firestore_cache");
          }
          const cloudNeedsLocalKeys =
            !remote?.fyKeys.length ||
            localCache.fyKeys.some((key) => !remote.fyKeys.includes(key));
          if (cloudNeedsLocalKeys) {
            await writeFyVoucherIndexToFirestore(fsCompanyId, merged);
          }
          console.info("[FY-SCAN] cached index cloud reconcile done", {
            companyId,
            firestoreCompanyId: fsCompanyId,
            localFyKeyCount: localCache.fyKeys.length,
            cloudFyKeyCount: remote?.fyKeys.length ?? 0,
            mergedFyKeyCount: merged.fyKeys.length,
            keys: merged.fyKeys.slice(0, 16),
          });
        })
        .catch((err) => {
          console.warn("[FY-SCAN] cached index cloud reconcile failed", { companyId, err });
        });
    }
    console.info("[FY-SCAN] using sqlite cached FY index", {
      companyId,
      fyKeyCount: localCache.fyKeys.length,
      keys: localCache.fyKeys.slice(0, 16),
    });
    return { index: localCache, source: "sqlite_cache", vouchersScanned: 0 };
  }

  let cloudReadSettled = false;
  let cloudIndex: FyVoucherIndex | null = null;
  const cloudIndexRead: Promise<FyVoucherIndex | null> = online && fsCompanyId
    ? readFyVoucherIndexFromFirestore(fsCompanyId).then(
        (index) => {
          cloudReadSettled = true;
          cloudIndex = index;
          return index;
        },
        () => {
          cloudReadSettled = true;
          cloudIndex = null;
          return null;
        }
      )
    : Promise.resolve(null);

  // Give a warm Firestore index a brief head start. A cold EXE must start the
  // yielded local scan without waiting through the SDK's long reconnect backoff.
  if (online && fsCompanyId) {
    const earlyCloud = await Promise.race([
      cloudIndexRead,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
    ]);
    if (earlyCloud?.fyKeys.length) {
      await writeFyVoucherIndexToSqlite(companyId, earlyCloud).catch(() => {});
      return { index: earlyCloud, source: "firestore_cache", vouchersScanned: 0 };
    }
  }

  // Local projection — paginated date scan (yielded). Never block UI with giant `.all()`.
  console.info("[FY-SCAN] SQLite projection scan start", {
    companyId,
    companyIdKind: companyId === fsCompanyId ? "authoritative" : "local-mirror",
    cloudReadPending: online && !cloudReadSettled,
  });
  const fromSqlite = await rebuildIndexFromSqliteProjection(
    companyId,
    country,
    companyDates,
    onSqliteScanProgress
  );
  console.info("[FY-SCAN] ensureFyVoucherIndex sqlite projection", {
    companyId,
    source: fromSqlite.source,
    fyKeyCount: fromSqlite.index.fyKeys.length,
    keys: fromSqlite.index.fyKeys.slice(0, 12),
    minDateMs: fromSqlite.index.minDateMs,
    maxDateMs: fromSqlite.index.maxDateMs,
  });
  if (fromSqlite.index.fyKeys.length) {
    if (online && fsCompanyId) {
      if (cloudReadSettled && cloudIndex?.fyKeys.length) {
        const merged = mergeFyVoucherIndexes(fromSqlite.index, cloudIndex);
        await writeFyVoucherIndexToSqlite(companyId, merged).catch(() => {});
        void writeFyVoucherIndexToFirestore(fsCompanyId, merged).catch((err) => {
          console.warn("[ensureFyVoucherIndex] cloud merge from sqlite", err);
        });
        return { index: merged, source: fromSqlite.source, vouchersScanned: 0 };
      }

      // Do not keep the settings page waiting for a slow network read. Reconcile
      // late cloud keys in the background and refresh this view if it adds years.
      void cloudIndexRead
        .then(async (remote) => {
          const current = await readFyVoucherIndexFromSqlite(companyId).catch(() => null);
          const base = current?.fyKeys.length ? current : fromSqlite.index;
          const merged = remote?.fyKeys.length ? mergeFyVoucherIndexes(base, remote) : base;
          await writeFyVoucherIndexToSqlite(companyId, merged).catch(() => {});
          if (remote?.fyKeys.length && !fyVoucherIndexesEqual(base, merged)) {
            console.info("[FY-SCAN] late cloud FY index merged", {
              companyId,
              firestoreCompanyId: fsCompanyId,
              localFyKeyCount: base.fyKeys.length,
              cloudFyKeyCount: remote.fyKeys.length,
              mergedFyKeyCount: merged.fyKeys.length,
              keys: merged.fyKeys.slice(0, 16),
            });
            onIndexUpdate?.(merged, "firestore_cache");
          }
          await writeFyVoucherIndexToFirestore(fsCompanyId, merged);
        })
        .catch((err) => {
          console.warn("[ensureFyVoucherIndex] background cloud index reconcile", err);
        });
    }
    return { index: fromSqlite.index, source: fromSqlite.source, vouchersScanned: 0 };
  }

  if (online && fsCompanyId) {
    if (!cloudReadSettled) {
      const cloudAfterLocalScan = await Promise.race([
        cloudIndexRead,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
      ]);
      if (cloudAfterLocalScan?.fyKeys.length) {
        await writeFyVoucherIndexToSqlite(companyId, cloudAfterLocalScan).catch(() => {});
        return { index: cloudAfterLocalScan, source: "firestore_cache", vouchersScanned: 0 };
      }
    }

    console.info("[FY-SCAN] ensureFyVoucherIndex falling back to Firestore scan", {
      companyId,
      fsCompanyId,
    });
    const { index, vouchersScanned } = await rebuildIndexFromFirestoreScan({
      fsCompanyId,
      companyId,
      country,
      onProgress: onFirestoreScanProgress,
    });
    return { index, source: "firestore_scan", vouchersScanned };
  }

  return { index: fromSqlite.index, source: fromSqlite.source, vouchersScanned: 0 };
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

  const rebuilt = await rebuildIndexFromSqliteProjection(
    companyId,
    company.country,
    resolveCompanyFiscalYearDates(company as { fiscalYearStart?: unknown; fiscalYearEnd?: unknown }),
    onFirestoreScanProgress
      ? (scanned) => onFirestoreScanProgress(scanned)
      : undefined
  );
  return { index: rebuilt.index, source: rebuilt.source, vouchersScanned: 0 };
}

/** Min/max voucher dates from cached index (suggestion card). */
export function dateSpanFromFyVoucherIndex(index: FyVoucherIndex): {
  from: Date | null;
  to: Date | null;
} {
  const from = index.minDateMs != null ? new Date(index.minDateMs) : null;
  const to = index.maxDateMs != null ? new Date(index.maxDateMs) : null;
  if (from && to) return { from, to };
  if (from) return { from, to: from };
  if (to) return { from: to, to };
  return { from: null, to: null };
}

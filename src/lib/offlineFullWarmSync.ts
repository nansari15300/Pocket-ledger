"use client";

/**
 * Online hone par: plans localStorage merge, Firestore company root → SQLite pseudo-collection,
 * saari master/voucher mirrors parallel pull + HTTPS attachment blobs IndexedDB prefetch.
 * `OfflineWarmSyncManager` ise debounced call karta — UI block na ho.
 */

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Company } from "@/hooks/useCompany";
import {
  COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS,
  pullAllCompanySubcollectionsFromFirestoreToLocalDb,
} from "@/lib/firestoreToLocalCompanyPull";
import { mergeAppSettingsPlansDoc } from "@/lib/mergeAppSettingsPlans";
import { writeCachedPlansRecord } from "@/lib/plansCatalogCache";
import type { Plan, PlanId } from "@/config/plans";
import { decryptFirestoreCompanyDocIfNeeded, type ServerBackupCryptoContext } from "@/lib/serverBackupEncryption";
import { listCompanyDocsFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { stampLocalMirrorBackedByFirestore } from "@/lib/localMirrorServerMeta";
import { prefetchHttpsAttachmentUrls } from "@/lib/offlineAttachmentUrlCache";
import { auth } from "@/lib/firebase";
import { markEmbeddedFullWarmSucceeded } from "@/lib/embeddedWarmBootstrapFlags";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** `_firestore_company_root` SQLite row — authoritative company snapshot for offline dashboards */
export const COMPANY_ROOT_MIRROR_COLLECTION = "_firestore_company_root";
export const COMPANY_ROOT_MIRROR_DOC_ID = "_snapshot";

/** `useVouchers`/billing jaisi shape — Pull + mirror Firestore realtime ke liye (`OfflineWarmSyncManager` multi-company warm bhi yahi filter). */
export function isCloudBackedCompanyShape(c: Company | null): boolean {
  if (!c) return false;
  const so = String((c as { storageOption?: string }).storageOption || "").toLowerCase();
  if (so === "local") return false;
  if (so === "firebase") return true;
  if ((c as { syncedFromCloud?: boolean }).syncedFromCloud === true) return true;
  if (String((c as { syncPolicy?: string }).syncPolicy || "").toLowerCase() === "online") return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyC = c as any;
  if (String(anyC.authoritativeCompanyId || "").trim().length > 0) return true;
  return false;
}

const SCRAPE_SKIP_KEYS = new Set([
  "_meta",
  "history",
  "changelog",
  "approvalHistory",
]);

/** Nested doc se HTTPS attachment URLs scrape — voucher `fileUrls`/party `documents`/`fileUrl`, etc. */
export function scrapeHttpsAttachmentUrlsFromDocTree(value: unknown, out: Set<string>, depth: number): void {
  if (depth > 28) return;
  if (typeof value === "string") {
    const s = value.trim();
    if ((s.startsWith("http://") || s.startsWith("https://")) && s.length < 8000) out.add(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) scrapeHttpsAttachmentUrlsFromDocTree(item, out, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      // History/changelog blobs nahi scrape — noise + size
      if (skipAttachmentScrapeKey(k)) continue;
      scrapeHttpsAttachmentUrlsFromDocTree(o[k], out, depth + 1);
    }
  }
}

/** Nested keys skip — `_meta`/history/`__pl*` mirror noise */
function skipAttachmentScrapeKey(key: string): boolean {
  if (SCRAPE_SKIP_KEYS.has(key)) return true;
  if (/^__pl/i.test(key)) return true;
  if (/^__/i.test(key) && key.length > 60) return true;
  return false;
}

export async function scrapeLocalMirrorAttachmentUrls(localCompanyId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const paths = COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS as unknown as readonly string[];
  for (const collection of paths) {
    const rows = await listCompanyDocsFromBrowserDb(localCompanyId, collection, { forBackupMerge: true });
    for (const row of rows) {
      scrapeHttpsAttachmentUrlsFromDocTree(row, out, 0);
    }
  }
  return out;
}

async function mergePlansIntoLocalStorageBestEffort(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(firestore, "app_settings", "plans"));
    if (!snap.exists()) return false;
    const data = snap.data() as Record<string, unknown>;
    const list = mergeAppSettingsPlansDoc(data);
    const merged = {} as Record<PlanId, Plan>;
    for (const p of list) merged[p.id as PlanId] = p;
    writeCachedPlansRecord(merged);
    return true;
  } catch {
    return false;
  }
}

/**
 * Companies/{fsCompanyId} → SQLite `_firestore_company_root` — billing/plan fields offline dikhen
 */
async function mirrorCompanyFirestoreDocToSQLite(
  fsCompanyId: string,
  localCompanyId: string,
  company: Company | null
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(firestore, "companies", fsCompanyId));
    if (!snap.exists()) return false;
    const cryptoCtx: ServerBackupCryptoContext | null = company
      ? { encryptServerBackupSalt: (company as Company & { encryptServerBackupSalt?: string }).encryptServerBackupSalt }
      : null;
    let payload = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown>;
    const dec = await decryptFirestoreCompanyDocIfNeeded(
      payload as Record<string, unknown> & { id: string },
      cryptoCtx,
      localCompanyId
    );
    if (dec) payload = dec as Record<string, unknown>;
    const stamped = stampLocalMirrorBackedByFirestore(payload as Record<string, unknown>);
    await upsertCompanyDocInBrowserDb(localCompanyId, COMPANY_ROOT_MIRROR_COLLECTION, COMPANY_ROOT_MIRROR_DOC_ID, stamped, {
      notify: false,
      force: true,
    });
    return true;
  } catch (e) {
    console.warn("[offlineFullWarmSync] company root mirror failed", e);
    return false;
  }
}

export type OfflineFullWarmSyncResult = {
  plansOk: boolean;
  companyRootOk: boolean;
  subcollections: Array<{ path: string; count: number }>;
  attachmentUrlsSeen: number;
  prefetchCachedNew: number;
  prefetchSkippedCache: number;
  prefetchFailures: number;
};

/** First-login overlay: SQLite subcollection pull + attachment URL queue progress */
export type OfflineFullWarmProgressEvent =
  | { kind: "data_subcollection"; localCompanyId: string; path: string; completed: number; total: number }
  | { kind: "attachment_item"; localCompanyId: string; done: number; total: number };

export async function runOfflineFullWarmSync(options: {
  company: Company | null;
  localCompanyId: string;
  /** AbortController — tab switch ya app background par cancel */
  signal?: AbortSignal;
  /** Startup responsiveness mode: keep attachment prefetch off unless explicitly enabled. */
  includeAttachmentPrefetch?: boolean;
  /** Pehli-login loading rows — har subcollection / har attachment attempt */
  onProgress?: (e: OfflineFullWarmProgressEvent) => void;
}): Promise<OfflineFullWarmSyncResult | null> {
  const {
    company,
    localCompanyId,
    signal,
    onProgress,
    includeAttachmentPrefetch = false,
  } = options;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  if (!localCompanyId?.trim()) return null;
  if (!isCloudBackedCompanyShape(company)) return null;

  const fsCompanyId = String((company as { authoritativeCompanyId?: string }).authoritativeCompanyId || localCompanyId).trim();
  const isEmbeddedClient =
    (typeof window !== "undefined" && isCapacitorNativeApp()) ||
    (typeof window !== "undefined" && window.location.protocol === "file:");

  const result: OfflineFullWarmSyncResult = {
    plansOk: false,
    companyRootOk: false,
    subcollections: [],
    attachmentUrlsSeen: 0,
    prefetchCachedNew: 0,
    prefetchSkippedCache: 0,
    prefetchFailures: 0,
  };

  if (signal?.aborted) return null;

  result.plansOk = await mergePlansIntoLocalStorageBestEffort();

  if (signal?.aborted) return result;

  result.companyRootOk = await mirrorCompanyFirestoreDocToSQLite(fsCompanyId, localCompanyId.trim(), company);

  if (signal?.aborted) return result;

  const localTrim = localCompanyId.trim();
  result.subcollections = await pullAllCompanySubcollectionsFromFirestoreToLocalDb(
    fsCompanyId,
    localTrim,
    company,
    {
      onSubcollectionDone: (info) => {
        onProgress?.({
          kind: "data_subcollection",
          localCompanyId: localTrim,
          path: info.path,
          completed: info.completed,
          total: info.total,
        });
      },
    }
  );

  if (signal?.aborted) return result;

  if (!includeAttachmentPrefetch) {
    // Explicit startup policy: skip global attachment crawl/download and mark stage complete.
    result.attachmentUrlsSeen = 0;
    result.prefetchCachedNew = 0;
    result.prefetchSkippedCache = 0;
    result.prefetchFailures = 0;
    onProgress?.({ kind: "attachment_item", localCompanyId: localTrim, done: 1, total: 1 });
  } else {
    const urls = await scrapeLocalMirrorAttachmentUrls(localTrim);
    result.attachmentUrlsSeen = urls.size;

    const prefetch = await prefetchHttpsAttachmentUrls(urls, {
      concurrency: 6,
      // Auto-full cache mode: embedded app me strict warm caps se files offline miss ho rahi thi; upper budget badhao.
      maxTotalBytesApprox: isEmbeddedClient ? 2_500 * 1024 * 1024 : 350 * 1024 * 1024,
      maxUrls: isEmbeddedClient ? 20_000 : 2600,
      signal,
      onItemDone: (done, total) => {
        onProgress?.({ kind: "attachment_item", localCompanyId: localTrim, done, total });
      },
      // Attachment sync diagnostics: specific URL failures / retries ko trace karne ke liye concise item logs.
      onItemLog: (ev) => {
        if (ev.ok) {
          if (process.env.NODE_ENV !== "production") {
            console.debug("[offlineFullWarmSync:item]", { ok: true, attempt: ev.attempt, status: ev.status, note: ev.note, url: ev.url });
          }
        } else {
          console.warn("[offlineFullWarmSync:item]", {
            ok: false,
            attempt: ev.attempt,
            status: ev.status,
            retryable: ev.retryable,
            note: ev.note,
            url: ev.url,
          });
        }
      },
    });
    result.prefetchCachedNew = prefetch.cachedNew;
    result.prefetchSkippedCache = prefetch.skippedAlreadyCached;
    result.prefetchFailures = prefetch.failed + prefetch.skippedBudget;
  }

  try {
    if (process.env.NODE_ENV === "development") {
      console.debug("[offlineFullWarmSync] done", {
        fsCompanyId,
        vouchersApprox: result.subcollections.find((s) => s.path === "vouchers")?.count,
        urls: result.attachmentUrlsSeen,
        cachedNew: result.prefetchCachedNew,
      });
    }
  } catch {
    /* ignore */
  }

  // APK/EXE: agli cold start par idle `getIdToken`/plan-sync attachment race kam kare — sirf tab jab Firebase session maujood ho
  try {
    markEmbeddedFullWarmSucceeded(auth.currentUser?.uid ?? null);
  } catch {
    /* ignore */
  }

  return result;
}

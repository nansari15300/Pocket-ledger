"use client";

/**
 * Offline full-warm sync: HTTPS attachment bytes IndexedDB cache (Firestore mirror URLs only).
 * `FilePreview` / galley pe pehle yahan dekho → offline open after online preload.
 */

import { openDB, getPendingIndexedDbFullName } from "@/lib/offlineDb";
import {
  looksLikeFirebaseStorageDownloadUrl,
  tryGetBlobFromFirebaseStorageDownloadUrl,
} from "@/lib/storageGetBlobFromDownloadUrl";
import {
  looksLikeFirebaseStorageObjectPath,
  normalizeFirebaseStorageObjectPathForSdk,
  tryGetStoragePathFromFirebaseDownloadUrl,
} from "@/lib/firebaseStorageDownloadUrl";
import { storage } from "@/lib/firebase";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import {
  getAttachmentFileUriFromDataDir,
  readAttachmentBlobFromDataDir,
  writeAttachmentBlobToDataDir,
} from "@/lib/capacitorAttachmentFs";
import {
  getAttachmentFileRef,
  upsertAttachmentFileRef,
} from "@/lib/attachmentFileRefStore";
import { Capacitor } from "@capacitor/core";
import { getBlob, ref } from "firebase/storage";
import { computeSha256HexFromBlob } from "@/lib/security/sha256Hex";
import {
  fetchAttachmentRefBlob,
  isOfflineCacheableAttachmentRef,
  offlineCacheKeyForAttachmentRef,
} from "@/lib/attachmentRefBlobFetch";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";

/** Forensic: build par `NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG=1` — cache HIT/MISS / stable-key proof (temporary trace only). */
function offlineAttachmentForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

/** Bade PDF/scan offline bhi cache ho sakein — purana 40MB se kai vouchers miss ho rahe the. */
export const OFFLINE_ATTACHMENT_MAX_CACHED_BYTES = 96 * 1024 * 1024;

/** SHA-256 hex — stable IndexedDB primary key */
export async function offlineAttachmentStoreId(urlStr: string): Promise<string> {
  const trimmed = urlStr.trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trimmed));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Firebase signed URL token बदलने पर भी same file hit रहे: stable object-path आधारित alternate cache key. */
function getStableFirebaseObjectKey(urlStr: string): string | null {
  try {
    const raw = String(urlStr || "").trim();
    const pathFromDownloadUrl = tryGetStoragePathFromFirebaseDownloadUrl(raw);
    // Bare / encoded tail ko `voucher-files/…` me map karo taaki HTTPS vs relative same disk cache hit kare.
    const normForSdk = normalizeFirebaseStorageObjectPathForSdk(raw);
    let stable: string | null = null;
    if (pathFromDownloadUrl) stable = `firebase-object:${pathFromDownloadUrl}`;
    else if (
      /^voucher-files\//i.test(normForSdk) ||
      /^companies\//i.test(normForSdk) ||
      /^entity-files\//i.test(normForSdk)
    ) {
      stable = `firebase-object:${normForSdk.replace(/^\/+/, "")}`;
    }
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_STABLE_KEY]", {
        originalInput: urlStr,
        trimmed: raw,
        pathFromDownloadUrlParser: pathFromDownloadUrl,
        normalizedPathForSdk: normForSdk,
        stableFirebaseObjectKey: stable,
      });
    }
    return stable;
  } catch (e) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_STABLE_KEY]", {
        originalInput: urlStr,
        stableFirebaseObjectKey: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }
}

/** Cache lookup: HTTPS/Firebase path + `local:`/`drive:`/`PL_ATTACH_V1` (mobile/APK preload). */
function supportsOfflineAttachmentLookup(raw: string): boolean {
  return isOfflineCacheableAttachmentRef(raw);
}

/** IndexedDB/native key — `PL_ATTACH` decode karke stable ref. */
function offlineAttachmentCacheLookupKey(raw: string): string {
  const decoded = offlineCacheKeyForAttachmentRef(raw);
  return decoded || String(raw || "").trim();
}

async function getOfflineAttachmentStoreIdsForLookup(urlStr: string): Promise<string[]> {
  const trimmed = offlineAttachmentCacheLookupKey(urlStr);
  if (!supportsOfflineAttachmentLookup(urlStr)) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_STORE_IDS]", {
        originalInput: urlStr,
        trimmed,
        supportsLookup: false,
        hashIds: [],
        stableFirebaseObjectKey: null,
      });
    }
    return [];
  }
  const ids: string[] = [];
  const primaryHash = await offlineAttachmentStoreId(trimmed);
  ids.push(primaryHash);
  const stable = getStableFirebaseObjectKey(trimmed);
  let stableHash: string | null = null;
  if (stable) {
    stableHash = await offlineAttachmentStoreId(stable);
    ids.push(stableHash);
  }
  const uniq = Array.from(new Set(ids));
  if (offlineAttachmentForensicEnabled()) {
    console.warn("[FORENSIC_OFFLINE_CACHE_STORE_IDS]", {
      originalInput: urlStr,
      trimmed,
      supportsLookup: true,
      stableFirebaseObjectKey: stable,
      hashIdPrimary: primaryHash,
      hashIdStableAlias: stableHash,
      hashIds: uniq,
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    });
  }
  return uniq;
}

async function getOfflineAttachmentStoreIdsForWrite(urlStr: string): Promise<string[]> {
  // Write ke waqt exact URL + stable object-path dono keys persist karo for stronger cross-page/cache hit.
  return await getOfflineAttachmentStoreIdsForLookup(urlStr);
}

function isEligibleAttachmentHttpsUrl(raw: string): boolean {
  const u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  const lower = u.toLowerCase();
  // Common non-attachment / huge HTML pages skip
  if (/(youtube\.com|youtu\.be|vimeo\.com|facebook\.com|twitter\.com|maps\.google)/i.test(lower)) return false;
  return true;
}

/** Raw Firebase object-path (`voucher-files/...`) ko SDK se blob me resolve karo for static/offline cache warm. */
async function getBlobFromFirebaseObjectPath(path: string): Promise<Blob | null> {
  try {
    const storageRef = ref(storage, path);
    const blob = await getBlob(storageRef);
    return blob && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/** Warm prefetch worker — HTTPS/Storage path only (cache miss; caller pehle `getOfflineCached` check kare). */
export async function fetchHttpsAttachmentBlobForPrefetchMiss(
  url: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  const r = await blobFromHybridFetch(url.trim(), signal);
  return r.blob && r.blob.size > 0 ? r.blob : null;
}

async function blobFromHybridFetch(
  url: string,
  signal?: AbortSignal,
  /** Prefetch = lambi wait; UI hover/click = chhota cap taaki spinner 20s na atke */
  timeoutMs: number = PREFETCH_REQUEST_TIMEOUT_MS
): Promise<HybridFetchResult> {
  const objectPathForSdk = normalizeFirebaseStorageObjectPathForSdk(url);
  if (
    /^voucher-files\//i.test(objectPathForSdk) ||
    /^companies\//i.test(objectPathForSdk) ||
    /^entity-files\//i.test(objectPathForSdk)
  ) {
    // Mirrored rows me raw object-path ho to bhi cache hydrate ho; sirf HTTPS URLs par depend mat karo.
    const b = await runWithTimeoutSignal(
      () => getBlobFromFirebaseObjectPath(objectPathForSdk),
      timeoutMs,
      signal
    ).catch(() => null);
    if (b && b.size > 0) {
      return { blob: b, status: 200, retryable: false, source: "firebase_sdk" };
    }
    return { blob: null, status: null, retryable: true, source: "exception", error: "firebase_object_path_fetch_failed" };
  }
  if (!isEligibleAttachmentHttpsUrl(url)) {
    return { blob: null, status: null, retryable: false, source: "http_error", error: "ineligible_url" };
  }
  if (looksLikeFirebaseStorageDownloadUrl(url)) {
    const b = await runWithTimeoutSignal(
      (scopedSignal) => tryGetBlobFromFirebaseStorageDownloadUrl(url, scopedSignal),
      timeoutMs,
      signal
    ).catch(() => null);
    if (b && b.size > 0) {
      return { blob: b, status: 200, retryable: false, source: "firebase_sdk" };
    }
  }
  try {
    const res = await runWithTimeoutSignal(
      (scopedSignal) => fetch(url, { mode: "cors", credentials: "omit", signal: scopedSignal }),
      timeoutMs,
      signal
    );
    if (!res.ok) {
      const status = typeof res.status === "number" ? res.status : null;
      const retryable = status != null && RETRYABLE_HTTP.has(status);
      return {
        blob: null,
        status,
        retryable,
        source: "http_error",
        error: `http_${status ?? "unknown"}`,
      };
    }
    return { blob: await res.blob(), status: res.status, retryable: false, source: "http_fetch" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      blob: null,
      status: null,
      retryable: true,
      source: "exception",
      error: msg,
    };
  }
}

type CachedRow = {
  id: string;
  /** Original HTTPS — debug duplicate-key issues */
  url: string;
  blob: Blob;
  size: number;
  cachedAtMs: number;
  contentType: string | null;
};

type OfflineCacheMeta = {
  url: string;
  cachedAtMs: number;
};

export type OfflineCachedAttachmentNativeRef = {
  fileUri: string;
  displayUrl: string;
  contentType: string | null;
  size: number;
};

type HybridFetchResult = {
  blob: Blob | null;
  status: number | null;
  retryable: boolean;
  source: "firebase_sdk" | "http_fetch" | "http_error" | "exception";
  error?: string;
};

type PrefetchItemLogEvent = {
  url: string;
  attempt: number;
  status: number | null;
  ok: boolean;
  retryable: boolean;
  note: string;
};

const RETRYABLE_HTTP = new Set([429, 502, 503, 504]);
const PREFETCH_MAX_RETRIES = 3;
const PREFETCH_BASE_BACKOFF_MS = 350;
/** Stability guard: mobile warm-sync me zyada parallel download unstable; backfill 7 worker tak allow. */
const PREFETCH_CONCURRENCY_HARD_MAX = 8;
/** Per-item guard: hung request worker ko indefinite block na kare. */
const PREFETCH_REQUEST_TIMEOUT_MS = 20_000;
/** Hover / FilePreview / openAttachment — cache miss par poora warm timeout mat lagao (user “tick” slow feel). */
const UI_ATTACHMENT_CACHE_MISS_TIMEOUT_MS = 7_500;

/** Parent abort + timeout ko combine karke single request signal banata hai. */
async function runWithTimeoutSignal<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<T> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (parentSignal?.aborted) ctrl.abort();
  parentSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs));
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

/** Retry delay with exponential backoff + jitter — Firebase throttling burst me workers stagger ho jayein. */
function backoffDelayMs(attempt: number): number {
  const exp = PREFETCH_BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 160);
  return exp + jitter;
}

/** Debug log helper: item-level success/failure visibility while warm progress row aggregate rehta hai. */
function emitPrefetchLog(
  event: PrefetchItemLogEvent,
  onItemLog?: (event: PrefetchItemLogEvent) => void
): void {
  try {
    onItemLog?.(event);
  } catch {
    /* callback errors should never break sync */
  }
  try {
    const level = event.ok ? "debug" : event.retryable ? "warn" : "error";
    const msg = `[offlineAttachmentUrlCache] ${event.ok ? "OK" : "FAIL"} attempt=${event.attempt} status=${event.status ?? "n/a"} note=${event.note}`;
    if (level === "error") console.error(msg, event.url);
    else if (level === "warn") console.warn(msg, event.url);
    else if (process.env.NODE_ENV !== "production") console.debug(msg, event.url);
  } catch {
    /* ignore logging failures */
  }
}

/** Capacitor cache: URL hash id -> DataDirectory file path + SQLite metadata row. */
function offlineCacheDataDirPath(id: string, contentType?: string | null): string {
  let ext = "bin";
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("pdf")) ext = "pdf";
  else if (ct.includes("jpeg")) ext = "jpg";
  else if (ct.includes("png")) ext = "png";
  else if (ct.includes("webp")) ext = "webp";
  else if (ct.includes("gif")) ext = "gif";
  return `attachments/offline-cache/${id}.${ext}`;
}

/** Warm sync / preview: IndexedDB cache read */
export async function getOfflineCachedAttachmentBlob(urlStr: string): Promise<Blob | null> {
  if (!supportsOfflineAttachmentLookup(urlStr)) return null;
  try {
    const ids = await getOfflineAttachmentStoreIdsForLookup(urlStr.trim());
    if (ids.length === 0) return null;
    if (isCapacitorNativeApp()) {
      for (const id of ids) {
        const row = await getAttachmentFileRef("offline_cache", id);
        if (!row) continue;
        const b = await readAttachmentBlobFromDataDir(
          row.filePath,
          row.contentType,
          row.sha256Hex ?? undefined
        );
        if (b && b.size > 0) {
          if (offlineAttachmentForensicEnabled()) {
            console.warn("[FORENSIC_OFFLINE_CACHE_READ]", {
              originalInput: urlStr,
              cacheHit: true,
              blobSource: "native_data_dir_via_offline_cache_sqlite_row",
              idMatched: id,
              byteSize: b.size,
              navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
            });
          }
          return b;
        }
      }
      if (offlineAttachmentForensicEnabled()) {
        console.warn("[FORENSIC_OFFLINE_CACHE_READ]", {
          originalInput: urlStr,
          cacheHit: false,
          blobSource: null,
          idsTried: ids,
          store: "native_offline_cache",
          navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        });
      }
      return null;
    }
    if (typeof indexedDB === "undefined") return null;
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_IDB_BLOB]", {
        phase: "indexeddb_read_path_before_openDB",
        dbName: getPendingIndexedDbFullName(),
        store: "offlineAttachmentBlobs",
        originalInputSample: String(urlStr).slice(0, 160),
      });
    }
    const db = await openDB();
    return await new Promise<Blob | null>((resolve) => {
      try {
        const tx = db.transaction("offlineAttachmentBlobs", "readonly");
        const st = tx.objectStore("offlineAttachmentBlobs");
        const tryAt = (idx: number) => {
          if (idx >= ids.length) {
            if (offlineAttachmentForensicEnabled()) {
              console.warn("[FORENSIC_OFFLINE_CACHE_READ]", {
                originalInput: urlStr,
                cacheHit: false,
                blobSource: null,
                idsTried: ids,
                store: "indexeddb_offlineAttachmentBlobs",
                navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
              });
            }
            resolve(null);
            return;
          }
          const req = st.get(ids[idx]!);
          req.onerror = () => tryAt(idx + 1);
          req.onsuccess = () => {
            const row = req.result as CachedRow | undefined;
            if (row?.blob && row.blob.size) {
              if (offlineAttachmentForensicEnabled()) {
                console.warn("[FORENSIC_OFFLINE_CACHE_READ]", {
                  originalInput: urlStr,
                  cacheHit: true,
                  blobSource: "indexeddb_offlineAttachmentBlobs",
                  idMatched: ids[idx],
                  byteSize: row.blob.size,
                  navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
                });
              }
              resolve(row.blob);
            } else tryAt(idx + 1);
          };
        };
        tryAt(0);
      } catch {
        if (offlineAttachmentForensicEnabled()) {
          console.warn("[FORENSIC_OFFLINE_CACHE_READ]", {
            originalInput: urlStr,
            cacheHit: false,
            blobSource: null,
            error: "indexeddb_transaction_throw",
          });
        }
        resolve(null);
      }
    });
  } catch (e) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_READ]", {
        originalInput: urlStr,
        cacheHit: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }
}

/** Native fast-path: cached HTTPS attachment ke liye direct `convertFileSrc` URL (no JS blob/base64 bridge). */
export async function getOfflineCachedAttachmentNativeRef(
  urlStr: string
): Promise<OfflineCachedAttachmentNativeRef | null> {
  if (!isCapacitorNativeApp()) return null;
  if (!supportsOfflineAttachmentLookup(urlStr)) return null;
  try {
    const ids = await getOfflineAttachmentStoreIdsForLookup(urlStr.trim());
    if (ids.length === 0) return null;
    for (const id of ids) {
      const row = await getAttachmentFileRef("offline_cache", id);
      if (!row?.filePath) continue;
      const fileUri = await getAttachmentFileUriFromDataDir(row.filePath);
      if (!fileUri) continue;
      return {
        fileUri,
        displayUrl: Capacitor.convertFileSrc(fileUri),
        contentType: row.contentType ?? null,
        size: Number(row.size || 0),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function putCachedBlob(urlStr: string, blob: Blob): Promise<void> {
  if (!blob?.size || blob.size > OFFLINE_ATTACHMENT_MAX_CACHED_BYTES) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_PUT]", {
        originalInput: urlStr,
        skipped: true,
        reason: !blob?.size ? "empty_blob" : "over_max_bytes",
        blobSize: blob?.size ?? 0,
      });
    }
    return;
  }
  const ids = await getOfflineAttachmentStoreIdsForWrite(urlStr.trim());
  if (offlineAttachmentForensicEnabled()) {
    console.warn("[FORENSIC_OFFLINE_CACHE_PUT]", {
      originalInput: urlStr,
      blobSize: blob.size,
      contentType: blob.type || null,
      hashIdsWritten: ids,
      targetStore: isCapacitorNativeApp() ? "native_offline_cache_sqlite+datadir" : "indexeddb_offlineAttachmentBlobs",
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    });
  }
  if (isCapacitorNativeApp()) {
    // Capacitor/mobile: bytes file-system me; SQLite row me path+meta to avoid IndexedDB blob overhead.
    const canonicalId = ids[0];
    if (!canonicalId) return;
    const path = offlineCacheDataDirPath(canonicalId, blob.type || null);
    const ok = await writeAttachmentBlobToDataDir(path, blob);
    if (!ok) return;
    const sha256Hex = await computeSha256HexFromBlob(blob);
    const meta: OfflineCacheMeta = { url: urlStr.trim(), cachedAtMs: Date.now() };
    // Same file ko multiple lookup keys (signed URL variants) se hit karne ke liye same path sab ids par map karo.
    for (const id of ids) {
      await upsertAttachmentFileRef({
        scope: "offline_cache",
        id,
        filePath: path,
        contentType: blob.type?.trim() || null,
        size: blob.size,
        metaJson: JSON.stringify(meta),
        updatedAt: meta.cachedAtMs,
        sha256Hex,
      });
    }
    return;
  }
  const baseRow = {
    url: urlStr.trim(),
    blob,
    size: blob.size,
    cachedAtMs: Date.now(),
    contentType: blob.type?.trim() || null,
  };
  try {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_PENDING_IDB_BLOB]", {
        phase: "indexeddb_write_path_before_openDB",
        dbName: getPendingIndexedDbFullName(),
        store: "offlineAttachmentBlobs",
        urlSample: urlStr.trim().slice(0, 160),
        blobSize: blob.size,
      });
    }
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("offlineAttachmentBlobs", "readwrite");
      tx.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      try {
        const st = tx.objectStore("offlineAttachmentBlobs");
        for (const id of ids) {
          st.put({
            id,
            ...baseRow,
          } satisfies CachedRow);
        }
      } catch {
        resolve();
      }
    });
  } catch {
    /* quota — ignore warm row */
  }
}

/**
 * Preview path: SDK/fetch ke pehle cache; successful download ko background me IndexedDB rakho (offline rerun).
 */
export type RemoteAttachmentBlobPreferCacheOptions = {
  /** `drive:` par gallery me parallel `local:` ho to pehle wahi bytes use karo. */
  galleryUrls?: readonly string[];
};

export async function getRemoteAttachmentBlobPreferOfflineCache(
  urlStr: string,
  signal?: AbortSignal,
  preferCacheOptions?: RemoteAttachmentBlobPreferCacheOptions
): Promise<Blob | null> {
  const trimmed = offlineAttachmentCacheLookupKey(urlStr);
  if (!supportsOfflineAttachmentLookup(urlStr)) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_REMOTE_PREFER]", {
        originalInput: urlStr,
        trimmed,
        outcome: "unsupported_lookup_string",
        finalBlobSource: null,
      });
    }
    return null;
  }
  const cached = await getOfflineCachedAttachmentBlob(trimmed);
  if (cached && cached.size > 0) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_REMOTE_PREFER]", {
        originalInput: urlStr,
        trimmed,
        outcome: "return_primary_cache_hit",
        finalBlobSource: "indexeddb_or_native_cache_via_getOfflineCachedAttachmentBlob",
        byteSize: cached.size,
        navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
      });
    }
    return cached;
  }
  // Tail-only mirror key alag ho to normalized path se doosri cache key try karo.
  const altKey = /^https?:\/\//i.test(trimmed) ? "" : normalizeFirebaseStorageObjectPathForSdk(trimmed);
  if (altKey && altKey !== trimmed) {
    const altCached = await getOfflineCachedAttachmentBlob(altKey);
    if (altCached && altCached.size > 0) {
      if (offlineAttachmentForensicEnabled()) {
        console.warn("[FORENSIC_OFFLINE_CACHE_REMOTE_PREFER]", {
          originalInput: urlStr,
          trimmed,
          altKey,
          outcome: "return_alt_key_cache_hit",
          finalBlobSource: "indexeddb_or_native_cache_via_alt_normalized_key",
          byteSize: altCached.size,
          navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        });
      }
      return altCached;
    }
  }

  // Cache miss + offline: network/SDK fetch mat chalao — warna lamba hang / spinner (`HoverPreviewHttpsAwareImage`).
  // APK WebView: `navigator.onLine` kabhi galat false hota hai jab Firebase chal raha ho — thumbnail mat roko.
  if (typeof navigator !== "undefined" && !navigator.onLine && !isCapacitorNativeApp()) {
    if (offlineAttachmentForensicEnabled()) {
      console.warn("[FORENSIC_OFFLINE_CACHE_REMOTE_PREFER]", {
        originalInput: urlStr,
        trimmed,
        altKey: altKey || null,
        outcome: "offline_bailout_no_network_fetch",
        reason: "navigator.offline_and_not_capacitor",
        finalBlobSource: null,
        isCapacitorNativeApp: isCapacitorNativeApp(),
      });
    }
    return null;
  }

  const fetchTarget = altKey && altKey !== trimmed && !/^https?:\/\//i.test(trimmed) ? altKey : trimmed;
  let fresh: Blob | null = null;
  const isDeviceRef = isLocalFileRef(trimmed) || isDriveFileRef(trimmed);
  let fetchResult: HybridFetchResult | null = null;
  if (isDeviceRef) {
    // `local:` / `drive:` — pending bytes pehle, phir Drive API (Firebase-style preload cache miss).
    fresh = await fetchAttachmentRefBlob(urlStr, {
      signal,
      galleryUrls: preferCacheOptions?.galleryUrls,
    });
  } else {
    fetchResult = await blobFromHybridFetch(fetchTarget, signal, UI_ATTACHMENT_CACHE_MISS_TIMEOUT_MS);
    fresh = fetchResult.blob;
  }
  if (offlineAttachmentForensicEnabled()) {
    console.warn("[FORENSIC_OFFLINE_CACHE_REMOTE_PREFER]", {
      originalInput: urlStr,
      trimmed,
      fetchTarget,
      hybridFetchSource: fetchResult?.source ?? (isDeviceRef ? "device_ref_fetch" : null),
      hybridFetchStatus: fetchResult?.status ?? null,
      hybridFetchError: fetchResult?.error ?? null,
      outcome: fresh && fresh.size > 0 ? "network_or_sdk_fresh_blob" : "fetch_returned_empty",
      finalBlobSource:
        fresh && fresh.size > 0
          ? isDeviceRef
            ? "local_pending_or_drive_api"
            : fetchResult?.source === "firebase_sdk"
              ? "firebase_sdk_getBlob_or_tryGetBlobFromFirebaseStorageDownloadUrl"
              : fetchResult?.source === "http_fetch"
                ? "http_fetch_cors"
                : String(fetchResult?.source ?? "unknown")
          : null,
      byteSize: fresh?.size ?? 0,
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    });
  }
  if (fresh?.size && fresh.size <= OFFLINE_ATTACHMENT_MAX_CACHED_BYTES) {
    void putCachedBlob(trimmed, fresh);
  }
  return fresh;
}

export type PrefetchAttachmentsProgress = {
  /** Success (new disk bytes) */
  cachedNew: number;
  skippedAlreadyCached: number;
  skippedBudget: number;
  failed: number;
};

/**
 * Bounded concurrent prefetch — full warm sync; existing cache ids skip GET.
 */
export async function prefetchHttpsAttachmentUrls(
  urls: Iterable<string>,
  options?: {
    /** Default 6 — zyada par mobile CPU/network saturate */
    concurrency?: number;
    /** Total byte budget rough cap (warm run). */
    maxTotalBytesApprox?: number;
    /** Max DISTINCT URLs attempted */
    maxUrls?: number;
    /** Visible ledger / UI — same run me pehle attempt; baaki mirror URLs skip nahi, sirf order */
    prioritizeUrls?: readonly string[];
    signal?: AbortSignal;
    /** Har URL attempt complete — first-login overlay attachment row % ke liye */
    onItemDone?: (done: number, total: number) => void;
    /** Per-item detailed log hook (success/failure/status) — diagnostics / telemetry ke liye. */
    onItemLog?: (event: PrefetchItemLogEvent) => void;
  }
): Promise<PrefetchAttachmentsProgress> {
  const uniq = [
    ...new Set(
      [...urls]
        .map((u) => offlineCacheKeyForAttachmentRef(String(u || "")) || String(u || "").trim())
        .filter((value) => value && isOfflineCacheableAttachmentRef(value))
    ),
  ];
  if (offlineAttachmentForensicEnabled()) {
    const rawDistinct = [...new Set([...urls].map((u) => String(u || "").trim()).filter((s) => s.length > 0))];
    const rejected = rawDistinct.filter((v) => !isOfflineCacheableAttachmentRef(v));
    console.warn("[FORENSIC_PREFETCH_INPUT_FILTER]", {
      rawDistinctCount: rawDistinct.length,
      acceptedDistinctCount: uniq.length,
      rejectedDistinctCount: rejected.length,
      rejectedSample: rejected.slice(0, 60),
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    });
  }
  uniq.sort(); // deterministic — prioritize ke baad baaki company files stable order
  const maxUrls = typeof options?.maxUrls === "number" ? Math.max(0, options.maxUrls) : 2500;
  const seenOrdered = new Set<string>();
  const ordered: string[] = [];
  for (const raw of options?.prioritizeUrls ?? []) {
    const value = offlineCacheKeyForAttachmentRef(String(raw || "")) || String(raw || "").trim();
    if (!value || !isOfflineCacheableAttachmentRef(value)) continue;
    if (seenOrdered.has(value)) continue;
    seenOrdered.add(value);
    ordered.push(value);
  }
  for (const value of uniq) {
    if (seenOrdered.has(value)) continue;
    seenOrdered.add(value);
    ordered.push(value);
  }
  const list = ordered.slice(0, maxUrls);
  // Strict pool cap: caller kitni bhi badi value de, worker pool max 6 hi rahe.
  const concurrency = Math.max(1, Math.min(PREFETCH_CONCURRENCY_HARD_MAX, options?.concurrency ?? 6));
  let remainingBudget = typeof options?.maxTotalBytesApprox === "number" ? Math.max(0, options!.maxTotalBytesApprox!) : 350 * 1024 * 1024;
  if (process.env.NODE_ENV === "development") {
    console.log("[offlineAttachmentUrlCache] prefetch_start", {
      inputUnique: uniq.length,
      totalItems: list.length,
      maxUrls,
      concurrency,
      remainingBudget,
    });
  }

  const progress: PrefetchAttachmentsProgress = {
    cachedNew: 0,
    skippedAlreadyCached: 0,
    skippedBudget: 0,
    failed: 0,
  };

  const totalItems = list.length;
  let doneItems = 0;
  const bump = () => {
    doneItems++;
    options?.onItemDone?.(doneItems, totalItems);
  };

  // Ek hi FIFO chain — parallel workers ki `remainingBudget` double-spend avoid
  let budgetChain = Promise.resolve();
  /** Bytes reserve karna — microtask FIFO se safe taaki prefetch cap stable rahe */
  function reserveBytesOrFail(bytes: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      budgetChain = budgetChain
        .then(() => {
          if (typeof bytes !== "number" || bytes <= 0 || bytes > remainingBudget) {
            resolve(false);
            return;
          }
          remainingBudget -= bytes;
          resolve(true);
        })
        .catch(() => resolve(false));
    });
  }

  let idx = 0;
  async function worker(): Promise<void> {
    for (;;) {
      if (options?.signal?.aborted) return;
      const i = idx++;
      if (i >= list.length) return;
      const u = list[i];
      if (process.env.NODE_ENV === "development") {
        console.log("[offlineAttachmentUrlCache] worker_start", { index: i, total: list.length, url: u });
      }
      try {
        const existing = await getOfflineCachedAttachmentBlob(u);
        if (existing?.size) {
          progress.skippedAlreadyCached++;
          emitPrefetchLog(
            {
              url: u,
              attempt: 0,
              status: 200,
              ok: true,
              retryable: false,
              note: "already_cached",
            },
            options?.onItemLog
          );
          bump();
          continue;
        }
        let wrote = false;
        for (let attempt = 1; attempt <= PREFETCH_MAX_RETRIES; attempt++) {
          if (options?.signal?.aborted) break;
          let blob: Blob | null = null;
          let prefetchStatus: number | null = 200;
          let prefetchRetryable = false;
          let prefetchNote = "cached_new";
          if (isLocalFileRef(u) || isDriveFileRef(u)) {
            blob = await fetchAttachmentRefBlob(u, { signal: options?.signal });
            if (!blob?.size) {
              prefetchStatus = null;
              prefetchRetryable = true;
              prefetchNote = "device_ref_fetch_failed";
            }
          } else {
            const fetched = await blobFromHybridFetch(u, options?.signal);
            blob = fetched.blob;
            prefetchStatus = fetched.status;
            prefetchRetryable = fetched.retryable;
            prefetchNote = fetched.error || fetched.source;
          }
          if (!blob?.size) {
            emitPrefetchLog(
              {
                url: u,
                attempt,
                status: prefetchStatus,
                ok: false,
                retryable: prefetchRetryable,
                note: prefetchNote,
              },
              options?.onItemLog
            );
            if (prefetchRetryable && attempt < PREFETCH_MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
              continue;
            }
            break;
          }
          const reserved = await reserveBytesOrFail(blob.size);
          if (!reserved) {
            progress.skippedBudget++;
            emitPrefetchLog(
              {
                url: u,
                attempt,
                status: 0,
                ok: false,
                retryable: false,
                note: "budget_exceeded",
              },
              options?.onItemLog
            );
            break;
          }
          if (process.env.NODE_ENV === "development") {
            console.log("[offlineAttachmentUrlCache] cache_write_begin", {
              url: u,
              attempt,
              size: blob.size,
              contentType: blob.type || null,
            });
          }
          await putCachedBlob(u, blob);
          wrote = true;
          emitPrefetchLog(
            {
              url: u,
              attempt,
              status: prefetchStatus,
              ok: true,
              retryable: false,
              note: "cached_new",
            },
            options?.onItemLog
          );
          break;
        }
        if (wrote) progress.cachedNew++;
        else progress.failed++;
        bump();
      } catch (e) {
        progress.failed++;
        // Worker catch debug: network/path/fs exceptions direct logcat/inspect me readable rahein.
        console.error("[offlineAttachmentUrlCache] worker_catch", {
          url: u,
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        emitPrefetchLog(
          {
            url: u,
            attempt: PREFETCH_MAX_RETRIES,
            status: null,
            ok: false,
            retryable: true,
            note: e instanceof Error ? e.message : "worker_exception",
          },
          options?.onItemLog
        );
        bump();
      }
    }
  }

  if (totalItems === 0) {
    options?.onItemDone?.(0, 0);
  } else {
    // UI ko turant denominator mil jaye; pehla item slow/hang ho tab bhi 0/N visible rahe.
    options?.onItemDone?.(0, totalItems);
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));
  if (offlineAttachmentForensicEnabled()) {
    console.warn("[FORENSIC_PREFETCH_RUN_SUMMARY]", {
      progress,
      totalItems,
      attemptedListLength: list.length,
      maxUrlsApplied: maxUrls,
      navigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    });
  }
  return progress;
}

"use client";

/**
 * Offline full-warm sync: HTTPS attachment bytes IndexedDB cache (Firestore mirror URLs only).
 * `FilePreview` / galley pe pehle yahan dekho → offline open after online preload.
 */

import { openDB } from "@/lib/offlineDb";
import {
  looksLikeFirebaseStorageDownloadUrl,
  tryGetBlobFromFirebaseStorageDownloadUrl,
} from "@/lib/storageGetBlobFromDownloadUrl";

/** Bade files / CDN video — prefetch budget se exclude (bytes). */
export const OFFLINE_ATTACHMENT_MAX_CACHED_BYTES = 40 * 1024 * 1024;

/** SHA-256 hex — stable IndexedDB primary key */
export async function offlineAttachmentStoreId(urlStr: string): Promise<string> {
  const trimmed = urlStr.trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trimmed));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isEligibleAttachmentHttpsUrl(raw: string): boolean {
  const u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  const lower = u.toLowerCase();
  // Common non-attachment / huge HTML pages skip
  if (/(youtube\.com|youtu\.be|vimeo\.com|facebook\.com|twitter\.com|maps\.google)/i.test(lower)) return false;
  return true;
}

async function blobFromHybridFetch(url: string, signal?: AbortSignal): Promise<Blob | null> {
  if (!isEligibleAttachmentHttpsUrl(url)) return null;
  if (looksLikeFirebaseStorageDownloadUrl(url)) {
    const b = await tryGetBlobFromFirebaseStorageDownloadUrl(url, signal);
    if (b && b.size > 0) return b;
  }
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit", signal });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
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

/** Warm sync / preview: IndexedDB cache read */
export async function getOfflineCachedAttachmentBlob(urlStr: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined" || !urlStr?.trim()?.startsWith("http")) return null;
  try {
    const id = await offlineAttachmentStoreId(urlStr.trim());
    const db = await openDB();
    return await new Promise<Blob | null>((resolve, reject) => {
      try {
        const tx = db.transaction("offlineAttachmentBlobs", "readonly");
        const st = tx.objectStore("offlineAttachmentBlobs");
        const req = st.get(id);
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const row = req.result as CachedRow | undefined;
          resolve(row?.blob && row.blob.size ? row.blob : null);
        };
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function putCachedBlob(urlStr: string, blob: Blob): Promise<void> {
  if (!blob?.size || blob.size > OFFLINE_ATTACHMENT_MAX_CACHED_BYTES) return;
  const id = await offlineAttachmentStoreId(urlStr.trim());
  const row: CachedRow = {
    id,
    url: urlStr.trim(),
    blob,
    size: blob.size,
    cachedAtMs: Date.now(),
    contentType: blob.type?.trim() || null,
  };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("offlineAttachmentBlobs", "readwrite");
      tx.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      try {
        tx.objectStore("offlineAttachmentBlobs").put(row);
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
export async function getRemoteAttachmentBlobPreferOfflineCache(
  urlStr: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith("http")) return null;
  const cached = await getOfflineCachedAttachmentBlob(trimmed);
  if (cached && cached.size > 0) return cached;

  const fresh = await blobFromHybridFetch(trimmed, signal);
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
    signal?: AbortSignal;
  }
): Promise<PrefetchAttachmentsProgress> {
  const uniq = [...new Set([...urls].filter((u) => isEligibleAttachmentHttpsUrl(u)))];
  uniq.sort(); // deterministic
  const maxUrls = typeof options?.maxUrls === "number" ? Math.max(0, options.maxUrls) : 2500;
  const list = uniq.slice(0, maxUrls);
  const concurrency = Math.max(1, Math.min(12, options?.concurrency ?? 6));
  let remainingBudget = typeof options?.maxTotalBytesApprox === "number" ? Math.max(0, options!.maxTotalBytesApprox!) : 350 * 1024 * 1024;

  const progress: PrefetchAttachmentsProgress = {
    cachedNew: 0,
    skippedAlreadyCached: 0,
    skippedBudget: 0,
    failed: 0,
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
      try {
        const existing = await getOfflineCachedAttachmentBlob(u);
        if (existing?.size) {
          progress.skippedAlreadyCached++;
          continue;
        }
        const blob = await blobFromHybridFetch(u, options?.signal);
        if (!blob?.size) {
          progress.failed++;
          continue;
        }
        const reserved = await reserveBytesOrFail(blob.size);
        if (!reserved) {
          progress.skippedBudget++;
          progress.failed++;
          continue;
        }
        await putCachedBlob(u, blob);
        progress.cachedNew++;
      } catch {
        progress.failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));
  return progress;
}

"use client";

/**
 * Attachment backup se pehle: bytes verify + (web) server prefetch.
 * Static APK / EXE: local cache pehle; server download sirf missing refs (2nd pass).
 */

import {
  collectAttachmentRefsFromBackupData,
  probeAttachmentRefForBackup,
} from "@/lib/attachmentBackupBundle";
import type { IncrementalAttachmentCache } from "@/lib/incrementalBackupFromLocation";
import { refsMissingFromIncrementalCache } from "@/lib/incrementalBackupFromLocation";
import { backupPrefersLocalSnapshot } from "@/lib/backupLocalFirst";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";
import {
  prefetchHttpsAttachmentUrls,
  type PrefetchAttachmentsProgress,
} from "@/lib/offlineAttachmentUrlCache";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

const HTTPS_REF = /^https?:\/\//i;
const VERIFY_CONCURRENCY = 4;

export type BackupAttachmentPreflightResult = {
  totalRefs: number;
  remoteRefs: number;
  localRefs: number;
  prefetch: PrefetchAttachmentsProgress;
  verifiedCount: number;
  /** Prefetch + verify ke baad bhi bytes na mile — backup embed se pehle fail karo. */
  missingRefs: string[];
};

function isRemoteAttachmentRef(ref: string): boolean {
  const s = ref.trim();
  if (!s) return false;
  if (isLocalFileRef(s)) return false;
  return HTTPS_REF.test(s) || looksLikeFirebaseStorageObjectPath(s);
}

/** Parallel verify — backup preflight me har ref ke bytes check. */
async function verifyRefsResolvable(
  refs: string[],
  signal: AbortSignal | undefined,
  onItem?: (done: number, total: number) => void
): Promise<{ ok: string[]; missing: string[] }> {
  const ok: string[] = [];
  const missing: string[] = [];
  const total = refs.length;
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Backup cancelled", "AbortError");
      const i = next++;
      if (i >= refs.length) return;
      const ref = refs[i]!;
      const resolved = await probeAttachmentRefForBackup(ref, signal);
      if (resolved) ok.push(ref);
      else missing.push(ref);
      done += 1;
      onItem?.(done, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(VERIFY_CONCURRENCY, refs.length || 1) }, () => worker())
  );
  return { ok, missing };
}

async function prefetchRemoteRefs(
  refs: string[],
  options: {
    signal?: AbortSignal;
    detail: string;
    onProgress?: (p: { done: number; total: number; detail: string }) => void;
  }
): Promise<PrefetchAttachmentsProgress> {
  if (refs.length === 0) {
    return { cachedNew: 0, skippedAlreadyCached: 0, skippedBudget: 0, failed: 0 };
  }
  const embedded = isStaticAppBuild() || backupPrefersLocalSnapshot();
  return prefetchHttpsAttachmentUrls(refs, {
    concurrency: 6,
    maxUrls: embedded ? 50_000 : 12_000,
    maxTotalBytesApprox: embedded ? 8_000 * 1024 * 1024 : 2_500 * 1024 * 1024,
    signal: options.signal,
    onItemDone: (done, total) => {
      options.onProgress?.({ done, total, detail: options.detail });
    },
  });
}

/** Backup embed se pehle: remote refs server/cache se prefetch, phir saari refs verify. */
export async function preflightBackupAttachmentsBeforeEmbed(options: {
  backupData: Record<string, unknown>;
  /** Pichle backup location se — in refs ke liye server download skip. */
  incrementalCache?: IncrementalAttachmentCache;
  signal?: AbortSignal;
  onProgress?: (p: { done: number; total: number; detail: string }) => void;
}): Promise<BackupAttachmentPreflightResult> {
  const allRefs = collectAttachmentRefsFromBackupData(options.backupData);
  const cache = options.incrementalCache ?? new Map();
  const refsNeedingFetch = refsMissingFromIncrementalCache(allRefs, cache);
  const remoteRefs = refsNeedingFetch.filter(isRemoteAttachmentRef);
  const localRefs = refsNeedingFetch.filter((r) => !isRemoteAttachmentRef(r));

  const emptyPrefetch: PrefetchAttachmentsProgress = {
    cachedNew: 0,
    skippedAlreadyCached: 0,
    skippedBudget: 0,
    failed: 0,
  };

  if (allRefs.length === 0) {
    return {
      totalRefs: 0,
      remoteRefs: 0,
      localRefs: 0,
      prefetch: emptyPrefetch,
      verifiedCount: 0,
      missingRefs: [],
    };
  }

  const online = typeof navigator !== "undefined" && navigator.onLine;
  let prefetch = emptyPrefetch;
  const localFirst = backupPrefersLocalSnapshot();

  let missingRefs: string[] = [];

  if (localFirst) {
    options.onProgress?.({
      done: 0,
      total: refsNeedingFetch.length,
      detail: "Checking local attachment files…",
    });
    const first = await verifyRefsResolvable(refsNeedingFetch, options.signal, (done, total) => {
      options.onProgress?.({ done, total, detail: "Checking local attachment files…" });
    });
    missingRefs = first.missing;

    const needDownload = missingRefs.filter(isRemoteAttachmentRef);
    if (online && needDownload.length > 0 && !options.signal?.aborted) {
      options.onProgress?.({
        done: 0,
        total: needDownload.length,
        detail: "Downloading missing attachment files…",
      });
      prefetch = await prefetchRemoteRefs(needDownload, {
        signal: options.signal,
        detail: "Downloading missing attachment files…",
        onProgress: options.onProgress,
      });
      const retryVerify = await verifyRefsResolvable(needDownload, options.signal);
      const fixedAfterRetry = new Set(retryVerify.ok);
      missingRefs = missingRefs.filter((r) => !fixedAfterRetry.has(r));
    }
  } else {
    if (online && remoteRefs.length > 0) {
      options.onProgress?.({
        done: 0,
        total: remoteRefs.length,
        detail: "Downloading attachment files from server…",
      });
      prefetch = await prefetchRemoteRefs(remoteRefs, {
        signal: options.signal,
        detail: "Downloading attachment files from server…",
        onProgress: options.onProgress,
      });
    }

    options.onProgress?.({
      done: 0,
      total: refsNeedingFetch.length,
      detail: "Verifying attachment files…",
    });
    const first = await verifyRefsResolvable(refsNeedingFetch, options.signal, (done, total) => {
      options.onProgress?.({ done, total, detail: "Verifying attachment files…" });
    });
    missingRefs = first.missing;

    const retryRemote = missingRefs.filter(isRemoteAttachmentRef);
    if (online && retryRemote.length > 0 && !options.signal?.aborted) {
      options.onProgress?.({
        done: 0,
        total: retryRemote.length,
        detail: "Retrying missing attachment files…",
      });
      await prefetchRemoteRefs(retryRemote, {
        signal: options.signal,
        detail: "Retrying missing attachment files…",
        onProgress: options.onProgress,
      });
      const retryVerify = await verifyRefsResolvable(retryRemote, options.signal);
      const fixedAfterRetry = new Set(retryVerify.ok);
      missingRefs = missingRefs.filter((r) => !fixedAfterRetry.has(r));
    }
  }

  const verifiedCount = allRefs.length - missingRefs.length;

  return {
    totalRefs: allRefs.length,
    remoteRefs: remoteRefs.length,
    localRefs: localRefs.length,
    prefetch,
    verifiedCount,
    missingRefs,
  };
}

/** User-facing error — kitni files miss hui. */
export function formatBackupAttachmentPreflightError(
  missingCount: number,
  totalRefs: number,
  localFirst?: boolean
): string {
  if (missingCount <= 0) return "";
  if (localFirst) {
    return `${missingCount} of ${totalRefs} attachment file(s) are not on this device (open those vouchers once to cache files, or backup without attachments).`;
  }
  return `${missingCount} of ${totalRefs} attachment file(s) could not be loaded (check internet and try again, or backup without attachments).`;
}

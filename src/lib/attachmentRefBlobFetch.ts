"use client";

import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import {
  getBlobFromLocalFileRef,
  getPendingFiles,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
} from "@/lib/localPendingFiles";
import { isDriveFileRef, remotePathFromDriveFileRef } from "@/lib/legacyDriveFileRef";
import { looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";

/** IndexedDB/native offline cache key — `PL_ATTACH` ko decode karke stable `drive:`/`local:`/https ref. */
export function offlineCacheKeyForAttachmentRef(rawUrl: string): string {
  return normalizeAttachmentUrlForDevicePreview(rawUrl);
}

export function isOfflineCacheableAttachmentRef(raw: string): boolean {
  const u = offlineCacheKeyForAttachmentRef(raw);
  if (!u) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (looksLikeFirebaseStorageObjectPath(u)) return true;
  if (isLocalFileRef(u) || isDriveFileRef(u)) return true;
  return false;
}

export type FetchAttachmentRefBlobOptions = {
  galleryUrls?: readonly string[];
  signal?: AbortSignal;
  /** Cloud `drive:` resolve — Google Drive folder path. */
  companyId?: string;
};

/** Preview/hover callers — gallery me parallel `local:` match ke liye. */
export type AttachmentPreviewBlobLoadOptions = {
  galleryUrls?: readonly string[];
  companyId?: string;
};

/**
 * Attachment bytes resolve order (local-first, cloud last):
 * 1. `local:` — IndexedDB pending / Capacitor DataDirectory
 * 2. `drive:` — gallery me paired `local:`, pending list filename match
 * 3. Offline warm cache (IndexedDB / native) — pehle open/preload ki hui copy
 * 4. Cloud — Google Drive (`downloadCloudAttachmentBlob`)
 * 5. `https://` Firebase — offline cache, phir SDK/fetch
 */
export async function fetchAttachmentRefBlob(
  rawUrl: string,
  options?: FetchAttachmentRefBlobOptions
): Promise<Blob | null> {
  const u = offlineCacheKeyForAttachmentRef(rawUrl);
  if (!u) return null;

  if (isLocalFileRef(u)) {
    const blob = await getBlobFromLocalFileRef(u, {
      context: "fetchAttachmentRefBlob",
      companyId: options?.companyId,
    });
    if (blob && blob.size > 0) return blob;
    if (options?.companyId) {
      const { fetchPlServerAttachmentBlob } = await import("@/lib/plServerAttachmentFetch");
      const remote = await fetchPlServerAttachmentBlob(options.companyId, u, options?.signal);
      if (remote && remote.size > 0) return remote;
    }
  }

  if (isDriveFileRef(u)) {
    const gallery = options?.galleryUrls;
    if (gallery?.length) {
      const rawTrim = String(rawUrl).trim();
      const idx = gallery.findIndex((g) => {
        const gt = String(g || "").trim();
        return gt === rawTrim || offlineCacheKeyForAttachmentRef(g) === u;
      });
      if (idx >= 0) {
        const peer = offlineCacheKeyForAttachmentRef(String(gallery[idx] || ""));
        if (isLocalFileRef(peer)) {
          const localBlob = await getBlobFromLocalFileRef(peer, {
            context: "fetchAttachmentRefBlob",
            companyId: options?.companyId,
          });
          if (localBlob && localBlob.size > 0) return localBlob;
        }
      }
    }
    const logical = remotePathFromDriveFileRef(u) || u;
    const fileTail = logical.split("/").pop()?.trim().toLowerCase() || "";
    if (fileTail) {
      try {
        for (const row of await getPendingFiles()) {
          const fn = String(row.fileName || "")
            .trim()
            .toLowerCase();
          if (!fn || fn !== fileTail) continue;
          const localBlob = await getBlobFromLocalFileRef(`${LOCAL_FILE_PREFIX}${row.id}`, {
            context: "fetchAttachmentRefBlob",
            companyId: options?.companyId,
          });
          if (localBlob && localBlob.size > 0) return localBlob;
        }
      } catch {
        /* pending optional */
      }
    }
    try {
      const { getOfflineCachedAttachmentBlob } = await import("@/lib/offlineAttachmentUrlCache");
      const cached = await getOfflineCachedAttachmentBlob(rawUrl);
      if (cached && cached.size > 0) return cached;
    } catch {
      /* offline cache optional */
    }
    const driveBlob = await getBlobFromLocalFileRef(u, {
      context: "fetchAttachmentRefBlobDrive",
      companyId: options?.companyId,
    });
    if (driveBlob && driveBlob.size > 0) return driveBlob;
  }

  if (/^https?:\/\//i.test(u) || looksLikeFirebaseStorageObjectPath(u)) {
    const { fetchHttpsAttachmentBlobForPrefetchMiss } = await import("@/lib/offlineAttachmentUrlCache");
    const httpsBlob = await fetchHttpsAttachmentBlobForPrefetchMiss(u, options?.signal);
    if (httpsBlob && httpsBlob.size > 0) return httpsBlob;
  }

  return null;
}

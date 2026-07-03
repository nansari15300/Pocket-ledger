"use client";

import type { AttachmentPreviewBlobLoadOptions } from "@/lib/attachmentRefBlobFetch";
import { fetchAttachmentRefBlob } from "@/lib/attachmentRefBlobFetch";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import {
  getRemoteAttachmentBlobPreferOfflineCache,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";

export type { AttachmentPreviewBlobLoadOptions };

/**
 * Mobile/APK/EXE + PC preview: pehle offline blob cache (Firebase warm / SQLite+files on native),
 * phir pending `local:` / gallery match, phir network hydrate.
 */
export async function getBlobFromAttachmentRefPreferLocalFirst(
  rawUrl: string,
  options?: AttachmentPreviewBlobLoadOptions
): Promise<Blob | null> {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;
  const normalized = normalizeAttachmentUrlForDevicePreview(trimmed) || trimmed;

  const cached = await tryOfflineCachedAttachmentBlobMultiKey(normalized);
  if (cached && cached.size > 0) return cached;
  if (normalized !== trimmed) {
    const altCached = await tryOfflineCachedAttachmentBlobMultiKey(trimmed);
    if (altCached && altCached.size > 0) return altCached;
  }

  if (isLocalFileRef(normalized) || options?.companyId) {
    const localOrRemote = await fetchAttachmentRefBlob(normalized, {
      galleryUrls: options?.galleryUrls,
      companyId: options?.companyId,
    });
    if (localOrRemote && localOrRemote.size > 0) return localOrRemote;
  }

  return getRemoteAttachmentBlobPreferOfflineCache(normalized, undefined, {
    galleryUrls: options?.galleryUrls,
    companyId: options?.companyId,
  });
}

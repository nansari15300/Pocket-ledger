"use client";

import type { AttachmentPreviewBlobLoadOptions } from "@/lib/attachmentRefBlobFetch";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";
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

  const cached = await tryOfflineCachedAttachmentBlobMultiKey(trimmed);
  if (cached && cached.size > 0) return cached;

  if (isLocalFileRef(trimmed)) {
    const pending = await getBlobFromLocalFileRef(trimmed);
    if (pending && pending.size > 0) return pending;
  }

  return getRemoteAttachmentBlobPreferOfflineCache(trimmed, undefined, {
    galleryUrls: options?.galleryUrls,
  });
}

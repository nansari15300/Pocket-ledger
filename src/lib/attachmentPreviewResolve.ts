"use client";



import type { AttachmentPreviewBlobLoadOptions } from "@/lib/attachmentRefBlobFetch";

import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";



export type { AttachmentPreviewBlobLoadOptions };



/**

 * Mobile/APK/EXE + PC preview: pehle offline blob cache (Firebase warm jaisa),

 * phir pending `local:` / gallery match, phir `drive:` download.

 */

export async function getBlobFromAttachmentRefPreferLocalFirst(

  rawUrl: string,

  options?: AttachmentPreviewBlobLoadOptions

): Promise<Blob | null> {

  return getRemoteAttachmentBlobPreferOfflineCache(rawUrl, undefined, {

    galleryUrls: options?.galleryUrls,

  });

}


"use client";

/**
 * Web Chrome billing: company-wide Firebase attachment full prefetch OFF.
 * Visible page thumbs only; hover/click/edit-thumb-click → full bytes → permanent IDB.
 * EXE / APK / static embedded keep existing full warm (`isEmbeddedOfflinePreloadClient`).
 */

import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

/** True for normal browser web (not EXE / APK / static embedded shell). */
export function isWebBrowserAttachmentLazyLoad(): boolean {
  if (typeof window === "undefined") return false;
  return !isEmbeddedOfflinePreloadClient();
}

/** Web: skip company-wide scrape / header % full-file prefetch. */
export function shouldSkipCompanyWideAttachmentPrefetchOnWeb(): boolean {
  return isWebBrowserAttachmentLazyLoad();
}

/**
 * Web: idle list warm must not pull full blobs for every visible URL again
 * (thumb path already caches permanently when preview loads).
 */
export function shouldSkipVisibleRowFullIdlePrewarmOnWeb(): boolean {
  return isWebBrowserAttachmentLazyLoad();
}

/**
 * Web: green-tick / ready queue must not force Firebase download —
 * cache hit or URL presence is enough; full bytes on hover/click/thumb path.
 */
export function shouldSkipForcedAttachmentWarmQueueOnWeb(): boolean {
  return isWebBrowserAttachmentLazyLoad();
}

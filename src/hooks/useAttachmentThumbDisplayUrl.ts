"use client";

import { useEffect, useState } from "react";
import {
  forgetHoverBlobUrl,
  peekHoverCachedBlobUrl,
  rememberHoverBlobUrl,
} from "@/lib/attachmentHoverBlobCache";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import {
  getOfflineCachedAttachmentNativeRef,
  getRemoteAttachmentBlobPreferOfflineCache,
  isOfflineCachedAttachmentOnDevice,
} from "@/lib/offlineAttachmentUrlCache";
import { useCompany } from "@/hooks/useCompany";
import {
  ensureAttachmentUiRefreshListeners,
  getAttachmentUiRefreshTick,
  markAttachmentUrlReady,
  requestAttachmentUiRefresh,
  subscribeAttachmentLoadStore,
} from "@/lib/attachmentLoadReady";

function thumbCacheKey(url: string): string {
  return `${url}::cell-thumb`;
}

export function invalidateAttachmentThumbDisplayUrl(
  rawUrl: string | undefined | null,
  displayUrl?: string | null
): void {
  const url = String(rawUrl || "").trim();
  if (!url) return;
  const expected = displayUrl?.trim() || undefined;
  // Cell thumb pehle — shared hover `url` key tabhi clear jab wahi blob ho.
  forgetHoverBlobUrl(thumbCacheKey(url), expected);
  const hoverCached = peekHoverCachedBlobUrl(url);
  if (hoverCached && (!expected || hoverCached === expected)) {
    forgetHoverBlobUrl(url, expected);
  }
  requestAttachmentUiRefresh();
}

/** File column / indicator — warmed LRU se chhota image thumb; PDF first-page raster optional. */
export function useAttachmentThumbDisplayUrl(
  rawUrl: string | undefined | null,
  ready: boolean,
  companyIdProp?: string,
  refreshKey = 0
): string | null {
  const { companyId: shellCid } = useCompany();
  const companyId = companyIdProp ?? shellCid;
  const url = String(rawUrl || "").trim();
  const [uiRefreshTick, setUiRefreshTick] = useState(() => getAttachmentUiRefreshTick());

  const [thumb, setThumb] = useState<string | null>(() => {
    if (!url) return null;
    return peekHoverCachedBlobUrl(thumbCacheKey(url)) ?? peekHoverCachedBlobUrl(url);
  });

  useEffect(() => {
    ensureAttachmentUiRefreshListeners();
    if (!url) {
      setThumb(null);
      setUiRefreshTick(getAttachmentUiRefreshTick());
      return;
    }
    const readCached = () =>
      peekHoverCachedBlobUrl(thumbCacheKey(url)) ?? peekHoverCachedBlobUrl(url);

    const applyCached = () => {
      setUiRefreshTick(getAttachmentUiRefreshTick());
      const cached = readCached();
      if (cached) setThumb(cached);
    };
    applyCached();
    const unsub = subscribeAttachmentLoadStore(applyCached);
    return unsub;
  }, [url]);

  useEffect(() => {
    if (!url || refreshKey <= 0) return;
    const cached = peekHoverCachedBlobUrl(thumbCacheKey(url)) ?? peekHoverCachedBlobUrl(url);
    if (!cached) setThumb(null);
  }, [url, refreshKey]);

  /** Refresh / live-pull: offline disk se turant — existing cell-thumb blob mat overwrite/revoke. */
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        if (await isOfflineCachedAttachmentOnDevice(url)) {
          markAttachmentUrlReady(url);
        }
        const existingThumb =
          peekHoverCachedBlobUrl(thumbCacheKey(url)) ?? peekHoverCachedBlobUrl(url);
        if (existingThumb) {
          if (!cancelled) setThumb(existingThumb);
          markAttachmentUrlReady(url);
          return;
        }
        const native = await getOfflineCachedAttachmentNativeRef(url);
        if (cancelled || !native?.displayUrl?.trim()) return;
        rememberHoverBlobUrl(url, native.displayUrl);
        rememberHoverBlobUrl(thumbCacheKey(url), native.displayUrl);
        markAttachmentUrlReady(url);
        setThumb(native.displayUrl);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, uiRefreshTick, refreshKey]);

  useEffect(() => {
    if (!url) return;
    const cached =
      peekHoverCachedBlobUrl(thumbCacheKey(url)) ?? peekHoverCachedBlobUrl(url);
    if (cached) {
      setThumb(cached);
      // Portal/focus refresh: cache hit pe naya objectURL mat banao —
      // warna purana blob revoke → File column Preview → tick shift.
      // Sirf explicit invalidate (refreshKey / onError) par re-resolve.
      if (refreshKey <= 0) return;
    }
    if (!ready) return;

    let cancelled = false;
    void (async () => {
      try {
        let blob: Blob | null = null;
        if (isLocalFileRef(url) && companyId) {
          const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
          blob = await resolvePlServerStaffAttachmentPreviewBlob(url, { companyId });
        }
        if (!blob?.size) {
          blob = await getRemoteAttachmentBlobPreferOfflineCache(url, undefined, {
            companyId: companyId ?? undefined,
          });
        }
        if (cancelled || !blob?.size) return;
        const kind = await sniffBlobKindForPreview(blob);
        if (kind === "image") {
          const typed =
            blob.type?.startsWith("image/") && blob.type !== "application/octet-stream"
              ? blob
              : new Blob([await blob.arrayBuffer()], { type: "image/jpeg" });
          const ou = URL.createObjectURL(typed);
          // Cell thumb alag key — hover portal `url` key overwrite se revoke na ho.
          rememberHoverBlobUrl(thumbCacheKey(url), ou);
          if (!peekHoverCachedBlobUrl(url)) {
            rememberHoverBlobUrl(url, ou);
          }
          if (!cancelled) setThumb(ou);
          return;
        }
        if (kind === "pdf") {
          const pdfBlob =
            blob.type === "application/pdf"
              ? blob
              : new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
          const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
          const result = await convertPdfFirstPageToImage(pdfBlob, 0.55, 96);
          rememberHoverBlobUrl(thumbCacheKey(url), result.thumbnailUrl);
          if (!cancelled) setThumb(result.thumbnailUrl);
        }
      } catch {
        /* thumb optional — Preview mode placeholder / tick-only fallback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, ready, companyId, uiRefreshTick, refreshKey]);

  return thumb;
}

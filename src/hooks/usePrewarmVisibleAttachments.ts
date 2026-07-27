"use client";

import { useEffect, useMemo } from "react";
import { prewarmVisibleAttachmentRefsForInstantOpen } from "@/components/vouchers/attachmentHoverPreviewBody";
import { shouldSkipVisibleRowFullIdlePrewarmOnWeb } from "@/lib/webAttachmentLazyLoadPolicy";

/** Visible master-list / page rows — idle par attachment bytes + hover LRU warm (staff PlServer `local:` included). */
export function usePrewarmVisibleAttachments(
  urls: readonly string[],
  companyId?: string | null
): void {
  const stableKey = useMemo(
    () =>
      [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))]
        .sort()
        .join("\0"),
    [urls]
  );

  useEffect(() => {
    if (!stableKey) return;
    const ac = new AbortController();
    const cid = companyId?.trim() || undefined;
    const run = () => {
      if (shouldSkipVisibleRowFullIdlePrewarmOnWeb()) return;
      void prewarmVisibleAttachmentRefsForInstantOpen(urls, {
        signal: ac.signal,
        maxUrls: 180,
        companyId: cid,
      });
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 900 });
      return () => {
        ac.abort();
        window.cancelIdleCallback(id);
      };
    }
    const t = setTimeout(run, 60);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [stableKey, companyId, urls]);
}

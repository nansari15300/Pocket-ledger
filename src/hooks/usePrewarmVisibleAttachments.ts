"use client";

import { useEffect, useMemo } from "react";
import { prewarmVisibleAttachmentRefsForInstantOpen } from "@/components/vouchers/attachmentHoverPreviewBody";
import { shouldSkipVisibleRowFullIdlePrewarmOnWeb } from "@/lib/webAttachmentLazyLoadPolicy";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";

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
      const all = urls.map((u) => String(u || "").trim()).filter(Boolean);
      // Web Firebase billing: skip idle HTTPS warm — but PL-server `local:` / Drive must still warm
      // (gallery next-page otherwise waits on serial /__pl_attachment).
      const targets = shouldSkipVisibleRowFullIdlePrewarmOnWeb()
        ? all.filter((u) => isLocalFileRef(u) || isDriveFileRef(u))
        : all;
      if (targets.length === 0) return;
      void prewarmVisibleAttachmentRefsForInstantOpen(targets, {
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

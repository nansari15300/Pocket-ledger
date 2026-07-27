"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  computeAttachmentUrlsReadyState,
  isAttachmentUrlReadyOnDevice,
  markAttachmentUrlReady,
  queueAttachmentUrlsWarm,
  subscribeAttachmentLoadStore,
} from "@/lib/attachmentLoadReady";
import { useCompany } from "@/hooks/useCompany";
import { shouldSkipForcedAttachmentWarmQueueOnWeb } from "@/lib/webAttachmentLazyLoadPolicy";

/** Transaction / entity file column — spinner jab load ho raha ho, green tick jab bytes ready. */
export function useAttachmentUrlsReadyState(urls: readonly string[]): "loading" | "ready" {
  const { companyId } = useCompany();
  const stableKey = useMemo(
    () =>
      [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))]
        .sort()
        .join("\0"),
    [urls]
  );

  const state = useSyncExternalStore(
    subscribeAttachmentLoadStore,
    () => computeAttachmentUrlsReadyState(urls),
    () => computeAttachmentUrlsReadyState(urls)
  );

  useEffect(() => {
    if (!stableKey) return;
    let cancelled = false;
    const cid = companyId?.trim() || undefined;
    const webLazy = shouldSkipForcedAttachmentWarmQueueOnWeb();
    void (async () => {
      for (const u of urls) {
        if (cancelled) break;
        const trimmed = String(u || "").trim();
        if (!trimmed) continue;
        if (await isAttachmentUrlReadyOnDevice(trimmed, cid, urls)) {
          markAttachmentUrlReady(trimmed);
          continue;
        }
        // Web: URL present = tick “has file”; full Firebase bytes sirf cache miss + hover/click/thumb path.
        if (webLazy) {
          markAttachmentUrlReady(trimmed);
        }
      }
      if (!cancelled && !webLazy) queueAttachmentUrlsWarm(urls, cid, urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [stableKey, urls, companyId]);

  return state;
}

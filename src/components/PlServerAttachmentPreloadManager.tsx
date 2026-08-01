"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useFirstLoginWarmGate } from "@/contexts/FirstLoginWarmGateContext";
import {
  clearHeaderAttachmentPrefetchForCompany,
  reportHeaderAttachmentPrefetchProgress,
} from "@/contexts/EmbeddedAttachmentPrefetchContext";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { scrapeLocalMirrorAttachmentUrls } from "@/lib/offlineFullWarmSync";
import { isOfflineCachedAttachmentOnDevice } from "@/lib/offlineAttachmentUrlCache";
import { fetchPlServerAttachmentBlob, seedPlServerAttachmentUiCaches } from "@/lib/plServerAttachmentFetch";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { peekHoverCachedBlobUrl } from "@/lib/attachmentHoverBlobCache";
import { tryOfflineCachedAttachmentBlobMultiKey } from "@/lib/offlineAttachmentUrlCache";

const PL_SERVER_PRELOAD_DEBOUNCE_MS = 1_200;
const PL_SERVER_PRELOAD_CONCURRENCY = 6;

async function collectMissingPlServerAttachmentRefs(
  urls: readonly string[],
  signal: AbortSignal
): Promise<string[]> {
  const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter(isLocalFileRef))];
  const missing: string[] = [];
  for (const url of unique) {
    if (signal.aborted) return [];
    try {
      if (!(await isOfflineCachedAttachmentOnDevice(url))) missing.push(url);
    } catch {
      missing.push(url);
    }
  }
  return missing;
}

async function preloadPlServerAttachmentRefs(args: {
  companyId: string;
  urls: readonly string[];
  signal: AbortSignal;
  onProgressPercent?: (pct: number) => void;
}) {
  const list = await collectMissingPlServerAttachmentRefs(args.urls, args.signal);
  const total = list.length;
  if (total <= 0) {
    return;
  }

  let done = 0;
  let cursor = 0;
  const bump = () => {
    done += 1;
    args.onProgressPercent?.(Math.min(100, Math.round((done / total) * 100)));
  };

  args.onProgressPercent?.(0);
  const workers = Array.from({ length: Math.min(PL_SERVER_PRELOAD_CONCURRENCY, total) }, async () => {
    for (;;) {
      if (args.signal.aborted) return;
      const idx = cursor++;
      if (idx >= total) return;
      const url = list[idx]!;
      try {
        await fetchPlServerAttachmentBlob(args.companyId, url, args.signal);
      } catch {
      } finally {
        bump();
      }
    }
  });
  await Promise.all(workers);
  args.onProgressPercent?.(100);
}

async function warmCachedPlServerAttachmentThumbs(args: {
  urls: readonly string[];
  signal: AbortSignal;
}) {
  const list = [...new Set(args.urls.map((u) => String(u || "").trim()).filter(isLocalFileRef))];
  for (const url of list) {
    if (args.signal.aborted) return;
    if (peekHoverCachedBlobUrl(`${url}::cell-thumb`)) continue;
    const persistedThumb = await tryOfflineCachedAttachmentBlobMultiKey(`${url}::cell-thumb`);
    if (persistedThumb?.size) {
      const objectUrl = URL.createObjectURL(persistedThumb);
      const { rememberHoverBlobUrl } = await import("@/lib/attachmentHoverBlobCache");
      rememberHoverBlobUrl(`${url}::cell-thumb`, objectUrl);
      continue;
    }
    if (!(await isOfflineCachedAttachmentOnDevice(url))) continue;
    const cached = await tryOfflineCachedAttachmentBlobMultiKey(url);
    if (cached?.size) await seedPlServerAttachmentUiCaches(url, cached);
  }
}

export function PlServerAttachmentPreloadManager() {
  const { user } = useAuth();
  const { companyId, company, loading } = useCompany();
  const { gateActive } = useFirstLoginWarmGate();
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;

    const cid = companyId?.trim();
    if (!user || loading || gateActive || !cid || !company || !isServerGateCompany(company)) return;

    const ac = new AbortController();
    abortRef.current = ac;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          const urls = [...(await scrapeLocalMirrorAttachmentUrls(cid))].filter(isLocalFileRef);
          if (ac.signal.aborted || urls.length <= 0) return;
          void warmCachedPlServerAttachmentThumbs({ urls, signal: ac.signal });
          await preloadPlServerAttachmentRefs({
            companyId: cid,
            urls,
            signal: ac.signal,
            onProgressPercent: (pct) => reportHeaderAttachmentPrefetchProgress(cid, pct),
          });
        } catch {
          if (!ac.signal.aborted) clearHeaderAttachmentPrefetchForCompany(cid);
        }
      })();
    }, PL_SERVER_PRELOAD_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      ac.abort();
      clearHeaderAttachmentPrefetchForCompany(cid);
    };
  }, [user, loading, companyId, company, gateActive]);

  return null;
}

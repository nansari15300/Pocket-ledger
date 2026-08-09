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
import {
  getPlServerReadSyncHealth,
  PL_SERVER_READ_SYNC_HEALTH_EVENT,
} from "@/lib/plServerReadSyncHealth";
import {
  BROWSER_DB_COLLECTION_BUMP,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";

const PL_SERVER_PRELOAD_DEBOUNCE_MS = 1_200;
const PL_SERVER_PRELOAD_CONCURRENCY = 6;
const PL_SERVER_LIVE_ATTACH_COLLECTIONS = new Set([
  "vouchers",
  "parties",
  "staff",
  "bank_accounts",
  "taxes",
  "expense_accounts",
  "items",
]);

function hostUnreachableForAttachments(companyId: string): boolean {
  const h = getPlServerReadSyncHealth(companyId);
  // 2+ fails — single WAN blip se attachment hydrate band mat karo.
  return (
    h.consecutiveFailures >= 2 ||
    h.state === "sharing_unavailable" ||
    h.state === "offline" ||
    h.lastError === "offline_cached_view"
  );
}

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

    const stopIfHostDown = () => {
      if (!hostUnreachableForAttachments(cid)) return false;
      abortRef.current?.abort();
      clearHeaderAttachmentPrefetchForCompany(cid);
      return true;
    };
    if (stopIfHostDown()) return;

    const onHealth = () => {
      if (stopIfHostDown()) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };
    window.addEventListener(PL_SERVER_READ_SYNC_HEALTH_EVENT, onHealth);

    const scheduleCompanyAttachmentWarm = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      if (hostUnreachableForAttachments(cid)) {
        clearHeaderAttachmentPrefetchForCompany(cid);
        return;
      }
      const ac = new AbortController();
      abortRef.current = ac;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (hostUnreachableForAttachments(cid)) {
          clearHeaderAttachmentPrefetchForCompany(cid);
          return;
        }
        void (async () => {
          try {
            // Offline/host-down: sirf local thumb warm — network prefetch/green strip mat chalao.
            const urls = [...(await scrapeLocalMirrorAttachmentUrls(cid))].filter(isLocalFileRef);
            if (ac.signal.aborted || urls.length <= 0) return;
            void warmCachedPlServerAttachmentThumbs({ urls, signal: ac.signal });
            if (hostUnreachableForAttachments(cid)) {
              clearHeaderAttachmentPrefetchForCompany(cid);
              return;
            }
            await preloadPlServerAttachmentRefs({
              companyId: cid,
              urls,
              signal: ac.signal,
              onProgressPercent: (pct) => {
                if (hostUnreachableForAttachments(cid)) {
                  clearHeaderAttachmentPrefetchForCompany(cid);
                  ac.abort();
                  return;
                }
                reportHeaderAttachmentPrefetchProgress(cid, pct);
              },
            });
          } catch {
            if (!ac.signal.aborted) clearHeaderAttachmentPrefetchForCompany(cid);
          }
        })();
      }, PL_SERVER_PRELOAD_DEBOUNCE_MS);
    };

    const onCollectionBump = (event: Event) => {
      const detail = (event as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!detail || detail.companyId !== cid) return;
      if (detail.source !== "pl_server_pull" && detail.source !== "pl_host_remote_write") return;
      if (!PL_SERVER_LIVE_ATTACH_COLLECTIONS.has(String(detail.collection || ""))) return;
      scheduleCompanyAttachmentWarm();
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onCollectionBump);

    scheduleCompanyAttachmentWarm();

    return () => {
      window.removeEventListener(PL_SERVER_READ_SYNC_HEALTH_EVENT, onHealth);
      window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onCollectionBump);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      clearHeaderAttachmentPrefetchForCompany(cid);
    };
  }, [user, loading, companyId, company, gateActive]);

  return null;
}

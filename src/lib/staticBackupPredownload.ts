"use client";

import type { Company } from "@/hooks/useCompany";
import { backupPrefersLocalSnapshot } from "@/lib/backupLocalFirst";
import {
  isCloudBackedCompanyShape,
  runOfflineFullWarmSync,
  scrapeLocalMirrorAttachmentUrlsWithVoucherIndex,
} from "@/lib/offlineFullWarmSync";
import { prefetchHttpsAttachmentUrls } from "@/lib/offlineAttachmentUrlCache";
import {
  beginAttachmentPrefetchVoucherLookupSession,
  endAttachmentPrefetchVoucherLookupSession,
} from "@/lib/attachmentPrefetchUserNotice";

export type StaticBackupPredownloadProgress = {
  phase: string;
  detail: string;
  percent?: number;
};

/** Static APK/EXE: pehle SQLite + attachment bytes device par — phir backup with attachments fail na ho. */
export async function runStaticCompanyBackupPredownload(args: {
  company: Company;
  companyId: string;
  signal?: AbortSignal;
  onProgress: (p: StaticBackupPredownloadProgress) => void;
}): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  if (!backupPrefersLocalSnapshot()) {
    return { ok: false, error: "Pre-download is only available in the desktop/mobile app." };
  }

  const companyId = String(args.companyId || "").trim();
  if (!companyId) return { ok: false, error: "No company selected." };

  const throwIfAborted = () => {
    if (args.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  };

  try {
    if (isCloudBackedCompanyShape(args.company)) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        args.onProgress({
          phase: "Offline",
          detail: "Using existing local SQLite — connect once online to refresh cloud data.",
        });
      } else {
        args.onProgress({ phase: "Syncing data", detail: "Downloading company data to local SQLite…" });
        throwIfAborted();
        await runOfflineFullWarmSync({
          company: args.company,
          localCompanyId: companyId,
          signal: args.signal,
          includeAttachmentPrefetch: false,
          skipWarmBootstrapFlag: true,
        });
      }
    } else {
      args.onProgress({ phase: "Reading data", detail: "Using local SQLite on this device…" });
    }

    throwIfAborted();
    args.onProgress({ phase: "Downloading attachments", detail: "Scanning vouchers for files…", percent: 0 });

    const scraped = await scrapeLocalMirrorAttachmentUrlsWithVoucherIndex(companyId);
    const urls = scraped.urls;
    beginAttachmentPrefetchVoucherLookupSession(scraped.voucherByAttachmentKey, companyId);
    try {
      if (urls.size === 0) {
        args.onProgress({ phase: "Complete", detail: "No remote attachment links found.", percent: 100 });
        return { ok: true };
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return {
          ok: false,
          error: `Offline — ${urls.size} attachment file(s) still need internet. Connect and run pre-download again.`,
        };
      }

      const prefetch = await prefetchHttpsAttachmentUrls(urls, {
        concurrency: 6,
        maxUrls: 50_000,
        maxTotalBytesApprox: 8_000 * 1024 * 1024,
        signal: args.signal,
        onItemDone: (done, total) => {
          args.onProgress({
            phase: "Downloading attachments",
            detail: `${done} / ${total} files`,
            percent: total <= 0 ? 100 : Math.min(100, Math.round((done / Math.max(1, total)) * 100)),
          });
        },
      });

      if (preflightFailed(prefetch.failed, prefetch.skippedBudget)) {
        const missed = prefetch.failed + prefetch.skippedBudget;
        return {
          ok: false,
          error: `${missed} attachment file(s) could not be downloaded. Check internet and try again.`,
        };
      }

      args.onProgress({
        phase: "Complete",
        detail: "Full data and attachments are on this device. You can backup with attachments.",
        percent: 100,
      });
      return { ok: true };
    } finally {
      endAttachmentPrefetchVoucherLookupSession();
    }
  } catch (e) {
    if (e instanceof DOMException && (e.name === "AbortError" || e.message === "Cancelled")) {
      return { ok: false, error: "Cancelled.", cancelled: true };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function preflightFailed(failed: number, skippedBudget: number): boolean {
  return failed > 0 || skippedBudget > 0;
}

"use client";

/**
 * Account-wide embedded warm: Firebase uid ke under jitni cloud-backed companies hon — sabka SQLite mirror + attachments.
 */

import type { Company } from "@/hooks/useCompany";
import {
  countPendingAttachmentDownloadsForCompany,
  isCloudBackedCompanyShape,
  runEmbeddedAttachmentPrefetchPhase,
  runOfflineFullWarmSync,
  shouldPrefetchAttachmentsForCompany,
  type AttachmentPrefetchOverrides,
  type EmbeddedAttachmentPrefetchSummary,
} from "@/lib/offlineFullWarmSync";

/** Pehli company ke baad agli — APK memory / bandwidth ke liye serial gap. */
export const EMBEDDED_ACCOUNT_WARM_GAP_MS = 750;

/** Pehli login / account warm: poora mirror scrape + zyada attachment bytes cache. */
export const EMBEDDED_FIRST_LOGIN_ATTACHMENT_PREFETCH: AttachmentPrefetchOverrides = {
  maxUrls: 55_000,
  maxTotalBytesApprox: 4_200 * 1024 * 1024,
  concurrency: 12,
};

/** Registry se cloud rows — `prioritizeCompanyId` pehle (selected company fast feel). */
export function orderCloudCompaniesForAccountWarm(
  allCompanies: Company[] | null | undefined,
  prioritizeCompanyId?: string | null,
): Company[] {
  const rows = (allCompanies ?? []).filter((c): c is Company => isCloudBackedCompanyShape(c));
  const pid = prioritizeCompanyId?.trim();
  if (!pid) return rows;
  const first = rows.filter((c) => c.id === pid);
  const rest = rows.filter((c) => c.id !== pid);
  return [...first, ...rest];
}

/** SQLite mirror + missing attachment bytes — pehli baar full; baad me sirf nayi URLs (refresh par bar-bar full nahi). */
export async function runEmbeddedCompanyFullPreload(args: {
  company: Company;
  localCompanyId: string;
  signal?: AbortSignal;
  prefetchOverrides?: AttachmentPrefetchOverrides;
  onAttachmentProgressPercent?: (pct: number) => void;
}): Promise<EmbeddedAttachmentPrefetchSummary | null> {
  const localId = args.localCompanyId.trim();
  if (!localId) return null;

  const prefetchEligible = shouldPrefetchAttachmentsForCompany(args.company);
  const prefetchOverrides = args.prefetchOverrides ?? EMBEDDED_FIRST_LOGIN_ATTACHMENT_PREFETCH;

  if (isCloudBackedCompanyShape(args.company)) {
    await runOfflineFullWarmSync({
      company: args.company,
      localCompanyId: localId,
      signal: args.signal,
      includeAttachmentPrefetch: false,
      skipWarmBootstrapFlag: true,
    });
  }

  if (args.signal?.aborted) return null;
  if (!prefetchEligible) return null;

  const { pending } = await countPendingAttachmentDownloadsForCompany(localId);
  if (pending <= 0) {
    return {
      attachmentUrlsSeen: 0,
      prefetchCachedNew: 0,
      prefetchSkippedCache: 0,
      prefetchFailures: 0,
    };
  }

  return runEmbeddedAttachmentPrefetchPhase({
    company: args.company,
    localCompanyId: localId,
    signal: args.signal,
    onProgressPercent: args.onAttachmentProgressPercent,
    prefetchOverrides,
  });
}

/** Registry se cloud + Drive-sync local rows — account preload ke liye. */
export function orderCompaniesForAccountFullPreload(
  allCompanies: Company[] | null | undefined,
  prioritizeCompanyId?: string | null,
): Company[] {
  const rows = (allCompanies ?? []).filter((c) => shouldPrefetchAttachmentsForCompany(c));
  const pid = prioritizeCompanyId?.trim();
  if (!pid) return rows;
  const first = rows.filter((c) => c.id === pid);
  const rest = rows.filter((c) => c.id !== pid);
  return [...first, ...rest];
}

export async function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

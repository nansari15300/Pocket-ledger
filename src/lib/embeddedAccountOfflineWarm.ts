"use client";

/**
 * Account-wide embedded warm: Firebase uid ke under jitni cloud-backed companies hon — sabka SQLite mirror + attachments.
 */

import type { Company } from "@/hooks/useCompany";
import {
  isCloudBackedCompanyShape,
  runEmbeddedAttachmentPrefetchPhase,
  runOfflineFullWarmSync,
  shouldPrefetchAttachmentsForCompany,
  type AttachmentPrefetchOverrides,
} from "@/lib/offlineFullWarmSync";

/** Pehli company ke baad agli — APK memory / bandwidth ke liye serial gap. */
export const EMBEDDED_ACCOUNT_WARM_GAP_MS = 750;

/** Pehli login / account warm: poora mirror scrape + zyada attachment bytes cache. */
export const EMBEDDED_FIRST_LOGIN_ATTACHMENT_PREFETCH: AttachmentPrefetchOverrides = {
  maxUrls: 55_000,
  maxTotalBytesApprox: 4_200 * 1024 * 1024,
  concurrency: 7,
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

/** SQLite mirror + saari attachment URLs IndexedDB/native cache — ek company poora offline preload. */
export async function runEmbeddedCompanyFullPreload(args: {
  company: Company;
  localCompanyId: string;
  signal?: AbortSignal;
  prefetchOverrides?: AttachmentPrefetchOverrides;
  onAttachmentProgressPercent?: (pct: number) => void;
}): Promise<void> {
  const localId = args.localCompanyId.trim();
  if (!localId) return;

  await runOfflineFullWarmSync({
    company: args.company,
    localCompanyId: localId,
    signal: args.signal,
    includeAttachmentPrefetch: false,
    skipWarmBootstrapFlag: true,
  });

  if (args.signal?.aborted) return;
  if (!shouldPrefetchAttachmentsForCompany(args.company)) return;

  await runEmbeddedAttachmentPrefetchPhase({
    company: args.company,
    localCompanyId: localId,
    signal: args.signal,
    onProgressPercent: args.onAttachmentProgressPercent,
    prefetchOverrides: args.prefetchOverrides ?? EMBEDDED_FIRST_LOGIN_ATTACHMENT_PREFETCH,
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

"use client";

/**
 * Account-wide embedded warm: Firebase uid ke under jitni cloud-backed companies hon — sabka SQLite mirror + attachments.
 */

import type { Company } from "@/hooks/useCompany";
import {
  isCloudBackedCompanyShape,
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

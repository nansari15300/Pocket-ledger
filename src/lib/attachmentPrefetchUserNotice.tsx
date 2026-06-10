"use client";

/**
 * Background offline attachment cache (warm sync) — user-facing toasts disabled.
 * Prefetch failures are logged in dev only; app shows no error/notification to the user.
 */

import type { AttachmentVoucherHit } from "@/lib/attachmentPrefetchVoucherLookup";

export type AttachmentPrefetchFailureEvent = {
  url: string;
  status: number | null;
  ok: boolean;
  retryable: boolean;
  note: string;
};

export type AttachmentPrefetchContext = {
  source: "voucher" | "entity" | "company" | "unknown";
  companyId: string | null;
  voucherKind: string | null;
  voucherKindLabel: string | null;
  fileName: string | null;
  objectPath: string | null;
};

let activeVoucherIndex: Map<string, AttachmentVoucherHit> | null = null;
let activeMirrorCompanyId: string | null = null;

/** Prefetch scrape ke baad — failed URL → exact voucher no. resolve (internal / future use). */
export function beginAttachmentPrefetchVoucherLookupSession(
  index: Map<string, AttachmentVoucherHit>,
  mirrorCompanyId: string
): void {
  activeVoucherIndex = index;
  activeMirrorCompanyId = mirrorCompanyId.trim() || null;
}

export function endAttachmentPrefetchVoucherLookupSession(): void {
  activeVoucherIndex = null;
  activeMirrorCompanyId = null;
}

/** Per-file prefetch failure — intentionally silent for users. */
export function maybeNotifyAttachmentPrefetchFailure(
  _ev: AttachmentPrefetchFailureEvent,
  _opts?: { mirrorCompanyId?: string | null }
): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[attachmentPrefetch] failure (user notice suppressed)", {
      url: _ev.url,
      status: _ev.status,
      note: _ev.note,
      mirrorCompanyId: _opts?.mirrorCompanyId ?? activeMirrorCompanyId,
    });
  }
}

/** Batch prefetch summary — intentionally silent for users. */
export function maybeNotifyAttachmentPrefetchBatchSummary(_args: {
  failedCount: number;
  companyName?: string | null;
  companyId?: string | null;
}): void {
  if (process.env.NODE_ENV !== "production" && _args.failedCount > 0) {
    console.debug("[attachmentPrefetch] batch summary (user notice suppressed)", {
      failedCount: _args.failedCount,
      companyId: _args.companyId,
      companyName: _args.companyName,
    });
  }
}

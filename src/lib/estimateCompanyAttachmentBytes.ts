"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import {
  collectAttachmentRefsFromValue,
  isAttachmentRefString,
} from "@/lib/attachmentBackupBundle";
import { getPendingPayloadForLocalRef, isLocalFileRef } from "@/lib/localPendingFiles";
import { getAttachmentFileRef } from "@/lib/attachmentFileRefStore";

/** Subcollections jahan attachment URL fields hoti hain — local→online MB cap estimate. */
const COLLECTIONS_WITH_ATTACHMENTS = [
  "parties",
  "groups",
  "bank_accounts",
  "account_groups",
  "staff",
  "staff_groups",
  "items",
  "item_groups",
  "taxes",
  "tax_groups",
  "expense_accounts",
  "expense_groups",
  "vouchers",
] as const;

function offlineCacheIdFromUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return `oc_${Math.abs(h).toString(36)}`;
}

async function byteSizeForAttachmentRef(ref: string): Promise<number> {
  if (isLocalFileRef(ref)) {
    const item = await getPendingPayloadForLocalRef(ref);
    return item?.blob?.size ?? 0;
  }
  if (typeof ref === "string" && /^https?:\/\//i.test(ref)) {
    const cacheRow = await getAttachmentFileRef("offline_cache", offlineCacheIdFromUrl(ref));
    if (cacheRow?.size) return cacheRow.size;
    try {
      const head = await fetch(ref, { method: "HEAD", mode: "cors", credentials: "omit" });
      const len = head.headers.get("content-length");
      if (len) return Math.max(0, Number(len) || 0);
    } catch {
      /* CORS / offline — count 0 */
    }
  }
  return 0;
}

/** Company ke saari docs se unique attachment refs ka total bytes — Upload to cloud MB gate. */
export async function estimateCompanyAttachmentBytes(companyId: string): Promise<{
  totalBytes: number;
  refCount: number;
}> {
  const refs = new Set<string>();
  for (const col of COLLECTIONS_WITH_ATTACHMENTS) {
    const rows = await listCompanyDocsFromBrowserDb(companyId, col, { forBackupMerge: true });
    for (const row of rows) {
      collectAttachmentRefsFromValue(row, refs);
    }
  }
  const localCompany = await import("@/lib/localCompanyStore").then((m) =>
    m.getLocalCompanyById(companyId)
  );
  if (localCompany?.logoUrl && isAttachmentRefString(localCompany.logoUrl)) {
    refs.add(localCompany.logoUrl);
  }

  let totalBytes = 0;
  for (const ref of refs) {
    totalBytes += await byteSizeForAttachmentRef(ref);
  }
  return { totalBytes, refCount: refs.size };
}

"use client";

import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";

export type CompanyAttachmentCatalogEntry = {
  url: string;
  label: string;
  voucherNumbers: string[];
  voucherCount: number;
};

function attachmentLabelFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "Attachment";
  if (isLocalFileRef(trimmed)) return trimmed.slice("local:".length).slice(0, 12) || "Local file";
  if (isDriveFileRef(trimmed)) {
    const path = trimmed.replace(/^drive:/i, "");
    const base = path.split("/").pop() || path;
    return decodeURIComponent(base) || "Drive file";
  }
  const storagePath = tryGetStoragePathFromFirebaseDownloadUrl(trimmed);
  if (storagePath) {
    const base = storagePath.split("/").pop() || storagePath;
    return decodeURIComponent(base) || "Cloud file";
  }
  try {
    const u = new URL(trimmed);
    const base = decodeURIComponent((u.pathname.split("/").pop() || "").split("?")[0] || "");
    if (base && !/^o$/i.test(base)) return base;
  } catch {
    /* fall through */
  }
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

/** Distinct attachment refs already on company vouchers — in-memory scan (no extra Firestore read). */
export function buildCompanyAttachmentCatalogFromVouchers(
  vouchers: ReadonlyArray<{ fileUrls?: unknown; voucherNumber?: unknown; type?: unknown }>,
  options?: { excludeUrls?: ReadonlySet<string>; limit?: number }
): CompanyAttachmentCatalogEntry[] {
  const exclude = options?.excludeUrls ?? new Set<string>();
  const limit = Math.max(1, options?.limit ?? 200);
  const byUrl = new Map<string, { numbers: Set<string> }>();

  for (const v of vouchers) {
    const urls = v.fileUrls;
    if (!Array.isArray(urls)) continue;
    const vn = String(v.voucherNumber || v.type || "Voucher").trim() || "Voucher";
    for (const raw of urls) {
      if (typeof raw !== "string") continue;
      const url = raw.trim();
      if (!url || exclude.has(url)) continue;
      const row = byUrl.get(url) ?? { numbers: new Set<string>() };
      row.numbers.add(vn);
      byUrl.set(url, row);
    }
  }

  const entries: CompanyAttachmentCatalogEntry[] = [];
  for (const [url, { numbers }] of byUrl) {
    const voucherNumbers = [...numbers].sort((a, b) => a.localeCompare(b));
    entries.push({
      url,
      label: attachmentLabelFromUrl(url),
      voucherNumbers,
      voucherCount: voucherNumbers.length,
    });
  }

  entries.sort((a, b) => {
    if (b.voucherCount !== a.voucherCount) return b.voucherCount - a.voucherCount;
    return a.label.localeCompare(b.label);
  });

  return entries.slice(0, limit);
}

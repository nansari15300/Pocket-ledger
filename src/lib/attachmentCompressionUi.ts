"use client";

import { useSyncExternalStore } from "react";
import {
  isDeviceLocalCompany,
  isServerGateCompany,
  type CompanyStorageRow,
} from "@/lib/companyStorageKind";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { isDriveCloudSyncLocalRegistryRow } from "@/lib/driveRestoredLocalCompany";

/**
 * Shared UX for voucher-style attachments: compress first, then cap.
 * Images: Online ≤100KB; Local / PL Server / Drive ≤150KB (soft floor ~50KB).
 * PDFs stay on the larger 0.5MB band (raster quality).
 *
 * Same image caps apply to masters (party/staff/bank/tax/item), company logo,
 * gallery, and admin uploads via `compressImageForCompany`.
 */

/** PDF / legacy reject ceiling after compress. */
export const ATTACHMENT_MAX_SIZE_MB = 0.5;

/** Online (Firestore) image post-compress ceiling. */
export const ONLINE_IMAGE_MAX_KB = 100;

/** Local, PL Server, Drive image post-compress ceiling. */
export const LOCAL_LIKE_IMAGE_MAX_KB = 150;

/** Soft floor — don't chase smaller than this if already under max. */
export const IMAGE_SOFT_MIN_KB = 50;

const imageCompressionListeners = new Set<() => void>();
let imageCompressionCount = 0;

function emitImageCompressionChange(): void {
  imageCompressionListeners.forEach((listener) => listener());
}

function beginImageCompressionProcessing(): () => void {
  imageCompressionCount += 1;
  emitImageCompressionChange();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    imageCompressionCount = Math.max(0, imageCompressionCount - 1);
    emitImageCompressionChange();
  };
}

export function isImageCompressionProcessing(): boolean {
  return imageCompressionCount > 0;
}

/** Masters / logo / gallery — Save disable + Compressing UI. */
export function useImageCompressionProcessing(): boolean {
  return useSyncExternalStore(
    (listener) => {
      imageCompressionListeners.add(listener);
      return () => imageCompressionListeners.delete(listener);
    },
    isImageCompressionProcessing,
    () => false
  );
}

export function attachmentMaxBytes(): number {
  return ATTACHMENT_MAX_SIZE_MB * 1024 * 1024;
}

/** Local / PL Server / Drive → 150KB; online / unknown → 100KB. */
export function companyUsesRelaxedImageAttachmentCap(
  company: CompanyStorageRow | null | undefined
): boolean {
  if (!company) return false;
  if (isServerGateCompany(company)) return true;
  if (isDeviceLocalCompany(company)) return true;
  if (isOfflineCompanyStorage(company as Parameters<typeof isOfflineCompanyStorage>[0])) return true;
  if (isDriveCloudSyncLocalRegistryRow(company as never)) return true;
  const so = String(company.storageOption ?? "").toLowerCase().trim();
  return so === "drive" || so === "local";
}

export function attachmentImageMaxKbForCompany(
  company?: CompanyStorageRow | null
): number {
  return companyUsesRelaxedImageAttachmentCap(company)
    ? LOCAL_LIKE_IMAGE_MAX_KB
    : ONLINE_IMAGE_MAX_KB;
}

export function attachmentImageMaxBytesForCompany(
  company?: CompanyStorageRow | null
): number {
  return attachmentImageMaxKbForCompany(company) * 1024;
}

/** Resolve image cap from company id (registry). Unknown / missing → online 100KB. */
export async function resolveAttachmentImageMaxBytes(
  companyId?: string | null
): Promise<number> {
  const cid = String(companyId || "").trim();
  if (!cid) return ONLINE_IMAGE_MAX_KB * 1024;
  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const row = await getLocalCompanyById(cid, { includeDeleted: true });
    return attachmentImageMaxBytesForCompany(row as CompanyStorageRow | null);
  } catch {
    return ONLINE_IMAGE_MAX_KB * 1024;
  }
}

/**
 * After `compressVoucherAttachment` / `compressFile`, if size still exceeds `maxBytes`
 * (default 0.5 MB for PDF), show this toast.
 */
export function attachmentStillTooLargeToastFields(maxMb: number = ATTACHMENT_MAX_SIZE_MB): {
  title: string;
  description: string;
} {
  return {
    title: "File Still Too Large",
    description: `After compression the file is still over ${maxMb} MB. Try a smaller PDF or image.`,
  };
}

export function attachmentImageStillTooLargeToastFields(maxKb: number): {
  title: string;
  description: string;
} {
  return {
    title: "File Still Too Large",
    description: `After compression the image is still over ${maxKb} KB. Try a smaller photo.`,
  };
}

/** Masters / logo / gallery — progressive image compress to company cap. Never size-rejects. */
export async function compressImageForCompany(
  file: File,
  companyId?: string | null
): Promise<{ file: File; maxBytes: number; maxKb: number }> {
  const end = beginImageCompressionProcessing();
  try {
    const maxBytes = await resolveAttachmentImageMaxBytes(companyId);
    const maxKb = Math.max(1, Math.floor(maxBytes / 1024));
    const { compressVoucherAttachment } = await import("@/lib/compression");
    const out = await compressVoucherAttachment(file, maxBytes);
    return { file: out, maxBytes, maxKb };
  } finally {
    end();
  }
}

/**
 * Master documents: images → company image cap; PDFs → 0.5MB band.
 * Non image/pdf returned as-is.
 */
export async function compressMasterAttachmentForCompany(
  file: File,
  companyId?: string | null
): Promise<{ file: File; maxBytes: number; kind: "image" | "pdf" | "other" }> {
  const t = (file.type || "").toLowerCase();
  const isPdf = t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = t.startsWith("image/");
  if (isImage) {
    const r = await compressImageForCompany(file, companyId);
    return { file: r.file, maxBytes: r.maxBytes, kind: "image" };
  }
  if (isPdf) {
    const maxBytes = attachmentMaxBytes();
    const { compressVoucherAttachment } = await import("@/lib/compression");
    const out = await compressVoucherAttachment(file, maxBytes);
    return { file: out, maxBytes, kind: "pdf" };
  }
  return { file, maxBytes: file.size, kind: "other" };
}

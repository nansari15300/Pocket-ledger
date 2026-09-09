"use client";

import { useSyncExternalStore } from "react";
import { toast as sonnerToast } from "sonner";
import {
  VOUCHER_SONNER_TOAST_CN,
  VOUCHER_SONNER_TOAST_POSITION,
} from "@/lib/voucherSaveUi";
import {
  isDeviceLocalCompany,
  isServerGateCompany,
  type CompanyStorageRow,
} from "@/lib/companyStorageKind";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { isDriveCloudSyncLocalRegistryRow } from "@/lib/driveRestoredLocalCompany";
import type { Entitlements } from "@/config/plans";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";

/**
 * Shared UX for voucher-style attachments: compress first, then cap.
 * Images: Online ≤100KB; Local / PL Server / Drive ≤150KB (soft floor ~50KB on defaults).
 * Admin From–To band (e.g. 30–35 KB): output stays inside that range.
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

const compressionProgressListeners = new Set<() => void>();
let compressionProgressActive = false;
let compressionProgressPercent = 0;
let compressionProgressShownAt = 0;
let compressionFinishTimer: ReturnType<typeof setTimeout> | null = null;
let compressionProgressSnapshot = { active: false, percent: 0 };
const COMPRESSION_PROGRESS_SERVER_SNAPSHOT = { active: false, percent: 0 };

const COMPRESSION_PROGRESS_MIN_VISIBLE_MS = 650;
const COMPRESSION_TOAST_ID = "pl-attachment-compression-progress";

function syncCompressionSonnerToast(percent: number): void {
  sonnerToast.loading(`Attachment compressing… ${percent}%`, {
    id: COMPRESSION_TOAST_ID,
    position: VOUCHER_SONNER_TOAST_POSITION,
    duration: Infinity,
    classNames: { toast: VOUCHER_SONNER_TOAST_CN },
  });
}

function getCompressionProgressSnapshot(): { active: boolean; percent: number } {
  if (
    compressionProgressSnapshot.active === compressionProgressActive &&
    compressionProgressSnapshot.percent === compressionProgressPercent
  ) {
    return compressionProgressSnapshot;
  }
  compressionProgressSnapshot = {
    active: compressionProgressActive,
    percent: compressionProgressPercent,
  };
  return compressionProgressSnapshot;
}

function emitCompressionProgressChange(): void {
  compressionProgressListeners.forEach((listener) => listener());
}

export function setAttachmentCompressionProgress(percent: number): void {
  const next = Math.min(100, Math.max(0, Math.round(percent)));
  if (!compressionProgressActive) compressionProgressShownAt = Date.now();
  if (compressionFinishTimer) {
    clearTimeout(compressionFinishTimer);
    compressionFinishTimer = null;
  }
  compressionProgressActive = true;
  compressionProgressPercent = next;
  syncCompressionSonnerToast(next);
  emitCompressionProgressChange();
}

export function finishAttachmentCompressionProgress(): void {
  const elapsed = compressionProgressShownAt ? Date.now() - compressionProgressShownAt : 0;
  const wait = Math.max(0, COMPRESSION_PROGRESS_MIN_VISIBLE_MS - elapsed);
  if (compressionFinishTimer) clearTimeout(compressionFinishTimer);
  compressionFinishTimer = setTimeout(() => {
    compressionFinishTimer = null;
    compressionProgressActive = false;
    compressionProgressPercent = 0;
    compressionProgressShownAt = 0;
    sonnerToast.dismiss(COMPRESSION_TOAST_ID);
    emitCompressionProgressChange();
  }, wait);
}

/** Batch compress: file index + inner 0–100 → overall %. */
export function reportAttachmentCompressionProgress(
  fileIndex: number,
  fileCount: number,
  fileInnerPct = 0
): void {
  if (fileCount <= 0) {
    setAttachmentCompressionProgress(100);
    return;
  }
  const overall = ((fileIndex + fileInnerPct / 100) / fileCount) * 100;
  setAttachmentCompressionProgress(Math.max(1, Math.min(99, Math.round(overall))));
}

export function useAttachmentCompressionProgress(): { active: boolean; percent: number } {
  return useSyncExternalStore(
    (listener) => {
      compressionProgressListeners.add(listener);
      return () => compressionProgressListeners.delete(listener);
    },
    getCompressionProgressSnapshot,
    () => COMPRESSION_PROGRESS_SERVER_SNAPSHOT
  );
}

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

export type CompressImageKbBand = { minKb: number; maxKb: number };

function readEntitlementKb(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Plan entitlements → From–To KB band; 0 = platform default side. */
export function compressImageKbBandFromEntitlements(
  entitlements: Partial<Entitlements> | undefined,
  useLocalLimit: boolean
): CompressImageKbBand {
  const defaultMax = useLocalLimit ? LOCAL_LIKE_IMAGE_MAX_KB : ONLINE_IMAGE_MAX_KB;
  const defaultMin = IMAGE_SOFT_MIN_KB;
  const e = entitlements ?? {};

  const maxRaw = useLocalLimit
    ? typeof e.maxCompressImageKbLocal === "number"
      ? e.maxCompressImageKbLocal
      : e.maxCompressImageKb
    : e.maxCompressImageKb;
  const minRaw = useLocalLimit
    ? typeof e.minCompressImageKbLocal === "number"
      ? e.minCompressImageKbLocal
      : e.minCompressImageKb
    : e.minCompressImageKb;

  let maxKb = readEntitlementKb(maxRaw);
  let minKb = readEntitlementKb(minRaw);
  if (maxKb <= 0) maxKb = defaultMax;
  if (minKb <= 0) {
    // Legacy: sirf To set tha — From ≈ 90% of To; defaults par platform floor.
    minKb = maxKb !== defaultMax ? Math.max(8, Math.floor(maxKb * 0.9)) : defaultMin;
  }
  if (minKb > maxKb) [minKb, maxKb] = [maxKb, minKb];
  maxKb = Math.max(1, maxKb);
  minKb = Math.max(1, Math.min(minKb, maxKb));
  return { minKb, maxKb };
}

/** @deprecated Use `compressImageKbBandFromEntitlements` — max side of band. */
export function compressImageMaxKbFromEntitlements(
  entitlements: Partial<Entitlements> | undefined,
  useLocalLimit: boolean
): number {
  return compressImageKbBandFromEntitlements(entitlements, useLocalLimit).maxKb;
}

export function attachmentImageKbBandForCompany(
  company?: CompanyStorageRow | null,
  entitlements?: Partial<Entitlements> | null
): CompressImageKbBand {
  const useLocal = companyUsesRelaxedImageAttachmentCap(company);
  if (entitlements) {
    return compressImageKbBandFromEntitlements(entitlements, useLocal);
  }
  const maxKb = useLocal ? LOCAL_LIKE_IMAGE_MAX_KB : ONLINE_IMAGE_MAX_KB;
  return { minKb: IMAGE_SOFT_MIN_KB, maxKb };
}

export function attachmentImageMaxKbForCompany(
  company?: CompanyStorageRow | null,
  entitlements?: Partial<Entitlements> | null
): number {
  return attachmentImageKbBandForCompany(company, entitlements).maxKb;
}

async function resolvePlanEntitlementsForCompany(
  companyId: string,
  companyRow?: CompanyStorageRow | null
): Promise<Partial<Entitlements> | undefined> {
  try {
    const { readCachedPlansRecord, defaultPlansRecordFallback } = await import("@/lib/plansCatalogCache");
    const { getPlanFromPlans } = await import("@/hooks/useLivePlans");
    const { readCompanyPlanLocalCache } = await import("@/lib/companyPlanLocalCache");
    const planId = normalizePlanIdForClient(
      String(readCompanyPlanLocalCache(companyId)?.planId || "basic")
    ) as PlanId;
    return getPlanFromPlans(readCachedPlansRecord() ?? defaultPlansRecordFallback(), planId).entitlements;
  } catch {
    return undefined;
  }
}

export function attachmentImageMaxBytesForCompany(
  company?: CompanyStorageRow | null,
  entitlements?: Partial<Entitlements> | null
): number {
  return attachmentImageMaxKbForCompany(company, entitlements) * 1024;
}

/** Resolve From–To KB band from company id. Unknown → online 50–100 KB. */
export async function resolveAttachmentImageKbBand(
  companyId?: string | null
): Promise<CompressImageKbBand> {
  const cid = String(companyId || "").trim();
  if (!cid) return { minKb: IMAGE_SOFT_MIN_KB, maxKb: ONLINE_IMAGE_MAX_KB };
  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const row = (await getLocalCompanyById(cid, { includeDeleted: true })) as CompanyStorageRow | null;
    const entitlements = await resolvePlanEntitlementsForCompany(cid, row);
    return attachmentImageKbBandForCompany(row, entitlements);
  } catch {
    return { minKb: IMAGE_SOFT_MIN_KB, maxKb: ONLINE_IMAGE_MAX_KB };
  }
}

/** Resolve image cap from company id (registry). Unknown / missing → online 100KB. */
export async function resolveAttachmentImageMaxBytes(
  companyId?: string | null
): Promise<number> {
  const band = await resolveAttachmentImageKbBand(companyId);
  return band.maxKb * 1024;
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
): Promise<{ file: File; maxBytes: number; maxKb: number; minKb: number }> {
  const end = beginImageCompressionProcessing();
  try {
    const band = await resolveAttachmentImageKbBand(companyId);
    const maxBytes = band.maxKb * 1024;
    setAttachmentCompressionProgress(1);
    const { compressVoucherAttachment } = await import("@/lib/compression");
    const out = await compressVoucherAttachment(file, maxBytes, {
      minKB: band.minKb,
      onProgress: (pct) => setAttachmentCompressionProgress(pct),
    });
    return { file: out, maxBytes, maxKb: band.maxKb, minKb: band.minKb };
  } finally {
    setAttachmentCompressionProgress(100);
    finishAttachmentCompressionProgress();
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

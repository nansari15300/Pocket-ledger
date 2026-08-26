"use client";

import { looksLikePdfAttachmentUrl } from "@/lib/voucherAttachmentPdfAsImage";

export const MASTER_SAVE_PDF_AS_IMAGE_STORAGE_KEY = "pocket-ledger-master-save-pdf-as-image";
export const MASTER_LOCK_PDF_AS_PDF_STORAGE_KEY = "pocket-ledger-master-lock-pdf-as-pdf";

export const SAVE_PDF_AS_JPEG_HELP =
  "All pages in one vertical image (smaller upload). Applies on Save when checked.";

export const LOCK_PDF_AS_PDF_HELP =
  "Keeps PDF attachments as PDF on Save. Locked PDFs cannot be converted to JPEG. Users without unlock permission cannot turn this off on saved records.";

export function readMasterSavePdfAsImagePreference(defaultValue = false): boolean {
  return readBooleanStoragePref(MASTER_SAVE_PDF_AS_IMAGE_STORAGE_KEY, defaultValue);
}

export function readLockPdfAsPdfPreference(defaultValue = false): boolean {
  return readBooleanStoragePref(MASTER_LOCK_PDF_AS_PDF_STORAGE_KEY, defaultValue);
}

export function writeLockPdfAsPdfPreference(value: boolean): void {
  writeBooleanStoragePref(MASTER_LOCK_PDF_AS_PDF_STORAGE_KEY, value);
}

export function writeMasterSavePdfAsImagePreference(value: boolean): void {
  writeBooleanStoragePref(MASTER_SAVE_PDF_AS_IMAGE_STORAGE_KEY, value);
}

function readBooleanStoragePref(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* storage optional */
  }
  return defaultValue;
}

function writeBooleanStoragePref(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* storage optional */
  }
}

export function normalizeLockedPdfFileUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u): u is string => typeof u === "string" && Boolean(String(u).trim()))
    .filter((u) => looksLikePdfAttachmentUrl(u));
}

export function readLockedPdfFileUrlsFromRow(row: Record<string, unknown> | null | undefined): string[] {
  if (!row) return [];
  return normalizeLockedPdfFileUrls(row.lockedPdfFileUrls);
}

/** UI: persisted locks force lock ON until user with unlock permission turns it off. */
export function resolveLockPdfAsPdfUiState(params: {
  preference: boolean;
  existingLockedPdfFileUrls?: readonly string[];
  canUnlockLockedPdf: boolean;
}): { checked: boolean; disableUncheck: boolean } {
  const persisted = normalizeLockedPdfFileUrls(params.existingLockedPdfFileUrls);
  if (persisted.length === 0) {
    return { checked: params.preference, disableUncheck: false };
  }
  if (!params.canUnlockLockedPdf) {
    return { checked: true, disableUncheck: true };
  }
  return { checked: params.preference, disableUncheck: false };
}

export function buildLockedPdfFileUrlsForSave(params: {
  lockPdfAsPdf: boolean;
  existingLocked?: readonly string[];
  finalFileUrls: readonly string[];
  canUnlockLockedPdf: boolean;
}): string[] {
  const final = params.finalFileUrls
    .map((u) => String(u || "").trim())
    .filter(Boolean);
  const pdfs = final.filter(looksLikePdfAttachmentUrl);
  const existing = normalizeLockedPdfFileUrls(params.existingLocked).filter((u) => final.includes(u));

  if (params.lockPdfAsPdf) {
    const merged = [...existing];
    for (const url of pdfs) {
      if (!merged.includes(url)) merged.push(url);
    }
    return merged;
  }

  if (!params.canUnlockLockedPdf) {
    return existing;
  }

  return existing.filter((u) => !looksLikePdfAttachmentUrl(u));
}

export function attachmentLockFieldsForFinalUrls(
  finalFileUrls: readonly string[],
  opts?: {
    existingLockedPdfFileUrls?: readonly string[];
    canUnlockLockedPdf?: boolean;
  }
): { lockedPdfFileUrls?: string[] } {
  const lockedPdfFileUrls = buildLockedPdfFileUrlsForSave({
    lockPdfAsPdf: readLockPdfAsPdfPreference(false),
    existingLocked: opts?.existingLockedPdfFileUrls,
    finalFileUrls,
    canUnlockLockedPdf: opts?.canUnlockLockedPdf ?? false,
  });
  if (lockedPdfFileUrls.length === 0) return {};
  return { lockedPdfFileUrls };
}

export function shouldSkipPdfToJpegConversion(params: {
  lockPdfAsPdf: boolean;
  lockedPdfFileUrls?: readonly string[];
  item: File | string;
}): boolean {
  if (params.lockPdfAsPdf) return true;
  if (typeof params.item === "string") {
    const locked = normalizeLockedPdfFileUrls(params.lockedPdfFileUrls);
    return locked.includes(params.item.trim());
  }
  return false;
}

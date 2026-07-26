"use client";

import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";
import { isFirebaseLedgerDeltaSqliteTransportMode } from "@/lib/firebaseLedgerSyncPolicy";

/**
 * Background full warm sync (Firestore → SQLite mirror + attachment bytes cache).
 * Static APK / EXE: default ON so offline par voucher files click par load na hon.
 * Web-only: opt-in via `NEXT_PUBLIC_BACKGROUND_WARM_SYNC=1`. Force off: `=0`.
 */
export function backgroundWarmSyncEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const raw = String(process.env.NEXT_PUBLIC_BACKGROUND_WARM_SYNC || "").trim();
  if (raw === "0") return false;
  if (raw === "1") return true;
  if (!isFirebaseLedgerDeltaSqliteTransportMode()) return false;
  if (process.env.NEXT_PUBLIC_STATIC_BUILD === "1") return true;
  if (typeof window !== "undefined" && isEmbeddedOfflinePreloadClient()) return true;
  return false;
}

/** Debounce rapid cloud-sync poke events so one burst of saves → one Drive cycle. */
export const CLOUD_SYNC_POKE_DEBOUNCE_MS = 4_000;

/**
 * IC peer attachments: link same HTTPS URL on target instead of re-uploading bytes
 * (saves Storage egress + duplicate objects). Local/Drive refs still copy when needed.
 */
export function interCompanyLinkAttachmentsWithoutCopy(): boolean {
  if (
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_IC_ATTACHMENT_FORCE_COPY || "").trim() === "1"
  ) {
    return false;
  }
  return true;
}

/** Ref-count registry before deleting Firebase Storage objects on voucher purge. */
export function companyAttachmentRegistryEnabled(): boolean {
  if (
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_ATTACHMENT_REGISTRY_OFF || "").trim() === "1"
  ) {
    return false;
  }
  return true;
}

/** Voucher forms: pick an attachment already used on another voucher (no re-upload). */
export function voucherAttachmentReuseEnabled(): boolean {
  if (
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_VOUCHER_ATTACHMENT_REUSE_OFF || "").trim() === "1"
  ) {
    return false;
  }
  return true;
}

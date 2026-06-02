"use client";

/**
 * Firebase / Storage billing knobs — safe defaults reduce reads, duplicate uploads, and sync churn.
 * Override via env only when debugging legacy behaviour.
 */

/** Background full warm sync (Firestore pull + attachment prefetch). Keep off in production. */
export function backgroundWarmSyncEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_BACKGROUND_WARM_SYNC || "").trim() === "1"
  );
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

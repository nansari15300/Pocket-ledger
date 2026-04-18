"use client";

/**
 * Offline/local voucher create — SQLite `company_docs` id attachments (IndexedDB blobs) ke saath align rahein.
 * `voucherActionsClient` aur forms dono yahi format use karein.
 */
export function generateLocalVoucherIdForCreate(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `voucher_${Date.now().toString(36)}_${rand}`;
}

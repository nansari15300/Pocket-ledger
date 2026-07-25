"use client";

const KEY_PREFIX = "pl_server_offline_mirror_ready_v1:";

export const PL_SERVER_OFFLINE_MASTER_COLLECTIONS = [
  "parties",
  "bank_accounts",
  "staff",
  "items",
  "taxes",
  "expense_accounts",
] as const;

export function markPlServerOfflineMirrorReady(companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${companyId}`, String(Date.now()));
  } catch {
    /* storage can be unavailable */
  }
}

export function isPlServerOfflineMirrorReady(companyId: string): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  try {
    return Number(window.localStorage.getItem(`${KEY_PREFIX}${companyId}`) || 0) > 0;
  } catch {
    return false;
  }
}

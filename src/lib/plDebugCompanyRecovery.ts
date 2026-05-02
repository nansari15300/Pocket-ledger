"use client";

/**
 * P3 / diagnose: APK par voucher save ke baad `/company` list flicker tracing.
 *
 * Enable (ek hi bar):
 * - DevTools console: `sessionStorage.setItem('pl_debug_company_recovery','1')` phir reload; ya
 * - Build-time: `NEXT_PUBLIC_PL_DEBUG_COMPANY_RECOVERY=1` (static export me env bake hota hai).
 */

function envFlag(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PL_DEBUG_COMPANY_RECOVERY === "1";
  } catch {
    return false;
  }
}

export function isPlCompanyRecoveryDebugEnabled(): boolean {
  if (typeof window === "undefined") return envFlag();
  try {
    if (window.sessionStorage.getItem("pl_debug_company_recovery") === "1") return true;
  } catch {
    /* private mode / quota */
  }
  return envFlag();
}

/** Rapid list merges dikhayein — throttle nahi taaki voucher-save race miss na ho */
export function plDbgCompanyRecovery(tag: string, payload?: Record<string, unknown>): void {
  if (!isPlCompanyRecoveryDebugEnabled()) return;
  const rel =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now().toFixed(0)
      : "";
  console.info(`[PL company-recovery] +${rel}ms ${tag}`, payload ?? {});
}

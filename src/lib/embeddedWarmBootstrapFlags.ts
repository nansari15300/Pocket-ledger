"use client";

/**
 * APK/static: `runOfflineFullWarmSync` ek baar poora ho chuka ho to startup par
 * `getIdToken` + idle plan-sync kam chalao — attachment IndexedDB prefetch / SQLite ko pehle saans.
 * Logout par prefix clear taaki naye session me pehli baar wapas normal bootstrap ho.
 */

const KEY_PREFIX = "pl_embedded_full_warm_ok_v1:";

/** Warm sync successfully finished — current Firebase uid ke liye flag (multi-account safe). */
export function markEmbeddedFullWarmSucceeded(uid: string | null | undefined): void {
  if (typeof window === "undefined" || !uid?.trim()) return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${uid.trim()}`, "1");
  } catch {
    /* private mode / quota */
  }
}

/**
 * Startup par idle plan-sync / token refresh skip — React `user.uid` kabhi `local:…` synthetic hota hai
 * jabki warm flag Firebase `auth.currentUser.uid` pe lagta hai; dono me se koi bhi match ho to skip.
 */
export function shouldSkipEmbeddedStartupAuthChurn(
  uidFromReact: string | null | undefined,
  uidFromAuth: string | null | undefined
): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (const u of [uidFromReact, uidFromAuth]) {
      const t = u?.trim();
      if (t && window.localStorage.getItem(`${KEY_PREFIX}${t}`) === "1") return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Logout: saare warm-ok flags hatao taaki agli login pe pehla session phir se aggressive sync kar sake. */
export function clearEmbeddedWarmBootstrapFlags(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

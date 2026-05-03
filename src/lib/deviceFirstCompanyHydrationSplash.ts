"use client";

/**
 * Ek device + ek Firebase/local uid — pehli baar login ke baad company hydrate splash "seen" persist.
 * Logout/sign-in same uid dubara dikhaega hi nahi; naya uid = fir se first-time for that account.
 */

const STORAGE_KEY_PREFIX = "pl:v1:firstCompanyHydrationSplashSeen:";

export function hydrationSplashStorageKey(uid: string): string {
  return `${STORAGE_KEY_PREFIX}${uid}`;
}

/** Pehle login splash pehle hi dikh chuka — skip */
export function hasCompanyHydrationSplashBeenSeen(uid: string | null | undefined): boolean {
  if (!uid || typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(hydrationSplashStorageKey(uid)) === "1";
  } catch {
    return true;
  }
}

/** Splash complete ke baad — dubara same device + uid pe mat dikhao */
export function markCompanyHydrationSplashSeen(uid: string): void {
  if (typeof window === "undefined" || !uid.trim()) return;
  try {
    window.localStorage.setItem(hydrationSplashStorageKey(uid.trim()), "1");
  } catch {
    /* private mode / quota */
  }
}

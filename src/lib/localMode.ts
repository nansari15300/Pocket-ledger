"use client";

import { computeIsLocalOnlyMode } from "@/lib/dataSourceModeDefaults";

/**
 * Jab naya company sirf SQLite pe banana ho (Firestore "Online / Local" chooser hi na dikhe).
 * Sirf explicit `NEXT_PUBLIC_LOCAL_ONLY_MODE` — static/Capacitor build me bhi Pro+ user ko online slot ho to
 * Create Company me cloud vs device pick dikhe (`CreateCompanyForm` hasFreeOnlineSlot branch).
 */
export function isForceLocalCompanyCreationBuild(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === "1";
}

/** Local-only mode: static/APK, env-flag, ya user ne Local choose kiya; web default ab Firebase (server). */
export function isLocalOnlyMode(): boolean {
  return computeIsLocalOnlyMode();
}

/**
 * Local-only builds: company list hamesha SQLite-first (refresh par turant load).
 * Firestore registry sirf background mirror ke liye — UI `loading` block na kare.
 */
export function isOfflineSqliteCompanyRegistry(_browserOnline: boolean): boolean {
  return isLocalOnlyMode();
}

/** Web Firebase mode — live Firestore onSnapshot company registry. */
export function isLiveFirestoreCompanyRegistry(_browserOnline: boolean): boolean {
  return !isLocalOnlyMode();
}

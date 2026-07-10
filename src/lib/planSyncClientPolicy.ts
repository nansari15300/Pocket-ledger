"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * Static export (APK/Electron `build:static`) + Capacitor native:
 * company SQLite-local ho tab bhi **online** rehte hi server se plan sync + billing subscribe chalna chahiye.
 *
 * ⚠️ MAT HATANA / MAT refactors me is helper ko hata kar `isLocalOnlyMode()` se sync band karna —
 * bar-bar static pe live plan sync + subscribe server sync toot jata hai.
 *
 * Policy: web/static/native sab par local SQLite company ke liye online hote hi **plan-only**
 * `sync-plan` chain chalta rahe. Ledger/company data Firestore par flip nahi hota.
 */
export function embeddedClientRequiresServerPlanSyncWhenOnline(): boolean {
  if (process.env.NODE_ENV === "development") {
    return isCapacitorNativeApp();
  }
  return isStaticAppBuild() || isCapacitorNativeApp();
}

/** Local-only ledger par bhi periodic online plan sync chalao; data sync alag gates se controlled hai. */
export function shouldSkipPeriodicPlanSyncForLocalOnlyMode(isLocalOnly: boolean): boolean {
  void isLocalOnly;
  return false;
}

/**
 * Static/APK/Capacitor: Firebase company list + realtime sync chalao — Google Drive sirf storage option hai,
 * pehle se Firestore wali companies dikhni/sync honi chahiye (`isLocalOnlyMode` SQLite path se alag).
 */
export function embeddedClientUsesFirestoreCompanyList(): boolean {
  return embeddedClientRequiresServerPlanSyncWhenOnline();
}

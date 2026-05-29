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
 * Policy: sirf **pure web browser** jahan user ne local-only mode choose kiya ho wahan periodic
 * `sync-plan` chain optional skip; static/native kabhi skip mat karo.
 */
export function embeddedClientRequiresServerPlanSyncWhenOnline(): boolean {
  return isStaticAppBuild() || isCapacitorNativeApp();
}

/**
 * Web local-only: periodic auto `sync-plan` skip.
 * Static/APK/Capacitor: `isLocalOnlyMode()` true ho tab bhi **false** — online live sync chalao.
 */
export function shouldSkipPeriodicPlanSyncForLocalOnlyMode(isLocalOnly: boolean): boolean {
  if (!isLocalOnly) return false;
  // Static/native embedded clients: local SQLite par bhi server plan sync mandatory jab online ho.
  return !embeddedClientRequiresServerPlanSyncWhenOnline();
}

/**
 * Static/APK/Capacitor: Firebase company list + realtime sync chalao — Drive/Dropbox sirf storage option hai,
 * pehle se Firestore wali companies dikhni/sync honi chahiye (`isLocalOnlyMode` SQLite path se alag).
 */
export function embeddedClientUsesFirestoreCompanyList(): boolean {
  return embeddedClientRequiresServerPlanSyncWhenOnline();
}

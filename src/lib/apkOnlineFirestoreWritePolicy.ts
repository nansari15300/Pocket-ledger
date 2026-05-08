"use client";

/**
 * APK-only: Firebase/cloud company ko SQLite/outbox-first mat rakho — Firestore writes se redirect/UI race kam.
 * EXE/desktop static (Capacitor nahi) paths is module se consciously gate kiye gaye taaki Electron bundle na badle.
 */

import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { readServerDirectWritesPreferredSync } from "@/lib/serverDirectWritesPreference";

/** Sidebar "Server writes" ON: static bundle ya APK par Firestore seedha; reads SQLite mirror alag flags se. */
export function shouldForceFirestoreWritesOnStaticOrApk(): boolean {
  if (!readServerDirectWritesPreferredSync()) return false;
  return isCapacitorNativeApp() || isStaticAppBuild();
}

/**
 * APK/static: switch OFF = vouchers/masters/groups SQLite + outbox (ya mirror-first) se save;
 * ON = `shouldForceFirestoreWritesOnStaticOrApk` → seedha Firestore.
 * Reads UI me SQLite/warm mirror pe rehte hain — yeh sirf **write** routing.
 */
export function apkEmbeddedSqliteFirstWritesPreferred(): boolean {
  if (!isCapacitorNativeApp() && !isStaticAppBuild()) return false;
  return !readServerDirectWritesPreferredSync();
}

/** True sirf Capacitor + company row explicitly `storageOption: local` nahi */
export function apkCloudFirestoreMasterWriteFromCompanyShape(company: { storageOption?: string } | null | undefined): boolean {
  if (!isCapacitorNativeApp() || !company) return false;
  return String(company.storageOption ?? "").toLowerCase() !== "local";
}

/**
 * SQLite/outbox voucher path (purana `isLocalOnlyMode()` create/update) sirf tab jab zaroor —
 * APK par cloud company = false taaki turant mirror/outbox reload race na khule.
 */
export async function apkCloudCompanyUsesSqliteFirstWrites(companyId: string): Promise<boolean> {
  if (shouldForceFirestoreWritesOnStaticOrApk()) return false;
  /** Mobile APK / static: OFF par cloud company bhi voucher save SQLite-first (`saveVoucher` outbox branch). */
  if (apkEmbeddedSqliteFirstWritesPreferred()) return true;
  if (!isLocalOnlyMode()) return false;
  if (!isCapacitorNativeApp()) return true;
  try {
    const row = await getLocalCompanyById(companyId);
    return String(row?.storageOption ?? "").toLowerCase() === "local";
  } catch {
    return true;
  }
}

/** Master/item forms: mirror `EditItemDialog` / party — `company` sync available */
export function apkEntityWriteUsesLocalSqliteMirror(company: { storageOption?: string } | null | undefined): boolean {
  if (shouldForceFirestoreWritesOnStaticOrApk()) return false;
  /** APK/static + Server writes OFF: party/staff/tax… save local + outbox (Firestore seedha nahi). */
  if (apkEmbeddedSqliteFirstWritesPreferred()) return true;
  if (!isLocalOnlyMode()) return false;
  if (!company || !isCapacitorNativeApp()) return true;
  return String(company.storageOption ?? "").toLowerCase() === "local";
}

/**
 * APK + Firestore company: master dialogs me dropdown lists SQLite mirror / warm-sync se —
 * redundant `onSnapshot` band taaki offline UI stable rahe aur network churn kam ho.
 */
export function apkCloudEntityMasterReadFromSqliteMirror(
  company: { storageOption?: string } | null | undefined
): boolean {
  return apkCloudFirestoreMasterWriteFromCompanyShape(company) && isLocalOnlyMode();
}

/**
 * APK + Firestore company (`storageOption` ≠ local) + device offline ⇒ UI: view-only (Save/Copy/Delete band; Cancel chalu).
 * EXE/desktop: `isCapacitorNativeApp` false — hamesha false.
 */
export function apkCloudCompanyOfflineViewOnly(
  company: { storageOption?: string } | null | undefined,
  navigatorOnline: boolean
): boolean {
  if (!isCapacitorNativeApp() || !company) return false;
  if (String(company.storageOption ?? "").toLowerCase() === "local") return false;
  /** Server writes OFF: offline par bhi SQLite/outbox save — Save band mat karo. */
  if (apkEmbeddedSqliteFirstWritesPreferred()) return false;
  return !navigatorOnline;
}

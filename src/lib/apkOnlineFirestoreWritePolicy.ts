"use client";

/**
 * APK-only: Firebase/cloud company ko SQLite/outbox-first mat rakho — Firestore writes se redirect/UI race kam.
 * EXE/desktop static (Capacitor nahi) paths is module se consciously gate kiye gaye taaki Electron bundle na badle.
 */

import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

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
  if (!isLocalOnlyMode()) return false;
  if (!company || !isCapacitorNativeApp()) return true;
  return String(company.storageOption ?? "").toLowerCase() === "local";
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
  return !navigatorOnline;
}

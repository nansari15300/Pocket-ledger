"use client";

/**
 * Embedded (Capacitor APK + static web export): ledger writes hamesha SQLite/outbox-first — online/offline same path.
 * `writeEntity` / `saveVoucher` isi module se align; user "Server writes" toggle hata diya gaya.
 */

import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

/**
 * Voucher/attachment pipeline: `navigator.onLine === false` par Storage `uploadBytes` / `getDownloadURL` await mat karo —
 * forms `local:` + IndexedDB stage karein aur `saveVoucher` SQLite/outbox path le (flush pe hydrate).
 */
export function isClientNavigatorOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}

/** Purana toggle hata — static/APK par kabhi seedha Firestore ledger write force nahi. */
export function shouldForceFirestoreWritesOnStaticOrApk(): boolean {
  return false;
}

/**
 * APK / static build / Electron EXE: vouchers/masters hamesha SQLite + outbox se save.
 * Web (dono false): sirf `isLocalOnlyMode()` + niche company `storageOption` rules.
 */
export function apkEmbeddedSqliteFirstWritesPreferred(): boolean {
  return isEmbeddedOfflinePreloadClient();
}

/** Voucher forms: duplicate check / backdate — Firestore `getDoc` offline mat. */
export function preferLocalLedgerReads(): boolean {
  return isLocalOnlyMode() || apkEmbeddedSqliteFirstWritesPreferred() || isClientNavigatorOffline();
}

/** Outbox enqueue ke baad turant flush — embedded offline par band (console Write spam + hang). */
export function shouldAutoFlushOutboxAfterEnqueue(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isClientNavigatorOffline()) return false;
  return navigator.onLine;
}

/** True sirf Capacitor + company row explicitly `storageOption: local` nahi */
export function apkCloudFirestoreMasterWriteFromCompanyShape(company: { storageOption?: string } | null | undefined): boolean {
  if (!isCapacitorNativeApp() || !company) return false;
  return String(company.storageOption ?? "").toLowerCase() !== "local";
}

/**
 * SQLite/outbox voucher path — static/APK par hamesha true; web par local-only / local-storage company.
 */
export async function apkCloudCompanyUsesSqliteFirstWrites(companyId: string): Promise<boolean> {
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
 * Static build: hamesha local save — view-only kabhi nahi.
 */
export function apkCloudCompanyOfflineViewOnly(
  company: { storageOption?: string } | null | undefined,
  navigatorOnline: boolean
): boolean {
  if (!isCapacitorNativeApp() || !company) return false;
  if (String(company.storageOption ?? "").toLowerCase() === "local") return false;
  /** Static/APK embedded: offline par bhi SQLite/outbox — Save band mat karo. */
  if (apkEmbeddedSqliteFirstWritesPreferred()) return false;
  return !navigatorOnline;
}

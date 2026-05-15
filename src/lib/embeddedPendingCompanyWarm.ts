"use client";

/**
 * APK/static: company select ke baad full SQLite mirror pehle — `FirstDeviceCompanyHydrationOverlay` session flag.
 * Data phase ke baad flag clear; attachment cache header progress + background me.
 */
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import type { Company } from "@/hooks/useCompany";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";

function embeddedClient(): boolean {
  return isStaticAppBuild() || (typeof window !== "undefined" && isCapacitorNativeApp());
}

function storageKey(uid: string, companyId: string): string {
  return `pl:v1:embeddedPendingDataWarm:${uid.trim()}:${companyId.trim()}`;
}

/** Cloud-backed company picker / header switch — data warm overlay queue (sirf embedded). */
export function maybeMarkEmbeddedPendingCompanyDataWarm(
  uid: string | null | undefined,
  company: Pick<Company, "id"> & Partial<Company>,
): void {
  if (!embeddedClient() || typeof window === "undefined") return;
  if (!uid?.trim() || !company?.id?.trim()) return;
  if (isOfflineCompanyStorage(company as Company)) return;
  if (!isCloudBackedCompanyShape(company as Company)) return;
  try {
    sessionStorage.setItem(storageKey(uid, company.id), "1");
  } catch {
    /* private mode / quota */
  }
}

export function clearEmbeddedPendingCompanyDataWarm(
  uid: string | null | undefined,
  companyId: string | null | undefined,
): void {
  if (typeof window === "undefined" || !uid?.trim() || !companyId?.trim()) return;
  try {
    sessionStorage.removeItem(storageKey(uid, companyId));
  } catch {
    /* ignore */
  }
}

export function hasEmbeddedPendingCompanyDataWarm(
  uid: string | null | undefined,
  companyId: string | null | undefined,
): boolean {
  if (!uid?.trim() || !companyId?.trim() || typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(storageKey(uid, companyId)) === "1";
  } catch {
    return false;
  }
}

"use client";

import { readCloudCompanyPasswordUnlockSession } from "@/lib/cloudCompanyPasswordUnlockRemember";
import { readAnyStoredOfflineUnlockSessionForCompany, readStoredOfflineUnlockSession } from "@/lib/offlineCompanyUnlockRemember";
import { setLocalAuthToken } from "@/lib/localApiClient";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";

export type PostAuthCompanyRoute = "/dashboard" | "/company";

/**
 * Static/local startup: reuse remembered company unlock only for the last selected company.
 * If remembered window is valid, skip company picker and open dashboard directly.
 */
export function resolvePostAuthCompanyRoute(firebaseUid: string | undefined): PostAuthCompanyRoute {
  if (typeof window === "undefined") return "/company";
  // Multi-tab refresh: route decision should use this tab's company, not another tab's global last company.
  const selectedCompanyId = readSelectedCompanyId();
  if (!selectedCompanyId) return "/company";

  // Offline/local company: remembered token+user must still be valid; then restore local auth.
  // Fast-local synthetic uid (`local:*`) won't match old Firebase-keyed remember entry, so fallback scan by company.
  const rememberedOffline =
    readStoredOfflineUnlockSession(firebaseUid, selectedCompanyId) ||
    readAnyStoredOfflineUnlockSessionForCompany(selectedCompanyId);
  if (rememberedOffline) {
    setLocalAuthToken(selectedCompanyId, rememberedOffline.token, rememberedOffline.user);
    return "/dashboard";
  }

  // Online company with per-company password: valid "remember X days" window means no prompt needed.
  if (readCloudCompanyPasswordUnlockSession(firebaseUid, selectedCompanyId)) {
    return "/dashboard";
  }

  return "/company";
}

/**
 * APK/EXE fast boot: Firebase uid hydrate hone se pehle bhi last local company unlock valid ho to app dashboard khol sakta hai.
 * Cloud company ke liye use mat karo — Firestore rules ke liye real Firebase user zaroori hota hai.
 */
export function restoreRememberedLocalCompanyForFastBoot(): boolean {
  if (typeof window === "undefined") return false;
  // APK/desktop fast boot still supports multi-tab browser refresh by preferring session company.
  const selectedCompanyId = readSelectedCompanyId();
  if (!selectedCompanyId) return false;
  const rememberedOffline = readAnyStoredOfflineUnlockSessionForCompany(selectedCompanyId);
  if (!rememberedOffline) return false;
  setLocalAuthToken(selectedCompanyId, rememberedOffline.token, rememberedOffline.user);
  return true;
}

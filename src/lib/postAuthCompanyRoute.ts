"use client";

import { readCloudCompanyPasswordUnlockSession } from "@/lib/cloudCompanyPasswordUnlockRemember";
import { readStoredOfflineUnlockSession } from "@/lib/offlineCompanyUnlockRemember";
import { setLocalAuthToken } from "@/lib/localApiClient";

export type PostAuthCompanyRoute = "/dashboard" | "/company";

/**
 * Static/local startup: reuse remembered company unlock only for the last selected company.
 * If remembered window is valid, skip company picker and open dashboard directly.
 */
export function resolvePostAuthCompanyRoute(firebaseUid: string | undefined): PostAuthCompanyRoute {
  if (typeof window === "undefined") return "/company";
  const selectedCompanyId = localStorage.getItem("companyId")?.trim();
  if (!selectedCompanyId) return "/company";

  // Offline/local company: remembered token+user must still be valid; then restore local auth.
  const rememberedOffline = readStoredOfflineUnlockSession(firebaseUid, selectedCompanyId);
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

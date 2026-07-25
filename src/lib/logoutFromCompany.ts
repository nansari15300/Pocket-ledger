"use client";

import { clearLocalAuth } from "@/lib/localApiClient";
import {
  clearAllOfflineUnlockSessionsForCompany,
  clearOfflineUnlockSession,
} from "@/lib/offlineCompanyUnlockRemember";
import { clearCloudCompanyPasswordUnlockSession } from "@/lib/cloudCompanyPasswordUnlockRemember";
import { clearRememberedSharedUnlockUsername } from "@/lib/onlineSharedUnlockRememberUsername";

/** Device-only company logout. Keeps the app account and company data intact. */
export function logoutFromCompanyOnThisDevice(
  companyId: string,
  user?: { uid?: string | null; email?: string | null } | null
): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  clearLocalAuth(id);
  clearOfflineUnlockSession(user?.uid || undefined, id);
  clearAllOfflineUnlockSessionsForCompany(id);
  clearCloudCompanyPasswordUnlockSession(user?.uid || undefined, id, user?.email);
  clearRememberedSharedUnlockUsername(user?.uid || undefined, id, user?.email);
}

"use client";

import {
  ADMIN_PANEL_COMPANY_LOCAL_ID,
  ADMIN_PANEL_COMPANY_MODE_SESSION_KEY,
  ADMIN_PANEL_COMPANY_NAME,
} from "@/lib/adminPanelCompany/constants";
import { writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } from "@/lib/applyStripePlanToLocalCompany";

export function isAdminPanelCompanyLocalId(companyId: string | null | undefined): boolean {
  return String(companyId || "").trim() === ADMIN_PANEL_COMPANY_LOCAL_ID;
}

export function isAdminPanelCompanyLedgerMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ADMIN_PANEL_COMPANY_MODE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export async function activateAdminPanelCompanyLedgerMode(ownerId: string, ownerEmail?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMIN_PANEL_COMPANY_MODE_SESSION_KEY, "1");
  await upsertLocalCompany({
    id: ADMIN_PANEL_COMPANY_LOCAL_ID,
    name: ADMIN_PANEL_COMPANY_NAME,
    ownerId,
    ownerEmail: ownerEmail ?? null,
    localOnly: true,
    localPersistence: "sqlite",
    firestoreSyncDisabled: true,
    storageOption: "local",
    syncPolicy: "offline",
    syncedFromCloud: false,
    kind: "admin-panel-company",
    planId: "pro-plus",
    isOwned: true,
  });
  writeSelectedCompanyId(ADMIN_PANEL_COMPANY_LOCAL_ID);
  window.dispatchEvent(
    new CustomEvent("pl-company-switched", { detail: { companyId: ADMIN_PANEL_COMPANY_LOCAL_ID } })
  );
  window.dispatchEvent(new CustomEvent("pl-admin-panel-company-mode"));
  window.dispatchEvent(new Event(BUMP_LOCAL_COMPANY_REGISTRY_EVENT));
}

export function leaveAdminPanelCompanyLedgerMode(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADMIN_PANEL_COMPANY_MODE_SESSION_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("pl-admin-panel-company-mode"));
}

"use client";

import {
  ADMIN_PANEL_COMPANY_LOCAL_ID,
  ADMIN_PANEL_COMPANY_MODE_SESSION_KEY,
  ADMIN_PANEL_COMPANY_NAME,
  ADMIN_PANEL_RETURN_COMPANY_SESSION_KEY,
} from "@/lib/adminPanelCompany/constants";
import { readSelectedCompanyId, writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";
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

function rememberCompanyBeforeAdminPanelLedger(): void {
  if (typeof window === "undefined") return;
  try {
    const current = String(readSelectedCompanyId() || "").trim();
    if (!current || current === ADMIN_PANEL_COMPANY_LOCAL_ID) return;
    sessionStorage.setItem(ADMIN_PANEL_RETURN_COMPANY_SESSION_KEY, current);
  } catch {
    /* ignore */
  }
}

export function peekAdminPanelReturnCompanyId(): string {
  if (typeof window === "undefined") return "";
  try {
    const id = String(sessionStorage.getItem(ADMIN_PANEL_RETURN_COMPANY_SESSION_KEY) || "").trim();
    return id && id !== ADMIN_PANEL_COMPANY_LOCAL_ID ? id : "";
  } catch {
    return "";
  }
}

export function consumeAdminPanelReturnCompanyId(): string {
  const id = peekAdminPanelReturnCompanyId();
  try {
    sessionStorage.removeItem(ADMIN_PANEL_RETURN_COMPANY_SESSION_KEY);
  } catch {
    /* ignore */
  }
  return id;
}

/** Boot / Back to App: never keep Admin Panel Company as the normal-app selection. */
export function resolveAppCompanyIdAfterAdminPanel(stored: string | null | undefined): string {
  const id = String(stored || "").trim();
  if (!id) return peekAdminPanelReturnCompanyId();
  if (!isAdminPanelCompanyLocalId(id)) return id;
  if (isAdminPanelCompanyLedgerMode()) return id;
  return peekAdminPanelReturnCompanyId();
}

export async function activateAdminPanelCompanyLedgerMode(ownerId: string, ownerEmail?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  rememberCompanyBeforeAdminPanelLedger();
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
  // Tab-only pin — do not overwrite global last-used (Back to App restores the previous company).
  writeSelectedCompanyId(ADMIN_PANEL_COMPANY_LOCAL_ID, { userInitiated: false });
  window.dispatchEvent(
    new CustomEvent("pl-company-switched", { detail: { companyId: ADMIN_PANEL_COMPANY_LOCAL_ID } })
  );
  window.dispatchEvent(new CustomEvent("pl-admin-panel-company-mode"));
  window.dispatchEvent(new Event(BUMP_LOCAL_COMPANY_REGISTRY_EVENT));
}

export function leaveAdminPanelCompanyLedgerMode(): string {
  if (typeof window === "undefined") return "";
  try {
    sessionStorage.removeItem(ADMIN_PANEL_COMPANY_MODE_SESSION_KEY);
  } catch {
    /* ignore */
  }
  const restoreId = consumeAdminPanelReturnCompanyId();
  if (restoreId) {
    writeSelectedCompanyId(restoreId, { userInitiated: true });
    window.dispatchEvent(new CustomEvent("pl-company-switched", { detail: { companyId: restoreId } }));
  } else if (isAdminPanelCompanyLocalId(readSelectedCompanyId())) {
    writeSelectedCompanyId("", { userInitiated: false });
  }
  window.dispatchEvent(new CustomEvent("pl-admin-panel-company-mode"));
  return restoreId;
}

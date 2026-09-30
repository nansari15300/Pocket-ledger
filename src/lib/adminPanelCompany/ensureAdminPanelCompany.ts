"use client";

import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";
import {
  ADMIN_PANEL_COMPANIES_COLLECTION,
  ADMIN_PANEL_COMPANY_LOCAL_ID,
  ADMIN_PANEL_COMPANY_NAME,
  CLOUD_ADMIN_PANEL_TENANT_ID,
} from "@/lib/adminPanelCompany/constants";
import { activateAdminPanelCompanyLedgerMode } from "@/lib/adminPanelCompany/ledgerMode";
import { grantOpenLocalCompanySession } from "@/lib/companyUnlockGate";
import type { Company } from "@/hooks/useCompany";
import { isAdminPanelCompanyRow } from "@/lib/adminPanelCompany/companyListFilter";

/** Cloud Firestore path label for UI. */
export function adminPanelCompanyCloudPathLabel(): string {
  return `${ADMIN_PANEL_COMPANIES_COLLECTION}/${CLOUD_ADMIN_PANEL_TENANT_ID}`;
}

/** Creates cloud tenant doc if missing (SuperAdmin token). */
export async function ensureAdminPanelCompanyCloud(): Promise<void> {
  const token = await getAdminPanelCompanyIdToken();
  const getRes = await fetch(adminPanelCompanyApiUrl("/api/admin/company"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getData = (await getRes.json()) as { exists?: boolean; error?: string };
  if (!getRes.ok) {
    throw new Error(getData.error || "Could not load Admin Panel Company");
  }
  if (getData.exists) return;

  const postRes = await fetch(adminPanelCompanyApiUrl("/api/admin/company"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const postData = (await postRes.json()) as { error?: string };
  if (!postRes.ok) {
    throw new Error(postData.error || "Could not create Admin Panel Company online");
  }
}

export function buildAdminPanelCompanySelectorRow(
  ownerId?: string,
  ownerEmail?: string | null
): Company {
  return {
    id: ADMIN_PANEL_COMPANY_LOCAL_ID,
    name: ADMIN_PANEL_COMPANY_NAME,
    ownerId: ownerId ?? "",
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
  } as Company;
}

/** SuperAdmin / admin ledger: row in selector registry even before first open. */
export function withAdminPanelCompanyInSelectorList<T extends { id?: string; kind?: string }>(
  list: T[],
  options: { include: boolean; ownerId?: string; ownerEmail?: string | null }
): T[] {
  if (!options.include) return list;
  if (list.some((c) => isAdminPanelCompanyRow(c))) return list;
  const row = buildAdminPanelCompanySelectorRow(options.ownerId, options.ownerEmail);
  return [row as unknown as T, ...list];
}

/**
 * Online tenant (best-effort) + local SQLite registry row for normal app UI.
 * Cloud may 403 on localhost/dev preview for non–SuperAdmin — still open local mirror.
 */
export async function ensureAdminPanelCompanyReady(
  ownerId: string,
  ownerEmail?: string | null
): Promise<{ cloudOk: boolean; cloudError?: string }> {
  let cloudOk = false;
  let cloudError: string | undefined;
  try {
    await ensureAdminPanelCompanyCloud();
    cloudOk = true;
  } catch (e) {
    cloudError = e instanceof Error ? e.message : "Could not load Admin Panel Company cloud";
  }
  await activateAdminPanelCompanyLedgerMode(ownerId, ownerEmail);
  return { cloudOk, cloudError };
}

/** Cloud + SQLite row + React company context (header name, vouchers, party). */
export async function selectAdminPanelCompanyInApp(
  ownerId: string,
  ownerEmail: string | null | undefined,
  setCompanyId: (id: string) => void
): Promise<{ cloudOk: boolean; cloudError?: string }> {
  const ready = await ensureAdminPanelCompanyReady(ownerId, ownerEmail);
  grantOpenLocalCompanySession(ADMIN_PANEL_COMPANY_LOCAL_ID, { role: "owner" });
  setCompanyId(ADMIN_PANEL_COMPANY_LOCAL_ID);
  return ready;
}

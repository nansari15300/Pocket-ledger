"use client";

import { listLocalCompanies, localCompanyRowIsDeleted, getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  normalizeLocalCompanyRowForHost,
} from "@/lib/listShareableLocalCompaniesForHost";
import {
  isLocalServerShareableCompany,
  toPlServerSharedCompanySummary,
} from "@/lib/localServerShareableCompanies";
import { localAuthLoginClientOnly } from "@/lib/localCompanyUsers";
import { COLLECTIONS_TO_BACKUP } from "@/lib/companyBackupCollections";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";

export async function devHostBridgeValidateLogin(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  try {
    const { token, user } = await localAuthLoginClientOnly(companyId, username, password);
    return { ok: true as const, token, user };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Invalid username or password",
    };
  }
}

export async function devHostBridgeListShareableCompanies() {
  const rows = await listLocalCompanies();
  return rows
    .filter((row) => !localCompanyRowIsDeleted(row))
    .map(normalizeLocalCompanyRowForHost)
    .filter(isLocalServerShareableCompany)
    .map(toPlServerSharedCompanySummary);
}

async function warmBrowserDbForExport() {
  const { flushPendingBrowserDbSave, clearBrowserDbCache, getBrowserDb } = await import("@/lib/localSqlite");
  await flushPendingBrowserDbSave();
  clearBrowserDbCache();
  await getBrowserDb();
}

export async function devHostBridgeExportMirrorCollection(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const collection = String(payload.collection || "").trim();
  if (!companyId || !collection) return null;
  if (!(COLLECTIONS_TO_BACKUP as readonly string[]).includes(collection)) return null;
  await warmBrowserDbForExport();
  const company = await getLocalCompanyById(companyId);
  if (!company) return null;
  const rows = await listCompanyDocsFromBrowserDb(companyId, collection, { forBackupMerge: true });
  return rows as Array<Record<string, unknown>>;
}

export async function devHostBridgeExportMirrorBundle(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  if (!companyId) return null;
  await warmBrowserDbForExport();
  const company = await getLocalCompanyById(companyId);
  if (!company) return null;
  const collections: Record<string, unknown[]> = {};
  for (const col of COLLECTIONS_TO_BACKUP) {
    const rows = await listCompanyDocsFromBrowserDb(companyId, col, { forBackupMerge: true });
    if (rows.length > 0) collections[col] = rows as unknown[];
  }
  return { company: company as unknown as Record<string, unknown>, collections };
}

export async function devHostBridgeMirrorHealth(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  if (!companyId) return { ok: false, error: "missing_company_id" };
  const docs = await devHostBridgeExportMirrorCollection({ companyId, collection: "vouchers" });
  if (!Array.isArray(docs)) {
    return { ok: false, error: "export_unavailable", companyId };
  }
  return {
    ok: true,
    companyId,
    renderer: "dev_host_bridge",
    voucherCount: docs.length,
    cacheReload: true,
  };
}

export async function runDevHostBridgeJob(
  type: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  switch (type) {
    case "validate_login":
      return devHostBridgeValidateLogin(payload);
    case "list_shareable_companies":
      return devHostBridgeListShareableCompanies();
    case "export_mirror_collection":
      return devHostBridgeExportMirrorCollection(payload);
    case "export_mirror_bundle":
      return devHostBridgeExportMirrorBundle(payload);
    case "mirror_health":
      return devHostBridgeMirrorHealth(payload);
    default:
      throw new Error(`unknown_dev_host_bridge_job:${type}`);
  }
}

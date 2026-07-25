"use client";

import type { Company } from "@/hooks/useCompany";
import { listLocalCompanies, localCompanyRowIsDeleted, getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";

/** SQLite row — actual storage flags preserve (online mirror ko local mat banao). */
export function normalizeLocalCompanyRowForHost(row: LocalCompanyDoc): Company {
  const storageOption = String((row as { storageOption?: string }).storageOption ?? "local").toLowerCase();
  const syncPolicyRaw = String((row as { syncPolicy?: string }).syncPolicy ?? "").toLowerCase();
  const syncedFromCloud = (row as { syncedFromCloud?: boolean }).syncedFromCloud === true;
  const authoritativeCompanyId = String((row as { authoritativeCompanyId?: string }).authoritativeCompanyId || "").trim();
  const cloudAuthoritative =
    syncedFromCloud || syncPolicyRaw === "online" || authoritativeCompanyId.length > 0;
  const normalizedStorage =
    cloudAuthoritative && (storageOption === "firebase" || storageOption === "drive")
      ? storageOption
      : "local";
  return {
    ...(row as unknown as Company),
    id: row.id,
    name: typeof row.name === "string" ? row.name : row.id,
    storageOption: normalizedStorage as Company["storageOption"],
    syncedFromCloud,
    syncPolicy: (cloudAuthoritative && syncPolicyRaw === "online" ? "online" : "offline") as Company["syncPolicy"],
  };
}

/**
 * Registry + SQLite merge — EXE/static par `allCompaniesRegistry` kabhi cloud flags ke sath late aata hai;
 * host bridge `listLocalCompanies` se same list jaisa server runtime.
 */
export async function listShareableLocalCompaniesForHost(registry: Company[]): Promise<Company[]> {
  const byId = new Map<string, Company>();

  for (const c of registry) {
    if (!c?.id || c.isDeleted === true) continue;
    if (isLocalServerShareableCompany(c)) byId.set(c.id, c);
  }

  const sqliteRows = await listLocalCompanies();
  for (const row of sqliteRows) {
    if (localCompanyRowIsDeleted(row)) continue;
    const normalized = normalizeLocalCompanyRowForHost(row);
    if (!isLocalServerShareableCompany(normalized)) continue;
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, normalized);
      continue;
    }
    byId.set(row.id, { ...existing, ...normalized });
  }

  return Array.from(byId.values());
}

/** Single company — SQLite source of truth jab row maujood ho (online mirror registry se galat pass na ho). */
export async function isLocalCompanyHostShareable(
  companyId: string,
  registry: Company[],
  registryRow?: Company | null
): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;

  const sqliteRow = await getLocalCompanyById(cid);
  if (sqliteRow && !localCompanyRowIsDeleted(sqliteRow)) {
    return isLocalServerShareableCompany(normalizeLocalCompanyRowForHost(sqliteRow));
  }

  if (registryRow && isLocalServerShareableCompany(registryRow)) return true;
  const regHit = registry.find((c) => c?.id === cid);
  return Boolean(regHit && isLocalServerShareableCompany(regHit));
}

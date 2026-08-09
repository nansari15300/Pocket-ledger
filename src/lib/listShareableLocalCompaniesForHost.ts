"use client";

import type { Company } from "@/hooks/useCompany";
import { listLocalCompanies, localCompanyRowIsDeleted, getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";

/** SQLite row — actual storage flags preserve (online mirror ko local mat banao). */
export function normalizeLocalCompanyRowForHost(row: LocalCompanyDoc): Company {
  const storageOption = String((row as { storageOption?: string }).storageOption ?? "local").toLowerCase().trim();
  const syncPolicyRaw = String((row as { syncPolicy?: string }).syncPolicy ?? "").toLowerCase().trim();
  const syncedFromCloud = (row as { syncedFromCloud?: boolean }).syncedFromCloud === true;
  const authoritativeCompanyId = String((row as { authoritativeCompanyId?: string }).authoritativeCompanyId || "").trim();
  const cloudAuthoritative =
    syncedFromCloud ||
    syncPolicyRaw === "online" ||
    storageOption === "firebase" ||
    storageOption === "drive" ||
    authoritativeCompanyId.length > 0;
  // Demoted Online mirrors (storageOption flipped to local) still carry cloud markers — keep them Online-shaped
  // so `isLocalServerShareableCompany` rejects them from PL Shared companies.
  if (cloudAuthoritative) {
    return {
      ...(row as unknown as Company),
      id: row.id,
      name: typeof row.name === "string" ? row.name : row.id,
      storageOption: (storageOption === "drive" ? "drive" : "firebase") as Company["storageOption"],
      syncedFromCloud: true,
      syncPolicy: "online" as Company["syncPolicy"],
    };
  }
  return {
    ...(row as unknown as Company),
    id: row.id,
    name: typeof row.name === "string" ? row.name : row.id,
    storageOption: "local" as Company["storageOption"],
    syncedFromCloud: false,
    syncPolicy: "offline" as Company["syncPolicy"],
  };
}

/**
 * Registry + SQLite merge — EXE/static par `allCompaniesRegistry` kabhi cloud flags ke sath late aata hai;
 * host bridge `listLocalCompanies` se same list jaisa server runtime.
 */
export async function listShareableLocalCompaniesForHost(registry: Company[]): Promise<Company[]> {
  const byId = new Map<string, Company>();
  const cloudIds = new Set<string>();

  for (const c of registry) {
    if (!c?.id || c.isDeleted === true) continue;
    const id = String(c.id).trim();
    if (isCloudLinkedCompanyStorage(c)) {
      cloudIds.add(id);
      continue;
    }
    if (isLocalServerShareableCompany(c)) byId.set(id, c);
  }

  const sqliteRows = await listLocalCompanies();
  for (const row of sqliteRows) {
    if (localCompanyRowIsDeleted(row)) continue;
    const id = String(row.id || "").trim();
    if (!id) continue;
    // Registry me Firebase/Drive company hai to PL share list me SQLite demote mirror mat daalo.
    if (cloudIds.has(id)) continue;
    const normalized = normalizeLocalCompanyRowForHost(row);
    if (isCloudLinkedCompanyStorage(normalized)) {
      cloudIds.add(id);
      byId.delete(id);
      continue;
    }
    if (!isLocalServerShareableCompany(normalized)) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, normalized);
      continue;
    }
    byId.set(id, { ...existing, ...normalized });
  }

  return Array.from(byId.values()).filter((c) => !cloudIds.has(String(c.id || "").trim()));
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

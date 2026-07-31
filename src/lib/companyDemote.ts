"use client";

import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { moveCompanySqliteNamespace } from "@/lib/localSqlite";

/** Server doc missing / permission / network classification — local row me persist for UI. */
export type CompanyDemoteReason = "server_missing" | "permission_denied" | "unreachable";

/**
 * Firestore par company root na ho ya access lost: local mirror ko "Local Companies" bucket me rakho
 * taaki user data device par chalta rahe; dubara upload alag flow.
 * SQLite rows move online folder → local folder.
 */
export async function demoteCompanyToLocal(
  companyId: string,
  reason: CompanyDemoteReason
): Promise<boolean> {
  const existing = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!existing || existing.isDeleted === true) return false;
  const storage = String((existing as { storageOption?: string }).storageOption || "local").toLowerCase();
  if (storage === "local") return false;
  await moveCompanySqliteNamespace(companyId, "local");
  await upsertLocalCompany({
    ...existing,
    id: companyId,
    storageOption: "local",
    syncPolicy: "offline",
    syncedFromCloud: false,
    demotedFromOnlineAt: Date.now(),
    demoteReason: reason,
  } as Parameters<typeof upsertLocalCompany>[0]);
  return true;
}

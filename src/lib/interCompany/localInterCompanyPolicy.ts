"use client";

/**
 * Pure local-storage companies — Inter Company bina Firestore coordination ke (device SQLite).
 */
import type { Company } from "@/hooks/useCompany";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { isCloudBackedCompanyShape } from "@/lib/offlineFullWarmSync";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { apkEmbeddedSqliteFirstWritesPreferred } from "@/lib/apkOnlineFirestoreWritePolicy";
import { isLocalOnlyMode } from "@/lib/localMode";
import type { InterCompanyGroupDoc } from "@/lib/interCompany/interCompanyGroups";

/** Firebase / uploaded online — local IC transport mat use karo. */
export function isPureLocalInterCompanyCompanyFromShape(
  c: Pick<Company, "storageOption" | "authoritativeCompanyId" | "syncedFromCloud"> | null | undefined
): boolean {
  if (!c) return false;
  if (isCloudBackedCompanyShape(c as Company)) return false;
  return isOfflineCompanyStorage(c);
}

export async function isPureLocalInterCompanyCompany(companyId: string): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  try {
    const row = await getLocalCompanyById(cid, { includeDeleted: true });
    if (row) return isPureLocalInterCompanyCompanyFromShape(row as Company);
  } catch {
    /* optional registry read */
  }
  return false;
}

export async function isLocalToLocalInterCompanyPair(
  sourceCompanyId: string,
  targetCompanyId: string
): Promise<boolean> {
  const [sourceLocal, targetLocal] = await Promise.all([
    isPureLocalInterCompanyCompany(sourceCompanyId),
    isPureLocalInterCompanyCompany(targetCompanyId),
  ]);
  return sourceLocal && targetLocal;
}

/** IC voucher / party writes — SQLite + outbox (Firebase company path nahi). */
export async function interCompanyUsesLocalLedgerTransport(companyId: string): Promise<boolean> {
  if (apkEmbeddedSqliteFirstWritesPreferred()) return true;
  if (!isLocalOnlyMode()) return false;
  return isPureLocalInterCompanyCompany(companyId);
}

/** Device-only IC system — localStorage `local-…` id ya explicit visibility. */
export function isLocalDeviceInterCompanySystem(
  system: Pick<InterCompanyGroupDoc, "id" | "localOnly" | "visibility"> | null | undefined
): boolean {
  if (!system?.id) return false;
  if (system.localOnly === true) return true;
  if (String(system.id).startsWith("local-")) return true;
  return system.visibility === "local";
}

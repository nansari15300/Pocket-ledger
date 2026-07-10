"use client";

import { getActiveGate } from "@/lib/gates/gateStore";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";

import { isCompanyAllowedOnActiveServerGate } from "@/lib/plServerRemoteCompanyLogin";

/**
 * PlServer staff (bundled EXE/APK/iOS + local_server gate, ya Gate→Connect `pl_remote_client=1`):
 * User-side SQLite ledger mirror (online company jaisa) — Host canonical; offline local save + online sync.
 * Host PC (`isLocalAppServerHost`) is never thin staff.
 */
export function isPlServerThinStaffClient(): boolean {
  if (typeof window === "undefined") return false;
  if (isLocalAppServerHost()) return false;
  if (!shouldFetchPlServerAccessContext()) return false;
  if (getActiveGate().type === "local_server") return true;
  /** Gate→Connect staff (`pl_remote_client=1`) — access token load hone se pehle bhi legacy SQLite mirror mat. */
  if (isPlRemoteServerClientMode()) return true;
  return false;
}

export async function isPlServerThinStaffCompany(companyId: string): Promise<boolean> {
  if (!isPlServerThinStaffClient()) return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  if (isCompanyAllowedOnActiveServerGate(id)) return true;
  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    return Boolean(row && isServerGateCompany(row));
  } catch {
    return isCompanyAllowedOnActiveServerGate(id);
  }
}

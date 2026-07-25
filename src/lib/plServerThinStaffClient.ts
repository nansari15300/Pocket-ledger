"use client";

import { getActiveGate } from "@/lib/gates/gateStore";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { gatePointsAtRemotePlServerHost } from "@/lib/plGatePageOrigin";
import { isPlHubServerClientMode, isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isCanonicalServerBridgeRenderer } from "@/lib/hostBridgeWrite";

import { isCompanyAllowedOnActiveServerGate } from "@/lib/plServerRemoteCompanyLogin";

/**
 * PlServer staff (bundled EXE/APK/iOS + local_server gate, ya Gate→Connect `pl_remote_client=1`):
 * User-side SQLite ledger mirror (online company jaisa) — Host canonical; offline local save + online sync.
 *
 * Host shell (bridge / self-loopback) is never thin staff.
 * `npm run dev` on localhost WITH gate → LAN Host (e.g. 110.x:3001) IS thin staff.
 */
export function isPlServerThinStaffClient(): boolean {
  if (typeof window === "undefined") return false;
  if (isCanonicalServerBridgeRenderer()) return false;
  /** Hub relay client — same thin-staff ledger path, localhost par. */
  if (isPlHubServerClientMode()) return true;
  /** Gate→Connect staff (`pl_remote_client=1`) — access token load hone se pehle bhi legacy SQLite mirror mat. */
  if (isPlRemoteServerClientMode()) return true;

  const gate = getActiveGate();
  if (gate.type !== "local_server") return false;

  // Loopback Nextdev: only Host when gate points at self; remote Host URL → staff client.
  if (isLocalAppServerHost()) {
    return gatePointsAtRemotePlServerHost(gate.serverUrl);
  }

  // Other device (staff EXE/APK/phone) with local_server gate.
  return true;
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

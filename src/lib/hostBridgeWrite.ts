"use client";

import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { getElectronLocalServerApi } from "@/lib/electronLocalServer";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import type { UpsertCompanyBrowserOptions } from "@/lib/localCompanyDocMirror";
import { serializeCompanyDocForLocalDb } from "@/lib/localCompanyDocMirror";

declare global {
  interface Window {
    __plIsCanonicalServerBridge?: boolean;
  }
}

type PlElectronBridgeApi = {
  authoritativeCompanyDocUpsert: (payload: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string }>;
};

function getPlElectronBridgeApi(): PlElectronBridgeApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { plElectronBridge?: PlElectronBridgeApi }).plElectronBridge;
  return api?.authoritativeCompanyDocUpsert ? api : null;
}

export function isCanonicalServerBridgeRenderer(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__plIsCanonicalServerBridge === true) return true;
  try {
    return new URLSearchParams(window.location.search).get("pl_server_data_bridge") === "1";
  } catch {
    return false;
  }
}

export async function shouldCommitOnHostBridge(
  companyId: string,
  options?: UpsertCompanyBrowserOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (options?.notify === false) return false;
  if (isPlRemoteServerClientMode()) return false;
  if (isCanonicalServerBridgeRenderer()) return false;
  if (!isLocalAppServerHost()) return false;
  if (!getPlElectronBridgeApi()) return false;

  const api = getElectronLocalServerApi();
  if (!api) return false;
  let sharingActive = false;
  try {
    const status = await api.getStatus();
    sharingActive = status?.sharingActive === true;
  } catch {
    return false;
  }
  if (!sharingActive) return false;

  try {
    const row = await getLocalCompanyById(companyId, { includeDeleted: true });
    if (!row || !isLocalServerShareableCompany(row)) return false;
    if (isServerGateCompany(row)) return false;
  } catch {
    return false;
  }

  return true;
}

export async function invokeHostBridgeCompanyDocUpsert(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<void> {
  const bridge = getPlElectronBridgeApi();
  if (!bridge) throw new Error("bridge_ipc_unavailable");

  const payload = {
    companyId,
    collectionName,
    docId,
    data: serializeCompanyDocForLocalDb({ ...data, id: docId }),
    notify: options?.notify !== false,
    skipCloudSyncEnqueue: options?.skipCloudSyncEnqueue,
    skipPlanMutationGate: options?.skipPlanMutationGate,
    force: options?.force,
  };

  const result = await bridge.authoritativeCompanyDocUpsert(payload);
  if (!result?.ok) {
    throw new Error(result?.error || "bridge_upsert_failed");
  }
  const { markPlServerLocalWrite } = await import("@/lib/plServerClientMirrorPush");
  markPlServerLocalWrite(companyId);
}

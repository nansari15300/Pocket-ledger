"use client";

import type { GateRecord } from "@/lib/gates/gateTypes";
import { listGates, normalizeServerUrl } from "@/lib/gates/gateStore";
import {
  readPlServerGatePreviewContext,
  sharedCompaniesFromAccessPayload,
  type PlServerAccessContextPayload,
  getPlServerContextGateId,
  getPlServerSharedCompanies,
  clearPlServerAccessContext,
  plServerShareListAuthoritativeEmpty,
} from "@/lib/plServerAccessContext";
import {
  listLocalCompanies,
  removeLocalCompanyById,
  type LocalCompanyDoc,
} from "@/lib/localCompanyStore";
import { isServerGateCompany, isStrictLocalOnlyCompany } from "@/lib/companyStorageKind";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import { isCurrentUserOwnerOfCompanyRow } from "@/lib/companyOnlineIntegrity";
import {
  isLocalBackupRestoredCompanyRow,
  isProtectedOwnerLocalBackupCompany,
} from "@/lib/localBackupRestoreCompany";
import { isProtectedDriveLocalRegistryRow } from "@/lib/driveRestoredLocalCompany";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { matchPlServerSharedCompanyForLocalId } from "@/lib/plServerHostCompanyId";

function rowString(row: LocalCompanyDoc, key: string): string {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function collectPreviewCompanyIds(gateId: string): Set<string> {
  const preview = readPlServerGatePreviewContext(gateId);
  const ids = new Set<string>();
  for (const row of preview.companies) {
    const id = String(row.id || "").trim();
    if (id) ids.add(id);
  }
  for (const id of preview.allowedCompanyIds || []) {
    const s = String(id || "").trim();
    if (s) ids.add(s);
  }
  try {
    if (getPlServerContextGateId() === gateId) {
      for (const row of getPlServerSharedCompanies()) {
        const id = String(row.id || "").trim();
        if (id) ids.add(id);
      }
    }
  } catch {
    /* optional */
  }
  return ids;
}

function serverGateCount(): number {
  return listGates().filter((gate) => gate.type === "local_server").length;
}

function rowMatchesGate(row: LocalCompanyDoc, gate: GateRecord, previewIds: Set<string>): boolean {
  if (!isServerGateCompany(row)) return false;
  const id = String(row.id || "").trim();
  if (!id) return false;

  const targetGateId = String(gate.id || "").trim();
  const targetServerUrl = normalizeServerUrl(String(gate.serverUrl || ""));
  const rowGateId = rowString(row, "plServerGateId");
  const rowServerUrl = normalizeServerUrl(
    rowString(row, "plServerGateServerUrl") ||
      rowString(row, "plServerServerUrl") ||
      rowString(row, "localServerUrl")
  );

  if (targetGateId && rowGateId === targetGateId) return true;
  if (targetServerUrl && rowServerUrl && rowServerUrl === targetServerUrl) return true;
  if (previewIds.has(id)) return true;

  // Legacy rows were saved before gate metadata existed. If this is the only
  // local-server gate and no preview ids are cached, the safest user intent is
  // to purge all PLServer mirrored rows for this removed gate.
  if (!rowGateId && !rowServerUrl && previewIds.size === 0 && serverGateCount() <= 1) {
    return true;
  }
  return false;
}

/** Gate delete: preview + URL + gate id — orphan local-tab mirrored rows bhi. */
function rowMatchesGateForRemoval(row: LocalCompanyDoc, gate: GateRecord, previewIds: Set<string>): boolean {
  const id = String(row.id || "").trim();
  if (!id) return false;

  if (previewIds.has(id)) return true;

  const hostId = rowHostId(row);
  if (hostId && previewIds.has(hostId)) return true;

  const previewSummaries: PlServerSharedCompanySummary[] = [...previewIds].map((pid) => ({
    id: pid,
    name: pid,
    storageOption: "local" as const,
    ownerEmail: null,
  }));
  if (previewSummaries.length > 0 && matchPlServerSharedCompanyForLocalId(id, previewSummaries)) {
    return true;
  }

  const targetGateId = String(gate.id || "").trim();
  const targetServerUrl = normalizeServerUrl(String(gate.serverUrl || ""));
  const rowGateId = rowString(row, "plServerGateId");
  const rowServerUrl = normalizeServerUrl(
    rowString(row, "plServerGateServerUrl") ||
      rowString(row, "plServerServerUrl") ||
      rowString(row, "localServerUrl")
  );

  if (targetGateId && rowGateId === targetGateId) return true;
  if (targetServerUrl && rowServerUrl && rowServerUrl === targetServerUrl) return true;

  if (row.plServerShared === true && (rowGateId === targetGateId || rowServerUrl === targetServerUrl)) {
    return true;
  }

  if (targetServerUrl && rowServerUrl === targetServerUrl) {
    const so = String(row.storageOption ?? "").toLowerCase().trim();
    if (so === "local" && row.isOwned !== true && !String(row.ownerId ?? "").trim()) {
      return true;
    }
  }

  if (isServerGateCompany(row)) {
    return rowMatchesGate(row, gate, previewIds);
  }

  return false;
}

function latestCompanyIdsFromRows(rows: readonly PlServerSharedCompanySummary[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function rowHostId(row: LocalCompanyDoc): string {
  return rowString(row, "plServerHostCompanyId");
}

function rowIsInLatestServerList(row: LocalCompanyDoc, latestRows: readonly PlServerSharedCompanySummary[]): boolean {
  const id = String(row.id || "").trim();
  const hostId = rowHostId(row);
  if (hostId && latestRows.some((r) => String(r.id || "").trim() === hostId)) return true;
  if (id && latestRows.some((r) => String(r.id || "").trim() === id)) return true;
  if (id && matchPlServerSharedCompanyForLocalId(id, latestRows)) return true;
  return false;
}

async function clearPlServerMirrorFlagsOnLocalRow(
  row: LocalCompanyDoc,
  options?: { firebaseUid?: string | null }
): Promise<void> {
  const id = String(row.id || "").trim();
  if (!id) return;
  const { upsertLocalCompany } = await import("@/lib/localCompanyStore");
  await upsertLocalCompany({
    ...row,
    plServerShared: false,
    plServerGateId: "",
    plServerGateServerUrl: "",
    plServerHostCompanyId: "",
  } as LocalCompanyDoc);
  await clearRemovedPlServerCompanyCaches(id);
  void options;
}

/** Demoted Online (Firebase) row that was temporarily stamped as PL — restore Online, don't keep as Local. */
function looksLikeDemotedOnlineCompany(
  row: LocalCompanyDoc,
  user: { uid: string; email: string | null }
): boolean {
  if (isCloudLinkedCompanyStorage(row as { storageOption?: string; syncedFromCloud?: boolean })) {
    return true;
  }
  if (!isCurrentUserOwnerOfCompanyRow(row, user)) return false;
  if (shouldPreserveDeviceLocalAfterGateRemoval(row, user)) return false;
  const hadPl =
    row.plServerShared === true ||
    Boolean(rowString(row, "plServerGateId")) ||
    Boolean(rowString(row, "plServerHostCompanyId")) ||
    Boolean(
      normalizeServerUrl(
        rowString(row, "plServerGateServerUrl") ||
          rowString(row, "plServerServerUrl") ||
          rowString(row, "localServerUrl")
      )
    );
  if (!hadPl) return false;
  // Owned + PL stamps but not a protected device-local backup → was Online demoted by share-list overlap.
  return true;
}

async function healDemotedOnlineCompanyAfterPlDetach(row: LocalCompanyDoc): Promise<void> {
  const id = String(row.id || "").trim();
  if (!id) return;
  const { upsertLocalCompany } = await import("@/lib/localCompanyStore");
  const so = String(row.storageOption ?? "").toLowerCase().trim();
  await upsertLocalCompany({
    ...row,
    plServerShared: false,
    plServerGateId: "",
    plServerGateServerUrl: "",
    plServerHostCompanyId: "",
    storageOption: so === "drive" ? "drive" : "firebase",
    syncedFromCloud: true,
    syncPolicy: "online",
  } as LocalCompanyDoc);
  await clearRemovedPlServerCompanyCaches(id);
}

async function removeOrDetachPlMirrorRow(
  row: LocalCompanyDoc,
  user: { uid: string; email: string | null },
  options?: { firebaseUid?: string | null }
): Promise<"healed" | "preserved" | "deleted"> {
  const id = String(row.id || "").trim();
  if (!id) return "deleted";
  if (looksLikeDemotedOnlineCompany(row, user)) {
    await healDemotedOnlineCompanyAfterPlDetach(row);
    return "healed";
  }
  if (shouldPreserveDeviceLocalAfterGateRemoval(row, user)) {
    await clearPlServerMirrorFlagsOnLocalRow(row, { firebaseUid: options?.firebaseUid ?? null });
    return "preserved";
  }
  await removeLocalCompanyById(id, { firebaseUid: options?.firebaseUid ?? null });
  await clearRemovedPlServerCompanyCaches(id);
  return "deleted";
}

function gateRemovalUser(options?: { firebaseUid?: string | null; firebaseEmail?: string | null }): {
  uid: string;
  email: string | null;
} {
  return { uid: String(options?.firebaseUid ?? "").trim(), email: options?.firebaseEmail ?? null };
}

/** Gate hataane par sirf asli device-local backup / localOnly row rakho — server mirror SQLite se hatao. */
function shouldPreserveDeviceLocalAfterGateRemoval(
  row: LocalCompanyDoc,
  user: { uid: string; email: string | null }
): boolean {
  if (!isCurrentUserOwnerOfCompanyRow(row, user)) return false;
  if (isProtectedOwnerLocalBackupCompany(row as Record<string, unknown>, user)) return true;
  if (isProtectedDriveLocalRegistryRow(row as Record<string, unknown>, user)) return true;
  if (isLocalBackupRestoredCompanyRow(row as Record<string, unknown>)) return true;
  if (row.localOnly === true || isStrictLocalOnlyCompany(row)) return true;
  return false;
}

async function clearRemovedPlServerCompanyCaches(companyId: string): Promise<void> {
  try {
    const { clearPlServerDisplayCacheCompany } = await import("@/lib/plServerDisplayCache");
    clearPlServerDisplayCacheCompany(companyId);
  } catch {
    /* optional cache */
  }
  try {
    const { clearCachedCompanyDelta } = await import("@/lib/companyDeltaCache");
    await clearCachedCompanyDelta(companyId);
  } catch {
    /* optional cache */
  }
}

/**
 * Successful server context is authoritative for that same gate URL.
 * If a previously mirrored PLServer company from this gate is absent now, purge it from this client SQLite.
 */
export async function pruneLocalServerGateCompaniesToLatest(
  gate: GateRecord,
  latestRows: readonly PlServerSharedCompanySummary[],
  options?: { firebaseUid?: string | null }
): Promise<{ removedIds: string[]; skipped: boolean }> {
  if (!gate || gate.type !== "local_server") return { removedIds: [], skipped: true };
  const latestIds = latestCompanyIdsFromRows(latestRows);
  const authoritativeEmpty = plServerShareListAuthoritativeEmpty(gate.id);
  // Empty latest list: sirf tab purge karo jab gate Test/Connect ne explicitly `companies: []` save kiya ho.
  if (latestIds.size === 0 && !authoritativeEmpty) return { removedIds: [], skipped: true };

  const user = gateRemovalUser(options);
  const rows = await listLocalCompanies({ includeDeleted: true });
  const removedIds: string[] = [];
  for (const row of rows) {
    if (!isServerGateCompany(row)) continue;
    if (!rowMatchesGate(row, gate, latestIds)) continue;
    if (rowIsInLatestServerList(row, latestRows)) continue;
    const id = String(row.id || "").trim();
    if (!id || removedIds.includes(id)) continue;
    const onlineMirror =
      isCloudLinkedCompanyStorage(row as { storageOption?: string; syncedFromCloud?: boolean }) ||
      (row as { syncedFromCloud?: boolean }).syncedFromCloud === true;
    if (onlineMirror || looksLikeDemotedOnlineCompany(row, user)) {
      await healDemotedOnlineCompanyAfterPlDetach(row);
      removedIds.push(id);
      continue;
    }
    if (shouldPreserveDeviceLocalAfterGateRemoval(row, user)) {
      await clearPlServerMirrorFlagsOnLocalRow(row, options);
      removedIds.push(id);
      continue;
    }
    await removeLocalCompanyById(id, { firebaseUid: options?.firebaseUid ?? null });
    await clearRemovedPlServerCompanyCaches(id);
    removedIds.push(id);
  }
  return { removedIds, skipped: false };
}

export async function pruneLocalServerGateCompaniesFromAccessPayload(
  gate: GateRecord,
  payload: PlServerAccessContextPayload,
  options?: { firebaseUid?: string | null }
): Promise<{ removedIds: string[]; skipped: boolean }> {
  return pruneLocalServerGateCompaniesToLatest(gate, sharedCompaniesFromAccessPayload(payload), options);
}

export async function removeLocalServerGateCompanies(
  gate: GateRecord,
  options?: { firebaseUid?: string | null; firebaseEmail?: string | null }
): Promise<{ removedIds: string[] }> {
  if (!gate || gate.type !== "local_server") return { removedIds: [] };
  const user = gateRemovalUser(options);
  const previewIds = collectPreviewCompanyIds(gate.id);
  const rows = await listLocalCompanies({ includeDeleted: true });
  const removedIds: string[] = [];
  for (const row of rows) {
    if (!rowMatchesGateForRemoval(row, gate, previewIds)) continue;
    const id = String(row.id || "").trim();
    if (!id || removedIds.includes(id)) continue;
    await removeOrDetachPlMirrorRow(row, user, { firebaseUid: options?.firebaseUid ?? null });
    removedIds.push(id);
  }
  return { removedIds };
}

/** Gate remove ke baad access context + selected company (agar mirrored thi). */
export async function clearPlServerStaffClientStateForCompanies(
  removedIds: string[],
  options?: { firebaseUid?: string | null }
): Promise<void> {
  const ids = [...new Set(removedIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (!ids.length) return;
  const { clearLocalAuth } = await import("@/lib/localApiClient");
  const { clearOfflineUnlockSession, clearAllOfflineUnlockSessionsForCompany } = await import(
    "@/lib/offlineCompanyUnlockRemember"
  );
  const { clearPlServerCompanyTransportHint } = await import("@/lib/plServerClientDeltaSync");
  for (const id of ids) {
    clearLocalAuth(id);
    clearOfflineUnlockSession(options?.firebaseUid ?? undefined, id);
    clearAllOfflineUnlockSessionsForCompany(id);
    clearPlServerCompanyTransportHint(id);
  }
}

export async function finalizeLocalServerGateRemoval(
  gate: GateRecord,
  removedIds: string[],
  options?: { clearSelectedCompanyId?: (id: string | null) => void; firebaseUid?: string | null }
): Promise<void> {
  if (getPlServerContextGateId() === gate.id) {
    clearPlServerAccessContext();
  }
  await clearPlServerStaffClientStateForCompanies(removedIds, { firebaseUid: options?.firebaseUid });
  if (removedIds.length === 0 || !options?.clearSelectedCompanyId) return;
  try {
    const { readSelectedCompanyId } = await import("@/lib/selectedCompanyStorage");
    const selected = readSelectedCompanyId()?.trim();
    if (selected && removedIds.includes(selected)) {
      options.clearSelectedCompanyId(null);
    }
  } catch {
    /* optional */
  }
  try {
    const { clearBrowserDbCache } = await import("@/lib/localSqlite");
    clearBrowserDbCache();
  } catch {
    /* optional */
  }
}

/** Saare server gates hata diye par SQLite me mirrored rows reh gayi hon — ek baar saaf karo. */
export async function purgeOrphanPlServerMirrorCompanies(
  options?: { firebaseUid?: string | null; firebaseEmail?: string | null }
): Promise<{ removedIds: string[] }> {
  const serverGates = listGates().filter((gate) => gate.type === "local_server");
  if (serverGates.length > 0) return { removedIds: [] };

  const user = gateRemovalUser(options);
  const rows = await listLocalCompanies({ includeDeleted: true });
  const removedIds: string[] = [];
  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id || removedIds.includes(id)) continue;

    const rowServerUrl = normalizeServerUrl(
      rowString(row, "plServerGateServerUrl") ||
        rowString(row, "plServerServerUrl") ||
        rowString(row, "localServerUrl")
    );
    const hasServerMirrorMeta =
      row.plServerShared === true ||
      Boolean(rowString(row, "plServerGateId")) ||
      Boolean(rowString(row, "plServerHostCompanyId")) ||
      Boolean(rowServerUrl);

    if (!hasServerMirrorMeta) continue;
    await removeOrDetachPlMirrorRow(row, user, { firebaseUid: options?.firebaseUid ?? null });
    removedIds.push(id);
  }
  if (removedIds.length > 0) {
    clearPlServerAccessContext();
  }
  return { removedIds };
}

"use client";

import type { UpsertCompanyBrowserOptions } from "@/lib/localCompanyDocMirror";
import { serializeCompanyDocForLocalDb } from "@/lib/localCompanyDocMirror";
import { openPendingAuthoritativeDb } from "@/lib/plServerAuthoritativePendingDb";
import {
  PL_SERVER_AUTHORITATIVE_PENDING_SCHEMA_VERSION,
  PENDING_AUTHORITATIVE_COMPANY_DOC_STORE,
  pendingAuthoritativeCoalesceKey,
  emitAuthoritativePendingQueueChanged,
  type PendingAuthoritativeCompanyDocWrite,
  type PendingAuthoritativeWriteErrorClass,
  type PendingAuthoritativeWriteState,
} from "@/lib/plServerAuthoritativePendingTypes";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isCanonicalServerBridgeRenderer } from "@/lib/hostBridgeWrite";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import {
  shouldFetchPlServerAccessContext,
  isPlServerSharedCompanyRow,
} from "@/lib/plServerAccessContext";
import { resolvePlServerMirrorTransport } from "@/lib/plServerClientMirrorPush";
import { PlServerAuthoritativeWriteError } from "@/lib/plServerClientAuthoritativeWrite";

export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 300_000;
export const MAX_AUTO_RETRIES = 12;
export const SEND_STALE_MS = 120_000;

function newQueueItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `paq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function sha256Hex(value: string): Promise<string> {
  const { computeSha256HexFromStringUtf8 } = await import("@/lib/security/sha256Hex");
  return computeSha256HexFromStringUtf8(value);
}

async function accessTokenFingerprint(token: string): Promise<string> {
  const hash = await sha256Hex(String(token || "").trim());
  return hash.slice(0, 16);
}

async function isLocalAuthoritativeHostForCompany(companyId: string): Promise<boolean> {
  if (!isLocalAppServerHost()) return false;
  if (typeof window === "undefined") return false;
  const bridge = (window as unknown as { plElectronBridge?: { authoritativeCompanyDocUpsert?: unknown } })
    .plElectronBridge;
  if (!bridge?.authoritativeCompanyDocUpsert) return false;
  try {
    const row = await getLocalCompanyById(companyId, { includeDeleted: true });
    return Boolean(row && isLocalServerShareableCompany(row) && !isServerGateCompany(row));
  } catch {
    return false;
  }
}

/** Offline pending eligibility — same gate rules as M2 route, without requiring online. */
export async function isAuthoritativeLanClientWriteEligible(
  companyId: string,
  options?: UpsertCompanyBrowserOptions,
  ctx?: { simulateLanClient?: boolean }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (options?.notify === false) return false;
  if (isPlRemoteServerClientMode()) return false;
  if (isCanonicalServerBridgeRenderer()) return false;
  if (!ctx?.simulateLanClient && (await isLocalAuthoritativeHostForCompany(companyId))) return false;
  if (!shouldFetchPlServerAccessContext()) return false;

  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport) return false;
  if (!transport.gateAllowed && !transport.unlockedLocally) return false;

  const id = String(companyId || "").trim();
  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    if (row && isServerGateCompany(row)) return false;
    if (row && isLocalServerShareableCompany(row)) return true;
  } catch {
    /* fall through */
  }

  return isPlServerSharedCompanyRow({ id }, transport.gate.id);
}

function canonicalPayloadJson(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): string {
  const serialized = serializeCompanyDocForLocalDb({ ...data, id: docId });
  return JSON.stringify({
    companyId,
    collectionName,
    docId,
    payload: serialized,
  });
}

function idbIndexGet<T>(index: IDBIndex, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const req = index.get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
  });
}

function idbGetAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
  });
}

function idbPut(store: IDBObjectStore, value: PendingAuthoritativeCompanyDocWrite): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

function idbDelete(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

async function withPendingStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openPendingAuthoritativeDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_AUTHORITATIVE_COMPANY_DOC_STORE, mode);
    const store = tx.objectStore(PENDING_AUTHORITATIVE_COMPANY_DOC_STORE);
    fn(store)
      .then(resolve)
      .catch(reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function enqueuePendingAuthoritativeCompanyDocWrite(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<PendingAuthoritativeCompanyDocWrite> {
  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport) {
    throw new PlServerAuthoritativeWriteError("authoritative_pending_transport_unavailable");
  }

  const coalesceKey = pendingAuthoritativeCoalesceKey(companyId, collectionName, docId);
  const payload = serializeCompanyDocForLocalDb({ ...data, id: docId }) as Record<string, unknown>;
  const payloadHash = await sha256Hex(canonicalPayloadJson(companyId, collectionName, docId, data));
  const tokenFp = await accessTokenFingerprint(transport.accessToken);
  const now = Date.now();

  const row = await withPendingStore("readwrite", async (store) => {
    const index = store.index("byCoalesceKey");
    const existing = await idbIndexGet<PendingAuthoritativeCompanyDocWrite>(index, coalesceKey);

    const upsertOptions = {
      notify: options?.notify !== false,
      skipCloudSyncEnqueue: options?.skipCloudSyncEnqueue,
      skipPlanMutationGate: options?.skipPlanMutationGate,
      force: options?.force,
    };

    const next: PendingAuthoritativeCompanyDocWrite = existing
      ? {
          ...existing,
          schemaVersion: PL_SERVER_AUTHORITATIVE_PENDING_SCHEMA_VERSION,
          payload,
          upsertOptions,
          gateId: transport.gate.id,
          gateServerUrl: transport.baseUrl,
          accessTokenFingerprint: tokenFp,
          state: "queued",
          updatedAt: now,
          nextAttemptAt: now,
          inFlightSince: null,
          lastError: null,
          lastHttpStatus: null,
          lastErrorClass: null,
          payloadHash,
          retryCount: existing.payloadHash === payloadHash ? existing.retryCount : 0,
        }
      : {
          schemaVersion: PL_SERVER_AUTHORITATIVE_PENDING_SCHEMA_VERSION,
          queueItemId: newQueueItemId(),
          coalesceKey,
          companyId,
          collectionName,
          docId,
          payload,
          upsertOptions,
          gateId: transport.gate.id,
          gateServerUrl: transport.baseUrl,
          accessTokenFingerprint: tokenFp,
          state: "queued",
          createdAt: now,
          updatedAt: now,
          retryCount: 0,
          lastAttemptAt: null,
          nextAttemptAt: now,
          inFlightSince: null,
          lastError: null,
          lastHttpStatus: null,
          lastErrorClass: null,
          clientMutationId: newQueueItemId(),
          payloadHash,
        };

    await idbPut(store, next);
    return next;
  });

  emitAuthoritativePendingQueueChanged();
  return row;
}

export async function countPendingAuthoritativeCompanyDocWrites(companyId?: string): Promise<number> {
  const rows = await listPendingAuthoritativeCompanyDocWrites();
  const active = rows.filter((r) => r.state !== "failed_permanent");
  if (!companyId) return active.length;
  const id = String(companyId || "").trim();
  return active.filter((r) => r.companyId === id).length;
}

export async function listPendingAuthoritativeCompanyDocWrites(): Promise<PendingAuthoritativeCompanyDocWrite[]> {
  return withPendingStore("readonly", async (store) => idbGetAll<PendingAuthoritativeCompanyDocWrite>(store));
}

function idbGetByKey<T>(store: IDBObjectStore, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
  });
}

export async function getPendingAuthoritativeWriteByCoalesceKey(
  companyId: string,
  collectionName: string,
  docId: string
): Promise<PendingAuthoritativeCompanyDocWrite | null> {
  const coalesceKey = pendingAuthoritativeCoalesceKey(companyId, collectionName, docId);
  return withPendingStore("readonly", async (store) => {
    const index = store.index("byCoalesceKey");
    return idbIndexGet(index, coalesceKey);
  });
}

export async function removePendingAuthoritativeCompanyDocWrite(queueItemId: string): Promise<void> {
  await withPendingStore("readwrite", async (store) => {
    await idbDelete(store, queueItemId);
  });
  emitAuthoritativePendingQueueChanged();
}

export async function clearAllPendingAuthoritativeCompanyDocWrites(): Promise<number> {
  const rows = await listPendingAuthoritativeCompanyDocWrites();
  await withPendingStore("readwrite", async (store) => {
    for (const row of rows) {
      await idbDelete(store, row.queueItemId);
    }
  });
  emitAuthoritativePendingQueueChanged();
  return rows.length;
}

export async function updatePendingAuthoritativeCompanyDocWrite(
  row: PendingAuthoritativeCompanyDocWrite
): Promise<void> {
  await withPendingStore("readwrite", async (store) => {
    await idbPut(store, { ...row, updatedAt: Date.now() });
  });
  emitAuthoritativePendingQueueChanged();
}

export function classifyAuthoritativeWriteFailure(error: unknown): PendingAuthoritativeWriteErrorClass {
  const msg = String(
    error instanceof PlServerAuthoritativeWriteError
      ? error.message
      : error instanceof Error
        ? error.message
        : error
  ).toLowerCase();

  if (
    msg.includes("invalid_or_missing_token") ||
    msg.includes("company_not_allowed") ||
    msg.includes("company_not_allowed_for_token") ||
    msg.includes("403") ||
    msg.includes("auth")
  ) {
    return "auth";
  }
  if (msg.includes("mirror_protocol") || msg.includes("protocol_mismatch")) {
    return "protocol";
  }
  if (
    msg.includes("503") ||
    msg.includes("authoritative_upsert_unavailable") ||
    msg.includes("bridge_missing") ||
    msg.includes("host_unavailable")
  ) {
    return "host_unavailable";
  }
  if (
    msg.includes("missing_fields") ||
    msg.includes("400") ||
    msg.includes("rejected") ||
    msg.includes("authoritative_upsert_rejected")
  ) {
    return "rejected";
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("failed to fetch") ||
    msg.includes("econnrefused") ||
    msg.includes("timeout") ||
    msg.includes("http 0")
  ) {
    return "network";
  }
  return "unknown";
}

export function isAuthoritativeWriteFailureRetryable(errorClass: PendingAuthoritativeWriteErrorClass): boolean {
  return (
    errorClass === "network" ||
    errorClass === "host_unavailable" ||
    errorClass === "unknown"
  );
}

export function computeNextRetryAttemptAt(retryCount: number): number {
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, retryCount));
  const jitter = Math.floor(Math.random() * 1000);
  return Date.now() + exp + jitter;
}

export async function recoverStalePendingAuthoritativeSends(): Promise<number> {
  const now = Date.now();
  let recovered = 0;
  const rows = await listPendingAuthoritativeCompanyDocWrites();
  for (const row of rows) {
    if (row.state !== "sending") continue;
    if (row.inFlightSince != null && now - row.inFlightSince < SEND_STALE_MS) continue;
    await updatePendingAuthoritativeCompanyDocWrite({
      ...row,
      state: "retry_scheduled",
      inFlightSince: null,
      nextAttemptAt: now,
      lastError: row.lastError ?? "send_stale_recovery",
      lastErrorClass: row.lastErrorClass ?? "unknown",
    });
    recovered += 1;
  }
  return recovered;
}

export async function listDuePendingAuthoritativeWrites(): Promise<PendingAuthoritativeCompanyDocWrite[]> {
  const now = Date.now();
  const rows = await listPendingAuthoritativeCompanyDocWrites();
  return rows
    .filter(
      (r) =>
        (r.state === "queued" || r.state === "retry_scheduled") &&
        (r.nextAttemptAt == null || r.nextAttemptAt <= now)
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markPendingAuthoritativeWriteState(
  row: PendingAuthoritativeCompanyDocWrite,
  state: PendingAuthoritativeWriteState,
  patch: Partial<PendingAuthoritativeCompanyDocWrite> = {}
): Promise<PendingAuthoritativeCompanyDocWrite> {
  const next = { ...row, state, updatedAt: Date.now(), ...patch };
  await updatePendingAuthoritativeCompanyDocWrite(next);
  return next;
}

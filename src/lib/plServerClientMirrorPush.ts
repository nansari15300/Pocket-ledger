"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { normalizeServerUrl, getActiveGate } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";
import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { getLocalAuthToken } from "@/lib/localApiClient";
import { outboxJsonParse, outboxJsonStringify } from "@/lib/localVoucherOutbox";
import { isCompanyAllowedOnActiveServerGate } from "@/lib/plServerRemoteCompanyLogin";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import {
  evaluateMirrorProtocol,
  logMirrorProtocolEvaluation,
  PL_MIRROR_PROTOCOL_VERSION,
} from "@/lib/plMirrorProtocol";
import { livePullDevLog } from "@/lib/plServerLivePullDevLog";

const PUSH_DEBOUNCE_MS = 400;
const PUSH_RETRY_MS = 4_000;

type PlMirrorPushRetryReason =
  | "partial_write"
  | "push_rejected"
  | "network"
  | "invalid_json"
  | "missing_ack"
  | "http_error"
  | "bridge_missing"
  | "protocol_mismatch";
/** Client push ke turant baad poll pull skip — stale server snapshot local edit overwrite na kare. */
export const PL_SERVER_PULL_PAUSE_AFTER_LOCAL_MS = 5_000;
const pendingByKey = new Map<string, ReturnType<typeof setTimeout>>();
const pushRetryByKey = new Map<string, ReturnType<typeof setTimeout>>();
const queuedDocs = new Map<string, Record<string, unknown>>();
const lastLocalWriteMsByCompany = new Map<string, number>();
const pullGenerationByCompany = new Map<string, number>();

function bumpPlServerPullGeneration(companyId: string): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  pullGenerationByCompany.set(id, (pullGenerationByCompany.get(id) ?? 0) + 1);
}

export function getPlServerPullGeneration(companyId: string): number {
  const id = String(companyId || "").trim();
  if (!id) return 0;
  return pullGenerationByCompany.get(id) ?? 0;
}

/** In-flight mirror pull stale ho gaya? (local write / push ne generation badha di) */
export function isPlServerPullGenerationStale(companyId: string, startGeneration: number): boolean {
  const id = String(companyId || "").trim();
  if (!id) return false;
  return getPlServerPullGeneration(id) !== startGeneration;
}

export function isPlServerMirrorDocPushPending(
  companyId: string,
  collection: string,
  docId: string
): boolean {
  return queuedDocs.has(pushKey(String(companyId || "").trim(), String(collection || "").trim(), String(docId || "").trim()));
}

/** User SQLite write — generation + pull pause (sirf ek baar per save). */
export function markPlServerLocalWrite(companyId: string): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  lastLocalWriteMsByCompany.set(id, Date.now());
  bumpPlServerPullGeneration(id);
}

/** Push success: pause extend karo, generation mat badhao (in-flight pull cancel na ho). */
function extendPlServerLivePullPause(companyId: string): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  lastLocalWriteMsByCompany.set(id, Date.now());
}

export function isPlServerLivePullPaused(companyId: string): boolean {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const t = lastLocalWriteMsByCompany.get(id);
  if (!t) return false;
  return Date.now() - t < PL_SERVER_PULL_PAUSE_AFTER_LOCAL_MS;
}

function pushKey(companyId: string, collection: string, docId: string): string {
  return `${companyId}::${collection}::${docId}`;
}

/** Firestore Timestamp / Date → JSON-safe mirror payload (server SQLite revive). */
function serializeMirrorDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return outboxJsonParse(outboxJsonStringify(doc));
}

export type PlServerMirrorTransport = {
  baseUrl: string;
  accessToken: string;
  gate: GateRecord;
  gateAllowed: boolean;
  unlockedLocally: boolean;
};

/** Push + live pull dono ke liye same gate token / allow rules. */
export function resolvePlServerMirrorTransport(companyId: string): PlServerMirrorTransport | null {
  const id = String(companyId || "").trim();
  if (!id) return null;
  const gate = getActiveGate();
  if (gate.type !== "local_server" || !String(gate.serverUrl || "").trim()) return null;
  const accessToken = resolveLocalServerGateAccessToken(gate);
  if (!accessToken) return null;
  const baseUrl = normalizeServerUrl(gate.serverUrl || "");
  if (!baseUrl) return null;
  return {
    baseUrl,
    accessToken,
    gate,
    gateAllowed: isCompanyAllowedOnActiveServerGate(id, gate),
    unlockedLocally: Boolean(getLocalAuthToken(id)),
  };
}

function parseMirrorPushResponseOk(
  status: number,
  body: string,
  sentCount: number
): { ok: boolean; applied?: number; error?: string; protocolReject?: boolean } {
  if (!status || status >= 400) {
    const errBody = String(body || "").trim();
    if (status === 409 && errBody.includes("mirror_protocol_major_mismatch")) {
      return { ok: false, error: "mirror_protocol_major_mismatch", protocolReject: true };
    }
    return { ok: false, error: body || `HTTP ${status || 0}` };
  }
  const trimmed = String(body || "").trim();
  if (!trimmed) {
    if (sentCount > 0) {
      return { ok: false, error: "push_response_missing_ack" };
    }
    return { ok: true };
  }
  try {
    const payload = JSON.parse(trimmed) as {
      ok?: boolean;
      error?: string;
      applied?: number;
      skipped?: number;
      received?: number;
      count?: number;
      mirrorProtocol?: number;
      serverBuild?: string;
      message?: string;
    };
    const protoEval = evaluateMirrorProtocol(PL_MIRROR_PROTOCOL_VERSION, payload.mirrorProtocol);
    logMirrorProtocolEvaluation(protoEval, "push_response");
    if (protoEval.action === "reject") {
      return {
        ok: false,
        error: protoEval.code,
        protocolReject: true,
      };
    }
    if (payload && typeof payload === "object" && payload.ok === false) {
      const err = String(payload.error || "push_rejected");
      if (err.toLowerCase().includes("mirror_protocol_major_mismatch")) {
        return { ok: false, error: err, protocolReject: true };
      }
      if (err.toLowerCase().includes("bridge_missing")) {
        return { ok: false, error: "bridge_missing" };
      }
      return { ok: false, error: err };
    }
    const applied =
      typeof payload.applied === "number"
        ? payload.applied
        : typeof payload.count === "number"
          ? payload.count
          : undefined;
    const received =
      typeof payload.received === "number" ? payload.received : sentCount > 0 ? sentCount : undefined;
    const skipped = typeof payload.skipped === "number" ? payload.skipped : 0;
    if (received != null && received > 0) {
      const accounted = (applied ?? 0) + skipped;
      if (accounted < received) {
        return {
          ok: false,
          applied,
          error: `push_partial_applied (${accounted}/${received})`,
        };
      }
    }
    if (sentCount > 0 && applied != null && applied < sentCount && skipped === 0) {
      return {
        ok: false,
        applied,
        error: `push_applied_lt_sent (${applied}/${sentCount})`,
      };
    }
    return { ok: true, applied };
  } catch {
    if (sentCount > 0) {
      return { ok: false, error: "push_response_not_json" };
    }
    return { ok: true };
  }
}

async function shouldPushPlServerMirrorDoc(companyId: string): Promise<boolean> {
  if (typeof window === "undefined" || !shouldFetchPlServerAccessContext()) return false;
  if (isPlRemoteServerClientMode()) return false;

  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport) return false;
  if (!transport.gateAllowed && !transport.unlockedLocally) return false;

  const id = String(companyId || "").trim();
  try {
    const doc = await getLocalCompanyById(id, { includeDeleted: true });
    if (doc && isServerGateCompany(doc)) return true;
  } catch {
    /* ignore */
  }
  return transport.gateAllowed;
}

function classifyPushRetryReason(
  error: string | undefined,
  status: number,
  isNetwork: boolean
): PlMirrorPushRetryReason {
  if (isNetwork) return "network";
  const e = String(error || "").toLowerCase();
  if (e.includes("bridge_missing")) return "bridge_missing";
  if (e.includes("partial") || e.includes("applied_lt")) return "partial_write";
  if (e.includes("not_json")) return "invalid_json";
  if (e.includes("missing_ack")) return "missing_ack";
  if (e.includes("mirror_protocol_major_mismatch") || e.includes("protocol_mismatch")) {
    return "protocol_mismatch";
  }
  if (status >= 400) return "http_error";
  return "push_rejected";
}

function schedulePlServerMirrorPushRetry(
  companyId: string,
  collection: string,
  reason: PlMirrorPushRetryReason
): void {
  const debounceKey = `${String(companyId || "").trim()}::${String(collection || "").trim()}`;
  if (!debounceKey || debounceKey === "::") return;
  if (pushRetryByKey.has(debounceKey)) return;
  console.warn("[plServerClientMirrorPush] push retry scheduled", {
    companyId,
    collection,
    retry_reason: reason,
  });
  pushRetryByKey.set(
    debounceKey,
    setTimeout(() => {
      pushRetryByKey.delete(debounceKey);
      void flushPlServerMirrorPushQueue(companyId, collection);
    }, PUSH_RETRY_MS)
  );
}

async function flushPlServerMirrorPushQueue(companyId: string, collection: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  if (!cid || !col || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return;
  if (!(await shouldPushPlServerMirrorDoc(cid))) return;

  const transport = resolvePlServerMirrorTransport(cid);
  if (!transport) return;

  const docs: Record<string, unknown>[] = [];
  const keysToFlush: string[] = [];
  for (const [key, doc] of queuedDocs.entries()) {
    if (!key.startsWith(`${cid}::${col}::`)) continue;
    docs.push(doc);
    keysToFlush.push(key);
  }
  if (!docs.length) return;

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_mirror_push`;
  try {
    const { status, body } = await gateHttpPost(url, transport.accessToken, {
      companyId: cid,
      collection: col,
      docs,
      mirrorProtocol: PL_MIRROR_PROTOCOL_VERSION,
    });
    const parsed = parseMirrorPushResponseOk(status, body, docs.length);
    if (!parsed.ok) {
      const retryReason = classifyPushRetryReason(parsed.error, status, false);
      console.warn("[plServerClientMirrorPush] push failed", {
        status,
        error: parsed.error || body,
        sent: docs.length,
        applied: parsed.applied,
        retry_reason: parsed.protocolReject ? "protocol_mismatch" : retryReason,
      });
      if (!parsed.protocolReject) {
        schedulePlServerMirrorPushRetry(cid, col, retryReason);
      }
      return;
    }
    for (const key of keysToFlush) queuedDocs.delete(key);
    extendPlServerLivePullPause(cid);
  } catch (e) {
    console.warn("[plServerClientMirrorPush] push error", {
      error: e,
      retry_reason: "network",
    });
    schedulePlServerMirrorPushRetry(cid, col, "network");
  }
}

/** SQLite write ke baad server PC ko turant update — sirf P2P gate + unlocked company. */
export async function maybeQueuePlServerMirrorAfterDocWrite(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): Promise<void> {
  if (!(await shouldPushPlServerMirrorDoc(companyId))) return;
  markPlServerLocalWrite(companyId);
  queuePlServerMirrorDocPush(companyId, collection, docId, doc, { skipLocalWriteMark: true });
}

/** P2P client: local SQLite write → server PC SQLite (owner + doosre clients poll se dekhenge). */
export function queuePlServerMirrorDocPush(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>,
  options?: { skipLocalWriteMark?: boolean }
): void {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !col || !id) return;
  if (!options?.skipLocalWriteMark) markPlServerLocalWrite(cid);
  queuedDocs.set(pushKey(cid, col, id), serializeMirrorDoc({ ...doc, id }));
  const debounceKey = `${cid}::${col}`;
  const prev = pendingByKey.get(debounceKey);
  if (prev) clearTimeout(prev);
  pendingByKey.set(
    debounceKey,
    setTimeout(() => {
      pendingByKey.delete(debounceKey);
      void flushPlServerMirrorPushQueue(cid, col as CompanyBackupCollection);
    }, PUSH_DEBOUNCE_MS)
  );
}

/** Voucher save / patch ke baad — `saveVoucher` SQLite path se call karo. */
export function queuePlServerVoucherMirrorPush(
  companyId: string,
  voucherId: string,
  doc: Record<string, unknown>
): void {
  queuePlServerMirrorDocPush(companyId, "vouchers", voucherId, doc);
}

export async function syncPlServerSharedCompanyLive(
  companyId: string
): Promise<{ ok: boolean; fullPull: boolean }> {
  const id = String(companyId || "").trim();
  if (!id || typeof window === "undefined" || !navigator.onLine) {
    livePullDevLog("pull_aborted", { companyId: id, reason: "missing_id_or_offline" });
    return { ok: false, fullPull: false };
  }
  if (!shouldFetchPlServerAccessContext()) {
    livePullDevLog("pull_aborted", { companyId: id, reason: "shouldFetchPlServerAccessContext_false" });
    return { ok: false, fullPull: false };
  }
  const transport = resolvePlServerMirrorTransport(id);
  if (!transport || (!transport.gateAllowed && !transport.unlockedLocally)) {
    livePullDevLog("pull_aborted", {
      companyId: id,
      reason: "transport_unavailable",
      hasTransport: Boolean(transport),
      gateAllowed: transport?.gateAllowed,
      unlockedLocally: transport?.unlockedLocally,
    });
    return { ok: false, fullPull: false };
  }
  if (isPlServerLivePullPaused(id)) {
    livePullDevLog("pull_aborted", { companyId: id, reason: "live_pull_paused" });
    return { ok: false, fullPull: false };
  }
  const pullGeneration = getPlServerPullGeneration(id);
  try {
    const { mirrorPlServerSharedCompaniesToLocalSqlite } = await import("@/lib/plServerClientCompanyMirror");
    const result = await mirrorPlServerSharedCompaniesToLocalSqlite({
      companyIds: [id],
      pullFullLedger: true,
      pullGeneration,
    });
    livePullDevLog("pull_finished", {
      companyId: id,
      mirrored: result.mirrored,
      fullPull: result.fullPull,
      pullGeneration,
    });
    return { ok: true, fullPull: result.fullPull > 0 };
  } catch (e) {
    console.warn("[syncPlServerSharedCompanyLive]", e);
    livePullDevLog("pull_failed", { companyId: id, error: e instanceof Error ? e.message : String(e) });
    return { ok: false, fullPull: false };
  }
}

"use client";

import { COLLECTIONS_TO_BACKUP, type CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { normalizeServerUrl, getActiveGate, listGates, resolveGateServerTransportUrl } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
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
import { livePullDevLog, livePullBugCatch } from "@/lib/plServerLivePullDevLog";
import {
  recordPlServerReadPullAborted,
  recordPlServerReadPullOutcome,
} from "@/lib/plServerReadSyncHealth";

const PUSH_DEBOUNCE_MS = 400;
const PUSH_RETRY_MS = 4_000;
/** Empty share list pe har poll refresh mat karo — access wipe ↔ restore loop. */
let lastEmptyShareAccessRefreshMs = 0;
const EMPTY_SHARE_ACCESS_REFRESH_MIN_MS = 8_000;

type PlDeltaPushRetryReason =
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
const fallbackServerUrlByCompany = new Map<string, string>();

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

export function isPlServerDeltaDocPushPending(
  companyId: string,
  collection: string,
  docId: string
): boolean {
  return queuedDocs.has(pushKey(String(companyId || "").trim(), String(collection || "").trim(), String(docId || "").trim()));
}

function hasPlServerDeltaDocPushPendingForCompany(companyId: string): boolean {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const prefix = `${id}::`;
  for (const key of queuedDocs.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
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
  if (hasPlServerDeltaDocPushPendingForCompany(id)) return true;
  const t = lastLocalWriteMsByCompany.get(id);
  if (!t) return false;
  return Date.now() - t < PL_SERVER_PULL_PAUSE_AFTER_LOCAL_MS;
}

/** Unlock / server pull ke baad stale pause hatao — focus poll dubara chale. */
export function clearPlServerLivePullPause(companyId: string): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  lastLocalWriteMsByCompany.delete(id);
}

/** Host SSE / remote bump — local write pause mat lagao (stale overwrite guard sirf focus_poll par). */
export function isPlServerRemoteLivePullReason(reason: string): boolean {
  const r = String(reason || "").trim();
  if (!r) return false;
  return (
    r.startsWith("server_event_") ||
    r.startsWith("remote_bump_") ||
    r === "full_check" ||
    r === "mount" ||
    r === "route_change" ||
    r === "online" ||
    r === "visibility_visible" ||
    r === "window_focus" ||
    r.startsWith("queued_server_event_") ||
    r.startsWith("queued_remote_bump_") ||
    r.startsWith("electron_resume_") ||
    r.startsWith("queued_full_check")
  );
}

function pushKey(companyId: string, collection: string, docId: string): string {
  return `${companyId}::${collection}::${docId}`;
}

/** Firestore Timestamp / Date → JSON-safe mirror payload (server SQLite revive). */
function serializeDeltaDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return outboxJsonParse(outboxJsonStringify(doc));
}

export type PlServerDeltaTransport = {
  baseUrl: string;
  accessToken: string;
  gate: GateRecord;
  gateAllowed: boolean;
  unlockedLocally: boolean;
};

export function registerPlServerCompanyTransportHint(companyId: string, serverUrl: string | null | undefined): void {
  const id = String(companyId || "").trim();
  const url = normalizeServerUrl(String(serverUrl || "").trim());
  if (!id || !url) return;
  fallbackServerUrlByCompany.set(id, url);
}

export function clearPlServerCompanyTransportHint(companyId: string): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  fallbackServerUrlByCompany.delete(id);
}

function isDirectPlServerOriginForDelta(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return String(window.location.port || "").trim() === "3001";
  } catch {
    return false;
  }
}

function inferPlServerUrlFromCurrentOrigin(): string {
  if (typeof window === "undefined") return "";
  try {
    const host = String(window.location.hostname || "").trim();
    if (!host) return "";
    const protocol = String(window.location.protocol || "http:");
    return normalizeServerUrl(`${protocol}//${host}:3001`);
  } catch {
    return "";
  }
}

function syntheticPlServerTransport(
  companyId: string,
  baseUrl: string,
  label = "Remote server"
): PlServerDeltaTransport | null {
  const id = String(companyId || "").trim();
  const url = normalizeServerUrl(baseUrl);
  if (!id || !url) return null;
  const syntheticGate: GateRecord = {
    id: "pl_remote_server",
    type: "local_server",
    serverUrl: url,
    label,
    createdAtMs: Date.now(),
  };
  return {
    baseUrl: url,
    accessToken: "",
    gate: syntheticGate,
    gateAllowed: true,
    unlockedLocally: Boolean(getLocalAuthToken(id)),
  };
}

function transportFromLocalServerGate(companyId: string, gate: GateRecord): PlServerDeltaTransport | null {
  const id = String(companyId || "").trim();
  if (!id || gate.type !== "local_server" || !String(gate.serverUrl || "").trim()) return null;
  const baseUrl = resolveGateServerTransportUrl(gate);
  if (!baseUrl) return null;
  return {
    baseUrl,
    accessToken: "",
    gate,
    gateAllowed: isCompanyAllowedOnActiveServerGate(id, gate),
    unlockedLocally: Boolean(getLocalAuthToken(id)),
  };
}

function findSavedLocalServerTransport(companyId: string): PlServerDeltaTransport | null {
  const id = String(companyId || "").trim();
  if (!id || typeof window === "undefined") return null;
  const localGates = listGates().filter(
    (gate) => gate.type === "local_server" && Boolean(normalizeServerUrl(gate.serverUrl || ""))
  );
  const allowedGate = localGates.find((gate) => isCompanyAllowedOnActiveServerGate(id, gate));
  const preferred = allowedGate || localGates[0] || null;
  return preferred ? transportFromLocalServerGate(id, preferred) : null;
}

/** Push + live pull dono ke liye same token-free gate / allow rules. */
export function resolvePlServerDeltaTransport(companyId: string): PlServerDeltaTransport | null {
  const id = String(companyId || "").trim();
  if (!id) return null;
  if ((isPlRemoteServerClientMode() || isDirectPlServerOriginForDelta()) && typeof window !== "undefined") {
    const direct = syntheticPlServerTransport(id, window.location.origin, "Remote server");
    if (direct) return direct;
  }
  const gate = getActiveGate();
  const activeTransport = transportFromLocalServerGate(id, gate);
  if (activeTransport) return activeTransport;
  const savedTransport = findSavedLocalServerTransport(id);
  if (savedTransport) return savedTransport;
  const fallbackUrl = fallbackServerUrlByCompany.get(id);
  if (fallbackUrl) {
    return syntheticPlServerTransport(id, fallbackUrl, "Saved server");
  }
  return null;
}

export function parseDeltaPushResponseOk(
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

async function shouldPushPlServerDeltaDoc(companyId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const accessContextReady = shouldFetchPlServerAccessContext() || isDirectPlServerOriginForDelta();
  const id = String(companyId || "").trim();
  if (!id) return false;

  let companyRow: Awaited<ReturnType<typeof getLocalCompanyById>> | null = null;
  let rowLooksServer = false;
  let rowUrl = "";
  try {
    companyRow = await getLocalCompanyById(id, { includeDeleted: true });
    rowUrl = String((companyRow as { plServerGateServerUrl?: unknown } | null)?.plServerGateServerUrl || "").trim();
    rowLooksServer = Boolean(
      companyRow &&
        (isServerGateCompany(companyRow) ||
          (companyRow as { plServerShared?: unknown }).plServerShared === true)
    );
  } catch {
    companyRow = null;
  }

  let transport = resolvePlServerDeltaTransport(id);
  if (!transport) {
    if (rowUrl) {
      registerPlServerCompanyTransportHint(id, rowUrl);
      transport = resolvePlServerDeltaTransport(id);
    } else if (rowLooksServer) {
      const inferred = inferPlServerUrlFromCurrentOrigin();
      if (inferred) {
        registerPlServerCompanyTransportHint(id, inferred);
        transport = resolvePlServerDeltaTransport(id);
      }
    }
  }
  if (!accessContextReady && !transport) return false;
  if (!transport) return false;
  if (!transport.gateAllowed && !transport.unlockedLocally && !rowLooksServer) return false;

  const { isPlServerShareableHostWriter } = await import("@/lib/plServerHostDeltaPublish");
  if (await isPlServerShareableHostWriter(id)) return false;

  if (companyRow && isServerGateCompany(companyRow)) return true;
  if (companyRow && isServerGateCompany(companyRow) === false && isLocalServerShareableCompany(companyRow)) {
    return rowLooksServer || transport.gateAllowed;
  }
  return rowLooksServer || transport.gateAllowed;
}

function classifyPushRetryReason(
  error: string | undefined,
  status: number,
  isNetwork: boolean
): PlDeltaPushRetryReason {
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

function schedulePlServerDeltaPushRetry(
  companyId: string,
  collection: string,
  reason: PlDeltaPushRetryReason
): void {
  const debounceKey = `${String(companyId || "").trim()}::${String(collection || "").trim()}`;
  if (!debounceKey || debounceKey === "::") return;
  if (pushRetryByKey.has(debounceKey)) return;
  console.warn("[plServerClientDeltaSync] push retry scheduled", {
    companyId,
    collection,
    retry_reason: reason,
  });
  pushRetryByKey.set(
    debounceKey,
    setTimeout(() => {
      pushRetryByKey.delete(debounceKey);
      void flushPlServerDeltaPushQueue(companyId, collection);
    }, PUSH_RETRY_MS)
  );
}

async function flushPlServerDeltaPushQueue(companyId: string, collection: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  if (!cid || !col || !(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return;
  if (!(await shouldPushPlServerDeltaDoc(cid))) {
    livePullBugCatch("DELTA_PUSH_NOT_ALLOWED", {
      companyId: cid,
      collection: col,
      queued: [...queuedDocs.keys()].filter((key) => key.startsWith(`${cid}::${col}::`)).length,
    });
    return;
  }

  const transport = resolvePlServerDeltaTransport(cid);
  if (!transport) {
    livePullBugCatch("DELTA_PUSH_TRANSPORT_MISSING", { companyId: cid, collection: col });
    return;
  }

  const docs: Record<string, unknown>[] = [];
  const keysToFlush: string[] = [];
  for (const [key, doc] of queuedDocs.entries()) {
    if (!key.startsWith(`${cid}::${col}::`)) continue;
    docs.push(doc);
    keysToFlush.push(key);
  }
  if (!docs.length) return;

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_delta_push`;
  livePullDevLog("delta_push_started", {
    companyId: cid,
    collection: col,
    count: docs.length,
    serverUrl: transport.baseUrl,
  });
  try {
    const { status, body } = await gateHttpPost(url, transport.accessToken, {
      companyId: cid,
      collection: col,
      docs,
      mirrorProtocol: PL_MIRROR_PROTOCOL_VERSION,
    });
    const parsed = parseDeltaPushResponseOk(status, body, docs.length);
    if (!parsed.ok) {
      const retryReason = classifyPushRetryReason(parsed.error, status, false);
      console.warn("[plServerClientDeltaSync] push failed", {
        status,
        error: parsed.error || body,
        sent: docs.length,
        applied: parsed.applied,
        retry_reason: parsed.protocolReject ? "protocol_mismatch" : retryReason,
      });
      livePullBugCatch("DELTA_PUSH_FAILED", {
        companyId: cid,
        collection: col,
        status,
        error: parsed.error || body,
        sent: docs.length,
        applied: parsed.applied,
      });
      if (!parsed.protocolReject) {
        schedulePlServerDeltaPushRetry(cid, col, retryReason);
      }
      return;
    }
    for (const key of keysToFlush) queuedDocs.delete(key);
    extendPlServerLivePullPause(cid);
    void import("@/lib/plServerLiveChangeTrace")
      .then(({ plServerLiveChangeTrace }) =>
        plServerLiveChangeTrace("client_delta_push_ok", {
          companyId: cid,
          collection: col,
          count: docs.length,
          applied: parsed.applied,
          serverUrl: transport.baseUrl,
        })
      )
      .catch(() => undefined);
    livePullDevLog("delta_push_success", {
      companyId: cid,
      collection: col,
      count: docs.length,
      applied: parsed.applied,
    });
  } catch (e) {
    console.warn("[plServerClientDeltaSync] push error", {
      error: e,
      retry_reason: "network",
    });
    livePullBugCatch("DELTA_PUSH_NETWORK_ERROR", {
      companyId: cid,
      collection: col,
      error: e instanceof Error ? e.message : String(e),
    });
    schedulePlServerDeltaPushRetry(cid, col, "network");
  }
}

/** SQLite write ke baad server PC ko turant update — sirf P2P gate + unlocked company. */
export async function maybeQueuePlServerDeltaAfterDocWrite(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): Promise<void> {
  const { isPlServerShareableHostWriter, maybePublishHostDeltaAfterBridgeWrite } = await import(
    "@/lib/plServerHostDeltaPublish"
  );
  if (await isPlServerShareableHostWriter(companyId)) {
    await maybePublishHostDeltaAfterBridgeWrite(companyId, collection, docId, doc);
    return;
  }

  if (!(await shouldPushPlServerDeltaDoc(companyId))) {
    let rowUrl = "";
    let rowShared = false;
    let rowServerGate = false;
    try {
      const row = await getLocalCompanyById(String(companyId || "").trim(), { includeDeleted: true });
      rowUrl = String((row as { plServerGateServerUrl?: unknown } | null)?.plServerGateServerUrl || "").trim();
      rowShared = Boolean((row as { plServerShared?: unknown } | null)?.plServerShared === true);
      rowServerGate = Boolean(row && isServerGateCompany(row));
    } catch {
      /* debug only */
    }
    let locationOrigin = "";
    let locationPort = "";
    try {
      locationOrigin = String(window.location.origin || "");
      locationPort = String(window.location.port || "");
    } catch {
      /* debug only */
    }
    const activeGate = getActiveGate();
    const localServerGates = listGates()
      .filter((gate) => gate.type === "local_server")
      .slice(0, 5)
      .map((gate) => ({
        id: gate.id,
        url: normalizeServerUrl(gate.serverUrl || ""),
        allowed: isCompanyAllowedOnActiveServerGate(companyId, gate),
      }));
    livePullBugCatch("DELTA_PUSH_QUEUE_NOT_ALLOWED", {
      companyId,
      collection,
      docId,
      hasTransport: Boolean(resolvePlServerDeltaTransport(companyId)),
      locationOrigin,
      locationPort,
      activeGateId: activeGate.id,
      activeGateType: activeGate.type,
      activeGateServerUrl: normalizeServerUrl(activeGate.serverUrl || ""),
      localServerGates,
      fallbackUrl: fallbackServerUrlByCompany.get(String(companyId || "").trim()) || "",
      rowPlServerGateServerUrl: rowUrl,
      rowPlServerShared: rowShared,
      rowServerGate,
    });
    return;
  }
  markPlServerLocalWrite(companyId);
  queuePlServerDeltaDocPush(companyId, collection, docId, doc, { skipLocalWriteMark: true });
}

/** P2P client: local SQLite write → server PC SQLite (owner + doosre clients poll se dekhenge). */
export function queuePlServerDeltaDocPush(
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
  queuedDocs.set(pushKey(cid, col, id), serializeDeltaDoc({ ...doc, id }));
  livePullDevLog("delta_push_queued", {
    companyId: cid,
    collection: col,
    docId: id,
    queueSize: [...queuedDocs.keys()].filter((key) => key.startsWith(`${cid}::${col}::`)).length,
  });
  const debounceKey = `${cid}::${col}`;
  const prev = pendingByKey.get(debounceKey);
  if (prev) clearTimeout(prev);
  pendingByKey.set(
    debounceKey,
    setTimeout(() => {
      pendingByKey.delete(debounceKey);
      void flushPlServerDeltaPushQueue(cid, col as CompanyBackupCollection);
    }, PUSH_DEBOUNCE_MS)
  );
}

/** Dev / replay: push one doc immediately (same gate URL as live pull). */
export async function flushPlServerDeltaDocPushNow(
  companyId: string,
  collection: string,
  docId: string,
  doc: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const cid = String(companyId || "").trim();
  const col = String(collection || "").trim();
  const id = String(docId || "").trim();
  if (!cid || !col || !id) return { ok: false, error: "missing_fields" };
  if (!(await shouldPushPlServerDeltaDoc(cid))) return { ok: false, error: "push_not_allowed" };

  const transport = resolvePlServerDeltaTransport(cid);
  if (!transport) return { ok: false, error: "transport_unavailable" };

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_delta_push`;
  const docs = [serializeDeltaDoc({ ...doc, id })];
  try {
    const { status, body } = await gateHttpPost(url, transport.accessToken, {
      companyId: cid,
      collection: col,
      docs,
      mirrorProtocol: PL_MIRROR_PROTOCOL_VERSION,
    });
    const parsed = parseDeltaPushResponseOk(status, body, docs.length);
    return parsed.ok ? { ok: true } : { ok: false, error: parsed.error || "push_failed" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "push_network_error" };
  }
}

/** Voucher save / patch ke baad — `saveVoucher` SQLite path se call karo. */
export function queuePlServerVoucherDeltaPush(
  companyId: string,
  voucherId: string,
  doc: Record<string, unknown>
): void {
  queuePlServerDeltaDocPush(companyId, "vouchers", voucherId, doc);
}

export async function syncPlServerSharedCompanyLive(
  companyId: string,
  options?: {
    pollOnly?: boolean;
    focusCollections?: CompanyBackupCollection[];
    /** Server SSE / host remote write — skip local-write pull pause. */
    ignoreLivePullPause?: boolean;
    pullReason?: string;
  }
): Promise<{ ok: boolean; fullPull: boolean; changedCollections?: CompanyBackupCollection[] }> {
  const id = String(companyId || "").trim();
  if (!id || typeof window === "undefined") {
    livePullDevLog("pull_aborted", { companyId: id, reason: "missing_id" });
    recordPlServerReadPullAborted(id, "missing_id_or_offline");
    return { ok: false, fullPull: false };
  }
  const clientOffline = typeof navigator !== "undefined" && !navigator.onLine;
  if (clientOffline) {
    const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
    if (isPlServerThinStaffClient()) {
      try {
        const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
        const vouchers = await listCompanyDocsFromBrowserDb(id, "vouchers");
        if (vouchers.length > 0) {
          recordPlServerReadPullOutcome(id, { ok: true, fullPull: false }, {
            context: "offline_sqlite_delta",
            error: "offline_cached_view",
          });
          livePullDevLog("pull_offline_cache", { companyId: id, cacheUsable: true, path: "sqlite" });
          return { ok: true, fullPull: false };
        }
      } catch {
        /* fall through */
      }
      const {
        hydratePlServerDisplayCacheFromIdb,
        plServerDisplayCacheHasUsableLedger,
      } = await import("@/lib/plServerDisplayCache");
      await hydratePlServerDisplayCacheFromIdb(id);
      const cacheUsable = plServerDisplayCacheHasUsableLedger(id);
      if (cacheUsable) {
        recordPlServerReadPullOutcome(id, { ok: true, fullPull: false }, {
          context: "offline_cache",
          error: "offline_cached_view",
        });
        livePullDevLog("pull_offline_cache", { companyId: id, cacheUsable: true });
        return { ok: true, fullPull: false };
      }
    }
    livePullDevLog("pull_aborted", { companyId: id, reason: "missing_id_or_offline" });
    recordPlServerReadPullAborted(id, "missing_id_or_offline");
    return { ok: false, fullPull: false };
  }
  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    const rowUrl = String((row as { plServerGateServerUrl?: unknown } | null)?.plServerGateServerUrl || "").trim();
    if (rowUrl) registerPlServerCompanyTransportHint(id, rowUrl);
  } catch {
    /* ignore */
  }
  const transport = resolvePlServerDeltaTransport(id);
  const accessContextReady = shouldFetchPlServerAccessContext();
  if (!accessContextReady && !transport) {
    livePullDevLog("pull_aborted", { companyId: id, reason: "shouldFetchPlServerAccessContext_false" });
    recordPlServerReadPullAborted(id, "shouldFetchPlServerAccessContext_false");
    return { ok: false, fullPull: false };
  }
  let rowLooksServer = false;
  try {
    const row = await getLocalCompanyById(id, { includeDeleted: true });
    rowLooksServer = Boolean(
      row &&
        (isServerGateCompany(row) || (row as { plServerShared?: unknown }).plServerShared === true)
    );
  } catch {
    rowLooksServer = false;
  }
  if (!transport || (!transport.gateAllowed && !transport.unlockedLocally && !rowLooksServer)) {
    livePullDevLog("pull_aborted", {
      companyId: id,
      reason: "transport_unavailable",
      hasTransport: Boolean(transport),
      gateAllowed: transport?.gateAllowed,
      unlockedLocally: transport?.unlockedLocally,
    });
    recordPlServerReadPullAborted(id, "transport_unavailable", {
      serverUrl: transport?.baseUrl ?? null,
    });
    return { ok: false, fullPull: false };
  }
  const ignorePause =
    options?.ignoreLivePullPause === true ||
    (options?.pullReason ? isPlServerRemoteLivePullReason(options.pullReason) : false);
  if (!ignorePause && isPlServerLivePullPaused(id)) {
    livePullDevLog("pull_aborted", { companyId: id, reason: "live_pull_paused" });
    recordPlServerReadPullAborted(id, "live_pull_paused");
    return { ok: false, fullPull: false };
  }
  const pullGeneration = getPlServerPullGeneration(id);
  const serverUrl = transport.baseUrl.replace(/\/$/, "");
  try {
    const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
    const { getActiveGate } = await import("@/lib/gates/gateStore");
    const { isPlRemoteServerClientMode } = await import("@/lib/plRemoteServerClient");
    livePullDevLog("pull_path_select", {
      companyId: id,
      thinStaff: isPlServerThinStaffClient(),
      remoteClient: isPlRemoteServerClientMode(),
      gateType: getActiveGate().type,
    });
    if (isPlServerThinStaffClient()) {
      // Mirror-first: SQLite pull every poll (EXE/APK/iOS). Soft-fail — don't throw on partial.
      const { syncPlServerSharedCompaniesToLocalSqliteLegacy } = await import(
        "@/lib/plServerClientCompanyDelta"
      );
      const { getPlServerSharedCompanies, refreshPlServerAccessContext } = await import(
        "@/lib/plServerAccessContext"
      );
      if (getPlServerSharedCompanies().length === 0) {
        const now = Date.now();
        if (now - lastEmptyShareAccessRefreshMs >= EMPTY_SHARE_ACCESS_REFRESH_MIN_MS) {
          lastEmptyShareAccessRefreshMs = now;
          livePullDevLog("access_context_refresh_before_pull", { companyId: id, serverUrl });
          await refreshPlServerAccessContext();
        }
      }
      const focusCollections = options?.focusCollections?.length ? options.focusCollections : undefined;
      const result = await syncPlServerSharedCompaniesToLocalSqliteLegacy({
        companyIds: [id],
        pullFullLedger: !focusCollections,
        focusCollections,
        pullGeneration,
      });
      const ledgerPullComplete = result.fullPull > 0;
      const partialDeltaOk = result.synced > 0;
      const focusPullOk = Boolean(
      focusCollections?.length &&
        ((result.changedCollections?.length ?? 0) > 0 || result.synced > 0 || result.fullPull > 0)
    );
      const pullResult = {
        ok: ledgerPullComplete || partialDeltaOk || focusPullOk,
        fullPull: ledgerPullComplete,
        changedCollections: result.changedCollections,
      };
      if (!pullResult.ok) {
        livePullBugCatch("SQLITE_DELTA_PULL_INCOMPLETE", {
          companyId: id,
          serverUrl,
          synced: result.synced,
          fullPull: result.fullPull,
          focusCollections,
          changedCollections: result.changedCollections,
          pollOnly: options?.pollOnly === true,
        });
      }
      recordPlServerReadPullOutcome(id, pullResult, {
        error: pullResult.ok ? undefined : "SQLITE_DELTA_PULL_INCOMPLETE",
        context: ledgerPullComplete ? "fresh" : partialDeltaOk ? "partial" : "empty",
        serverUrl,
      });
      livePullDevLog("pull_finished", {
        companyId: id,
        path: "sqlite_delta",
        ok: pullResult.ok,
        fullPull: pullResult.fullPull,
        synced: result.synced,
        pollOnly: options?.pollOnly === true,
        focusCollections,
        changedCollections: result.changedCollections,
      });
      return pullResult;
    }

    const { syncPlServerSharedCompaniesToLocalSqlite } = await import("@/lib/plServerClientCompanyDelta");
    const { getPlServerSharedCompanies, refreshPlServerAccessContext } = await import(
      "@/lib/plServerAccessContext"
    );
    const { matchPlServerSharedCompanyForLocalId } = await import("@/lib/plServerHostCompanyId");
    let shared = getPlServerSharedCompanies();
    if (!shared.length) {
      const now = Date.now();
      if (now - lastEmptyShareAccessRefreshMs >= EMPTY_SHARE_ACCESS_REFRESH_MIN_MS) {
        lastEmptyShareAccessRefreshMs = now;
        livePullDevLog("access_context_refresh_before_pull", { companyId: id, serverUrl });
        await refreshPlServerAccessContext();
        shared = getPlServerSharedCompanies();
      }
    } else if (!matchPlServerSharedCompanyForLocalId(id, shared)) {
      livePullDevLog("access_context_refresh_before_pull", { companyId: id, serverUrl, reason: "company_not_in_share_list" });
      await refreshPlServerAccessContext();
      shared = getPlServerSharedCompanies();
    }
    const focusCollections = options?.focusCollections?.length ? options.focusCollections : undefined;
    const result = await syncPlServerSharedCompaniesToLocalSqlite({
      companyIds: [id],
      pullFullLedger: !focusCollections,
      focusCollections,
      pullGeneration,
    });
    const ledgerPullComplete = result.fullPull > 0;
    const partialDeltaOk = result.synced > 0;
    const focusPullOk = Boolean(
      focusCollections?.length &&
        ((result.changedCollections?.length ?? 0) > 0 || result.synced > 0 || result.fullPull > 0)
    );
    livePullDevLog("pull_finished", {
      companyId: id,
      synced: result.synced,
      fullPull: result.fullPull,
      ledgerPullComplete,
      partialDeltaOk,
      focusCollections,
      changedCollections: result.changedCollections,
      pullGeneration,
    });
    if (!ledgerPullComplete && !partialDeltaOk && !focusPullOk) {
      livePullBugCatch("LEGACY_sqlite_delta_INCOMPLETE", {
        companyId: id,
        synced: result.synced,
        fullPull: result.fullPull,
        pullGeneration,
        hint: "Staff EXE should use display_cache path — check isPlServerThinStaffClient",
      });
      livePullDevLog("pull_incomplete", {
        companyId: id,
        path: "legacy_sqlite_delta",
        synced: result.synced,
        fullPull: result.fullPull,
        pullGeneration,
      });
    }
    const pullResult = {
      ok: ledgerPullComplete || partialDeltaOk || focusPullOk,
      fullPull: ledgerPullComplete,
      changedCollections: result.changedCollections,
    };
    recordPlServerReadPullOutcome(id, pullResult, {
      error: pullResult.ok ? undefined : "pull_incomplete",
      serverUrl,
    });
    return pullResult;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[syncPlServerSharedCompanyLive]", e);
    livePullDevLog("pull_failed", { companyId: id, error: message });
    recordPlServerReadPullOutcome(
      id,
      { ok: false, fullPull: false },
      { error: message, serverUrl }
    );
    return { ok: false, fullPull: false };
  }
}

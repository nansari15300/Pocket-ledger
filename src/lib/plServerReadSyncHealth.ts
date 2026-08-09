"use client";

import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";

/** Operator read-sync health — queue/mirror SQLite inference nahi; sirf live pull outcomes. */
export const PL_SERVER_READ_SYNC_HEALTH_EVENT = "pl-server-read-sync-health-changed";

export type PlServerReadSyncState =
  | "idle"
  | "synced"
  | "pull_failed"
  | "sharing_unavailable"
  | "offline"
  | "reconnecting";

export type PlServerReadSyncHealthSnapshot = {
  companyId: string;
  lastSuccessAtMs: number | null;
  lastAttemptAtMs: number | null;
  consecutiveFailures: number;
  state: PlServerReadSyncState;
  lastError: string | null;
  lastAttemptServerUrl: string | null;
  protocolMismatch: boolean;
};

type CompanyHealth = Omit<PlServerReadSyncHealthSnapshot, "companyId">;

const healthByCompany = new Map<string, CompanyHealth>();

function emptyHealth(): CompanyHealth {
  return {
    lastSuccessAtMs: null,
    lastAttemptAtMs: null,
    consecutiveFailures: 0,
    state: "idle",
    lastError: null,
    lastAttemptServerUrl: null,
    protocolMismatch: false,
  };
}

function companyKey(companyId: string): string {
  return String(companyId || "").trim();
}

function getOrCreate(companyId: string): CompanyHealth {
  const id = companyKey(companyId);
  let row = healthByCompany.get(id);
  if (!row) {
    row = emptyHealth();
    healthByCompany.set(id, row);
  }
  return row;
}

function emitHealthChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PL_SERVER_READ_SYNC_HEALTH_EVENT));
}

function protocolMismatchFromMessage(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  return m.includes("mirror_protocol") || m.includes("protocol_mismatch");
}

function bumpFailure(
  row: CompanyHealth,
  state: PlServerReadSyncState,
  error: string | null,
  serverUrl?: string | null
): void {
  row.lastAttemptAtMs = Date.now();
  row.consecutiveFailures += 1;
  row.state = state;
  row.lastError = error;
  row.lastAttemptServerUrl = String(serverUrl || "").trim() || row.lastAttemptServerUrl;
  row.protocolMismatch = protocolMismatchFromMessage(error);
}

function resolveReadSyncServerUrl(companyId: string, override?: string | null): string | null {
  const direct = String(override || "").trim();
  if (direct) return direct.replace(/\/$/, "");
  const gate = getActiveGate();
  if (gate?.type === "local_server") {
    const url = normalizeServerUrl(gate.serverUrl || "");
    return url || null;
  }
  void companyId;
  return null;
}

/** Browser `online` after failures — UI reconnect hint. */
export function markPlServerReadSyncReconnecting(companyId: string): void {
  const id = companyKey(companyId);
  if (!id || typeof window === "undefined") return;
  const row = getOrCreate(id);
  if (row.consecutiveFailures > 0) {
    row.state = "reconnecting";
    emitHealthChanged();
  }
}

/** Host unreachable — staff UI local SQLite use kar rahi hai (menu/offline feel). */
export function markPlServerReadUsingLocalCache(companyId: string): void {
  const id = companyKey(companyId);
  if (!id || typeof window === "undefined") return;
  const row = getOrCreate(id);
  if (row.consecutiveFailures < 1 && row.state !== "sharing_unavailable" && row.state !== "offline") {
    return;
  }
  row.state = "synced";
  row.lastError = "offline_cached_view";
  emitHealthChanged();
}

/** Live pull aborted before mirror (offline, transport, pause). */
export function recordPlServerReadPullAborted(
  companyId: string,
  reason: string,
  detail?: { serverUrl?: string | null }
): void {
  const id = companyKey(companyId);
  if (!id || typeof window === "undefined") return;
  if (reason === "live_pull_paused" || reason === "shouldFetchPlServerAccessContext_false") {
    return;
  }
  const row = getOrCreate(id);
  row.lastAttemptAtMs = Date.now();
  const serverUrl = resolveReadSyncServerUrl(id, detail?.serverUrl);
  if (reason === "missing_id_or_offline") {
    bumpFailure(row, "offline", reason, serverUrl);
  } else if (reason === "transport_unavailable") {
    bumpFailure(row, "sharing_unavailable", reason, serverUrl);
  } else {
    bumpFailure(row, "pull_failed", reason, serverUrl);
  }
  emitHealthChanged();
}

/** After mirror attempt completes (M5A ok/fullPull). */
export function recordPlServerReadPullOutcome(
  companyId: string,
  outcome: { ok: boolean; fullPull: boolean },
  detail?: { error?: string; context?: string; serverUrl?: string | null }
): void {
  const id = companyKey(companyId);
  if (!id || typeof window === "undefined") return;
  const row = getOrCreate(id);
  const now = Date.now();
  row.lastAttemptAtMs = now;
  if (outcome.ok) {
    row.lastSuccessAtMs = now;
    row.consecutiveFailures = 0;
    row.state = "synced";
    row.lastError =
      detail?.context === "offline_cache" || detail?.context === "cache_fallback"
        ? detail?.error ?? null
        : null;
    row.lastAttemptServerUrl = null;
    row.protocolMismatch = false;
    emitHealthChanged();
    return;
  }
  // Host pull failed — local SQLite/cache usable ho to bhi failure count mat zero karo.
  // (Pehle yahan reset → Offline pe bhi focus/route pull + green strip chalta tha.)
  const err = detail?.error || "pull_incomplete";
  const serverUrl = resolveReadSyncServerUrl(id, detail?.serverUrl);
  const state: PlServerReadSyncState =
    err === "transport_unavailable" || err === "sharing_unavailable"
      ? "sharing_unavailable"
      : "pull_failed";
  bumpFailure(row, state, err, serverUrl);
  void (async () => {
    try {
      const { plServerDisplayCacheHasUsableLedger } = await import("@/lib/plServerDisplayCache");
      if (plServerDisplayCacheHasUsableLedger(id)) {
        // Local feel: UI “synced” cache label, lekin consecutiveFailures host unreachable rakhe.
        row.state = "synced";
        row.lastError = "offline_cached_view";
        emitHealthChanged();
        return;
      }
    } catch {
      /* already bumped */
    }
    emitHealthChanged();
  })();
}

export function getPlServerReadSyncHealth(companyId: string): PlServerReadSyncHealthSnapshot {
  const id = companyKey(companyId);
  const row = id ? healthByCompany.get(id) ?? emptyHealth() : emptyHealth();
  return { companyId: id, ...row };
}

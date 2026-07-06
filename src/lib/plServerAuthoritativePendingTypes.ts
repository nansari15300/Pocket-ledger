"use client";

/** Queue row schema migrations — bump when record shape changes. */
export const PL_SERVER_AUTHORITATIVE_PENDING_SCHEMA_VERSION = 1;

export const PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED = "pl-authoritative-pending-queue-changed";

export const PENDING_AUTHORITATIVE_COMPANY_DOC_STORE = "pendingAuthoritativeCompanyDocWrites";

export type PendingAuthoritativeWriteState =
  | "queued"
  | "sending"
  | "retry_scheduled"
  | "failed_permanent";

export type PendingAuthoritativeWriteErrorClass =
  | "network"
  | "auth"
  | "protocol"
  | "host_unavailable"
  | "rejected"
  | "unknown";

export type PendingAuthoritativeCompanyDocWrite = {
  schemaVersion: number;
  queueItemId: string;
  coalesceKey: string;
  companyId: string;
  collectionName: string;
  docId: string;
  payload: Record<string, unknown>;
  upsertOptions: {
    notify?: boolean;
    skipCloudSyncEnqueue?: boolean;
    skipPlanMutationGate?: boolean;
    force?: boolean;
  };
  gateId: string;
  gateServerUrl: string;
  accessTokenFingerprint: string;
  state: PendingAuthoritativeWriteState;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
  inFlightSince: number | null;
  lastError: string | null;
  lastHttpStatus: number | null;
  lastErrorClass: PendingAuthoritativeWriteErrorClass | null;
  clientMutationId: string;
  payloadHash: string;
};

export function pendingAuthoritativeCoalesceKey(
  companyId: string,
  collectionName: string,
  docId: string
): string {
  return `${String(companyId || "").trim()}::${String(collectionName || "").trim()}::${String(docId || "").trim()}`;
}

export function emitAuthoritativePendingQueueChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PL_AUTHORITATIVE_PENDING_QUEUE_CHANGED));
}

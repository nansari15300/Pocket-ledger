"use client";

import {
  listDuePendingAuthoritativeWrites,
  recoverStalePendingAuthoritativeSends,
  removePendingAuthoritativeCompanyDocWrite,
  markPendingAuthoritativeWriteState,
  classifyAuthoritativeWriteFailure,
  isAuthoritativeWriteFailureRetryable,
  computeNextRetryAttemptAt,
  MAX_AUTO_RETRIES,
  listPendingAuthoritativeCompanyDocWrites,
} from "@/lib/plServerAuthoritativePendingQueue";
import type { PendingAuthoritativeCompanyDocWrite } from "@/lib/plServerAuthoritativePendingTypes";

export type PlServerAuthoritativeReplayDrainResult = {
  drained: number;
  skippedMutex: boolean;
  permanentFailures: number;
};

let replayInFlight = false;
let scheduledDrainTimer: ReturnType<typeof setTimeout> | null = null;

function verifySkipPendingDeleteOnSuccess(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __plPhase1bVerifySkipPendingDeleteOnReplaySuccess?: boolean })
      .__plPhase1bVerifySkipPendingDeleteOnReplaySuccess
  );
}

function replaySimulateLanClientRoute(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __plPhase1bVerifySimulateLanClientAuthoritativeRoute?: boolean })
      .__plPhase1bVerifySimulateLanClientAuthoritativeRoute
  );
}

async function preflightPendingRowAttachments(row: PendingAuthoritativeCompanyDocWrite): Promise<void> {
  const {
    flushPlServerAttachmentsForRecordBeforeAuthoritativeSave,
    listLocalAttachmentIdsInRecord,
  } = await import("@/lib/plServerAttachmentUploadQueue");
  if ((await listLocalAttachmentIdsInRecord(row.payload)).length === 0) return;
  const result = await flushPlServerAttachmentsForRecordBeforeAuthoritativeSave(row.companyId, row.payload, {
    throwOnFailure: true,
  });
  if (!result.ok) {
    throw new Error(result.error || "attachment_upload_failed");
  }
}

async function markPendingReplayFailure(
  row: PendingAuthoritativeCompanyDocWrite,
  error: unknown
): Promise<"retry" | "permanent"> {
  const errorClass = classifyAuthoritativeWriteFailure(error);
  const message = error instanceof Error ? error.message : String(error);
  const nextRetry = row.retryCount + 1;

  if (!isAuthoritativeWriteFailureRetryable(errorClass) || nextRetry > MAX_AUTO_RETRIES) {
    await markPendingAuthoritativeWriteState(row, "failed_permanent", {
      inFlightSince: null,
      retryCount: nextRetry,
      lastError: message,
      lastErrorClass: errorClass,
      nextAttemptAt: null,
    });
    return "permanent";
  }

  await markPendingAuthoritativeWriteState(row, "retry_scheduled", {
    inFlightSince: null,
    retryCount: nextRetry,
    lastError: message,
    lastErrorClass: errorClass,
    nextAttemptAt: computeNextRetryAttemptAt(nextRetry),
  });
  return "retry";
}

async function replayOnePendingRow(
  row: PendingAuthoritativeCompanyDocWrite
): Promise<"success" | "retry" | "permanent"> {
  const { shouldRoutePlServerAuthoritativeWrite, invokePlServerAuthoritativeDocUpsert } = await import(
    "@/lib/plServerClientAuthoritativeWrite"
  );

  const simulateLanClient = replaySimulateLanClientRoute();
  if (
    !(await shouldRoutePlServerAuthoritativeWrite(row.companyId, row.upsertOptions, {
      simulateLanClient,
    }))
  ) {
    try {
      await preflightPendingRowAttachments(row);
    } catch (e) {
      return markPendingReplayFailure(row, e);
    }

    const { flushPlServerDeltaDocPushNow } = await import("@/lib/plServerClientDeltaSync");
    const mirrorPush = await flushPlServerDeltaDocPushNow(
      row.companyId,
      row.collectionName,
      row.docId,
      row.payload
    );
    if (mirrorPush.ok) {
      if (!verifySkipPendingDeleteOnSuccess()) {
        await removePendingAuthoritativeCompanyDocWrite(row.queueItemId);
      }
      return "success";
    }

    const nextRetry = row.retryCount + 1;
    if (nextRetry > MAX_AUTO_RETRIES) {
      await markPendingAuthoritativeWriteState(row, "failed_permanent", {
        inFlightSince: null,
        retryCount: nextRetry,
        lastError: "authoritative_route_unavailable",
        lastErrorClass: "host_unavailable",
        nextAttemptAt: null,
      });
      return "permanent";
    }
    await markPendingAuthoritativeWriteState(row, "retry_scheduled", {
      nextAttemptAt: computeNextRetryAttemptAt(nextRetry),
      retryCount: nextRetry,
      lastError: "authoritative_route_unavailable",
      lastErrorClass: "host_unavailable",
    });
    return "retry";
  }

  try {
    await preflightPendingRowAttachments(row);
  } catch (e) {
    return markPendingReplayFailure(row, e);
  }

  await markPendingAuthoritativeWriteState(row, "sending", {
    inFlightSince: Date.now(),
    lastAttemptAt: Date.now(),
  });

  try {
    await invokePlServerAuthoritativeDocUpsert(
      row.companyId,
      row.collectionName,
      row.docId,
      row.payload,
      { ...row.upsertOptions, notify: false }
    );
    if (!verifySkipPendingDeleteOnSuccess()) {
      await removePendingAuthoritativeCompanyDocWrite(row.queueItemId);
    } else {
      await markPendingAuthoritativeWriteState(row, "queued", {
        inFlightSince: null,
        nextAttemptAt: Date.now(),
      });
    }
    return "success";
  } catch (e) {
    const { flushPlServerDeltaDocPushNow } = await import("@/lib/plServerClientDeltaSync");
    const mirrorPush = await flushPlServerDeltaDocPushNow(
      row.companyId,
      row.collectionName,
      row.docId,
      row.payload
    );
    if (mirrorPush.ok) {
      if (!verifySkipPendingDeleteOnSuccess()) {
        await removePendingAuthoritativeCompanyDocWrite(row.queueItemId);
      }
      return "success";
    }

    return markPendingReplayFailure(row, e);
  }
}

function verifyForceRecoverPendingSends(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __plPhase1bVerifyForceRecoverPendingSends?: boolean })
      .__plPhase1bVerifyForceRecoverPendingSends
  );
}

function verifyPauseBackgroundReplay(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __plPhase1bVerifyPauseBackgroundAuthoritativeReplay?: boolean })
      .__plPhase1bVerifyPauseBackgroundAuthoritativeReplay
  );
}

/** Sequential FIFO drain — invoke frozen M2 only. */
export async function drainPlServerAuthoritativePendingQueue(
  reason?: string
): Promise<PlServerAuthoritativeReplayDrainResult> {
  const verifyExplicit = reason === "verify" || reason === "cold_start";
  if (verifyPauseBackgroundReplay() && !verifyExplicit) {
    return { drained: 0, skippedMutex: false, permanentFailures: 0 };
  }
  if (replayInFlight) {
    return { drained: 0, skippedMutex: true, permanentFailures: 0 };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { drained: 0, skippedMutex: false, permanentFailures: 0 };
  }

  replayInFlight = true;
  let drained = 0;
  let permanentFailures = 0;

  try {
    if (verifyForceRecoverPendingSends()) {
      const sendingRows = (await listPendingAuthoritativeCompanyDocWrites()).filter(
        (r) => r.state === "sending"
      );
      for (const row of sendingRows) {
        await markPendingAuthoritativeWriteState(row, "retry_scheduled", {
          inFlightSince: null,
          nextAttemptAt: Date.now(),
          lastError: row.lastError ?? "verify_force_recover_sending",
        });
      }
    }
    await recoverStalePendingAuthoritativeSends();
    // Token-off / gate reopen: revive auth permanent failures so Host sync can finish.
    try {
      const { resolvePlServerDeltaTransport } = await import("@/lib/plServerClientDeltaSync");
      const authFailed = (await listPendingAuthoritativeCompanyDocWrites()).filter(
        (r) => r.state === "failed_permanent" && r.lastErrorClass === "auth"
      );
      for (const row of authFailed) {
        if (!resolvePlServerDeltaTransport(row.companyId)) continue;
        await markPendingAuthoritativeWriteState(row, "retry_scheduled", {
          inFlightSince: null,
          retryCount: 0,
          nextAttemptAt: Date.now(),
          lastError: "resurrect_after_gate_open_access",
          lastErrorClass: "auth",
        });
      }
    } catch {
      /* ignore resurrect errors */
    }
    const due = await listDuePendingAuthoritativeWrites();

    for (const row of due) {
      const outcome = await replayOnePendingRow(row);
      if (outcome === "success") drained += 1;
      if (outcome === "permanent") permanentFailures += 1;
    }
  } finally {
    replayInFlight = false;
  }

  return { drained, skippedMutex: false, permanentFailures };
}

export function schedulePlServerAuthoritativeReplayDrain(_reason?: string): void {
  if (verifyPauseBackgroundReplay()) return;
  if (scheduledDrainTimer) clearTimeout(scheduledDrainTimer);
  scheduledDrainTimer = setTimeout(() => {
    scheduledDrainTimer = null;
    void drainPlServerAuthoritativePendingQueue(_reason);
  }, 500);
}

export async function coldStartPlServerAuthoritativeReplayManager(): Promise<PlServerAuthoritativeReplayDrainResult> {
  await recoverStalePendingAuthoritativeSends();
  return drainPlServerAuthoritativePendingQueue("cold_start");
}

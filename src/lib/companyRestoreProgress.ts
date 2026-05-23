"use client";

import type { CompanyBackupProgress } from "@/lib/companyBackupCore";
import {
  backupDataHasAttachmentBundle,
  getAttachmentRestoreEntryCount,
} from "@/lib/attachmentBackupBundle";
import {
  estimateRemainingFromFilePace,
  formatBackupThroughputLabel,
} from "@/lib/backupProgressMetrics";

/** Restore pipeline — attachments + docs + finalize steps ka total work count. */
export function countRestoreWorkUnits(
  backupData: Record<string, unknown>,
  restoreAttachments: boolean,
  collectionNames: readonly string[]
): number {
  let total = 0;
  if (restoreAttachments && backupDataHasAttachmentBundle(backupData)) {
    total += getAttachmentRestoreEntryCount(backupData);
  }
  for (const col of collectionNames) {
    const rows = backupData[col];
    if (Array.isArray(rows)) total += rows.length;
  }
  // Company row + flush/sync + cloud push/finalize buffer.
  total += 4;
  return Math.max(total, 1);
}

export type RestoreProgressReporter = {
  tick: (phase: string, detail?: string, addDone?: number, addBytes?: number) => void;
  throwIfAborted: () => void;
};

/** Backup card jaisa live progress — done/total, speed label, ETA. */
export function createRestoreProgressReporter(
  total: number,
  setProgress: (p: CompanyBackupProgress) => void,
  signal?: AbortSignal
): RestoreProgressReporter {
  const startedMs = Date.now();
  let done = 0;
  let bytesTotal = 0;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Restore cancelled", "AbortError");
  };

  const tick = (phase: string, detail = "", addDone = 1, addBytes = 0) => {
    throwIfAborted();
    done += addDone;
    bytesTotal += addBytes;
    const elapsedMs = Date.now() - startedMs;
    setProgress({
      phase,
      detail,
      done: Math.min(done, total),
      total,
      speedLabel: formatBackupThroughputLabel({
        bytesTotal,
        elapsedMs,
        filesDone: done,
      }),
      remainingLabel: estimateRemainingFromFilePace(done, total, elapsedMs),
    });
  };

  return { tick, throwIfAborted };
}

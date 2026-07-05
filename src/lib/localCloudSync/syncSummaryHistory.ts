import { startOfDay, startOfMonth, startOfWeek } from "date-fns";
import type { CloudSyncLastSyncSummary } from "@/lib/localCloudSync/types";

export type CloudSyncSummaryRange =
  | "last"
  | "1h"
  | "3h"
  | "5h"
  | "8h"
  | "today"
  | "week"
  | "month"
  | "all";

export const CLOUD_SYNC_SUMMARY_RANGE_OPTIONS: ReadonlyArray<{
  value: CloudSyncSummaryRange;
  label: string;
}> = [
  { value: "last", label: "last" },
  { value: "1h", label: "last 1 Hr" },
  { value: "3h", label: "last 3 Hr" },
  { value: "5h", label: "last 5 Hr" },
  { value: "8h", label: "last 8 Hr" },
  { value: "today", label: "today" },
  { value: "week", label: "this week" },
  { value: "month", label: "this month" },
  { value: "all", label: "all" },
];

/** Reset submenu — "last" cycle ko chhod kar baaki ranges. */
export type CloudSyncSummaryResetRange = Exclude<CloudSyncSummaryRange, "last">;

export const CLOUD_SYNC_SUMMARY_RESET_OPTIONS: ReadonlyArray<{
  value: CloudSyncSummaryResetRange;
  label: string;
}> = CLOUD_SYNC_SUMMARY_RANGE_OPTIONS.filter(
  (opt): opt is { value: CloudSyncSummaryResetRange; label: string } => opt.value !== "last"
);

export type CloudSyncSummaryHistoryEntry = CloudSyncLastSyncSummary & {
  at: number;
};

const EMPTY_SUMMARY: CloudSyncLastSyncSummary = {
  addedFiles: 0,
  addedVouchers: 0,
  uploadedFiles: 0,
  uploadedVouchers: 0,
  downloadedFiles: 0,
  downloadedVouchers: 0,
};

const MAX_HISTORY_ENTRIES = 500;

function parseSummaryFields(o: Record<string, unknown>): CloudSyncLastSyncSummary {
  const n = (k: string) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  };
  const addedFiles = n("addedFiles");
  const addedVouchers = n("addedVouchers");
  return {
    addedFiles,
    addedVouchers,
    uploadedFiles: n("uploadedFiles"),
    uploadedVouchers: n("uploadedVouchers"),
    downloadedFiles: n("downloadedFiles"),
    downloadedVouchers: n("downloadedVouchers"),
  };
}

export function emptyCloudSyncLastSyncSummary(): CloudSyncLastSyncSummary {
  return { ...EMPTY_SUMMARY };
}

/** Registry `cloudSyncSummaryHistory` — purane rows ke liye last sync se ek entry seed. */
export function parseCloudSyncSummaryHistory(
  raw: unknown,
  legacy?: { summary: CloudSyncLastSyncSummary; at: number | null }
): CloudSyncSummaryHistoryEntry[] {
  const entries: CloudSyncSummaryHistoryEntry[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const at = Number(o.at);
      if (!Number.isFinite(at) || at <= 0) continue;
      entries.push({ ...parseSummaryFields(o), at });
    }
  }
  entries.sort((a, b) => a.at - b.at);

  // Explicit `[]` = user ne reset kiya — purana lastSyncSummary se mat bharo.
  const explicitlyCleared = Array.isArray(raw) && raw.length === 0;
  if (entries.length === 0 && !explicitlyCleared && legacy?.at && legacy.at > 0) {
    entries.push({ ...legacy.summary, at: legacy.at });
  }

  return entries;
}

export function appendCloudSyncSummaryHistory(
  existing: CloudSyncSummaryHistoryEntry[],
  entry: CloudSyncSummaryHistoryEntry
): CloudSyncSummaryHistoryEntry[] {
  const next = [...existing, entry].sort((a, b) => a.at - b.at);
  if (next.length <= MAX_HISTORY_ENTRIES) return next;
  return next.slice(next.length - MAX_HISTORY_ENTRIES);
}

function sumSummaries(entries: CloudSyncSummaryHistoryEntry[]): CloudSyncLastSyncSummary {
  return entries.reduce(
    (acc, e) => ({
      addedFiles: acc.addedFiles + e.addedFiles,
      addedVouchers: acc.addedVouchers + e.addedVouchers,
      uploadedFiles: acc.uploadedFiles + e.uploadedFiles,
      uploadedVouchers: acc.uploadedVouchers + e.uploadedVouchers,
      downloadedFiles: acc.downloadedFiles + e.downloadedFiles,
      downloadedVouchers: acc.downloadedVouchers + e.downloadedVouchers,
    }),
    { ...EMPTY_SUMMARY }
  );
}

export function rangeCutoffMs(range: CloudSyncSummaryRange, now: number): number | null {
  switch (range) {
    case "last":
      return null;
    case "1h":
      return now - 60 * 60 * 1000;
    case "3h":
      return now - 3 * 60 * 60 * 1000;
    case "5h":
      return now - 5 * 60 * 60 * 1000;
    case "8h":
      return now - 8 * 60 * 60 * 1000;
    case "today":
      return startOfDay(now).getTime();
    case "week":
      return startOfWeek(now, { weekStartsOn: 1 }).getTime();
    case "month":
      return startOfMonth(now).getTime();
    case "all":
      return 0;
  }
}

export function aggregateSyncSummaryForRange(
  range: CloudSyncSummaryRange,
  history: CloudSyncSummaryHistoryEntry[],
  fallback: CloudSyncLastSyncSummary,
  resetAt?: number | null
): CloudSyncLastSyncSummary {
  let scoped = history;
  if (typeof resetAt === "number" && resetAt > 0) {
    scoped = history.filter((e) => e.at >= resetAt);
  }

  if (range === "last") {
    if (scoped.length > 0) return scoped[scoped.length - 1]!;
    if (typeof resetAt === "number" && resetAt > 0) return { ...EMPTY_SUMMARY };
    return fallback;
  }

  if (scoped.length === 0) return { ...EMPTY_SUMMARY };

  const now = Date.now();
  const cutoff = rangeCutoffMs(range, now)!;
  const filtered = scoped.filter((e) => e.at >= cutoff);
  if (filtered.length === 0) return { ...EMPTY_SUMMARY };
  return sumSummaries(filtered);
}

/** Range ke andar ke history entries hatao (view range jaisa cutoff). */
export function clearSyncSummaryHistoryInRange(
  history: CloudSyncSummaryHistoryEntry[],
  range: CloudSyncSummaryResetRange
): CloudSyncSummaryHistoryEntry[] {
  if (range === "all") return [];
  const cutoff = rangeCutoffMs(range, Date.now())!;
  return history.filter((e) => e.at < cutoff);
}

export function lastSyncSummaryFromHistory(
  history: CloudSyncSummaryHistoryEntry[]
): CloudSyncLastSyncSummary {
  if (history.length === 0) return { ...EMPTY_SUMMARY };
  const last = history[history.length - 1]!;
  return {
    addedFiles: last.addedFiles,
    addedVouchers: last.addedVouchers,
    uploadedFiles: last.uploadedFiles,
    uploadedVouchers: last.uploadedVouchers,
    downloadedFiles: last.downloadedFiles,
    downloadedVouchers: last.downloadedVouchers,
  };
}

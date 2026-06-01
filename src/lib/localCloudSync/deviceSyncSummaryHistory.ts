"use client";

import type { CloudSyncLastSyncSummary } from "@/lib/localCloudSync/types";
import { getOrCreateClientDeviceId } from "@/lib/security/deviceIdentity";

// Summary algorithm changed to attachment-only file counts; use v2 key to avoid old inflated totals.
const DEVICE_SYNC_HISTORY_KEY = "pocket-ledger:cloud-sync:device-summary-history:v2";
const MAX_HISTORY_ROWS_PER_DEVICE_COMPANY = 500;

export type DeviceSyncSummaryHistoryEntry = CloudSyncLastSyncSummary & {
  companyId: string;
  deviceId: string;
  at: number;
  /** Device-local "newly created" counts — Added row ke liye */
  createdFiles: number;
  createdVouchers: number;
};

export type DeviceSyncSummaryRange = {
  fromMs: number;
  toMs: number;
};

function readStore(): DeviceSyncSummaryHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEVICE_SYNC_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        const n = (k: keyof CloudSyncLastSyncSummary | "createdFiles" | "createdVouchers" | "at") => {
          const v = Number(r[k]);
          return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
        };
        return {
          companyId: String(r.companyId || "").trim(),
          deviceId: String(r.deviceId || "").trim(),
          at: n("at"),
          createdFiles: n("createdFiles"),
          createdVouchers: n("createdVouchers"),
          addedFiles: n("addedFiles"),
          addedVouchers: n("addedVouchers"),
          uploadedFiles: n("uploadedFiles"),
          uploadedVouchers: n("uploadedVouchers"),
          downloadedFiles: n("downloadedFiles"),
          downloadedVouchers: n("downloadedVouchers"),
        } satisfies DeviceSyncSummaryHistoryEntry;
      })
      .filter((row) => row.companyId && row.deviceId && row.at > 0);
  } catch {
    return [];
  }
}

function writeStore(rows: DeviceSyncSummaryHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEVICE_SYNC_HISTORY_KEY, JSON.stringify(rows));
  } catch {
    /* localStorage full/blocked — skip history persistence */
  }
}

/** Per-device sync history append: card ko global summary ki jagah local timeline dene ke liye. */
export function appendDeviceSyncSummaryHistory(input: {
  companyId: string;
  summary: CloudSyncLastSyncSummary;
  createdFiles: number;
  createdVouchers: number;
  at?: number;
}): void {
  const companyId = String(input.companyId || "").trim();
  if (!companyId) return;
  const deviceId = getOrCreateClientDeviceId();
  const at = Number.isFinite(input.at) ? Number(input.at) : Date.now();
  const next: DeviceSyncSummaryHistoryEntry = {
    companyId,
    deviceId,
    at,
    createdFiles: Math.max(0, Math.floor(Number(input.createdFiles) || 0)),
    createdVouchers: Math.max(0, Math.floor(Number(input.createdVouchers) || 0)),
    addedFiles: Math.max(0, Math.floor(Number(input.summary.addedFiles) || 0)),
    addedVouchers: Math.max(0, Math.floor(Number(input.summary.addedVouchers) || 0)),
    uploadedFiles: Math.max(0, Math.floor(Number(input.summary.uploadedFiles) || 0)),
    uploadedVouchers: Math.max(0, Math.floor(Number(input.summary.uploadedVouchers) || 0)),
    downloadedFiles: Math.max(0, Math.floor(Number(input.summary.downloadedFiles) || 0)),
    downloadedVouchers: Math.max(0, Math.floor(Number(input.summary.downloadedVouchers) || 0)),
  };
  const all = readStore();
  const scoped = all.filter((row) => !(row.companyId === companyId && row.deviceId === deviceId));
  const mine = all
    .filter((row) => row.companyId === companyId && row.deviceId === deviceId)
    .sort((a, b) => b.at - a.at);
  const trimmedMine = [next, ...mine].slice(0, MAX_HISTORY_ROWS_PER_DEVICE_COMPANY);
  writeStore([...trimmedMine, ...scoped]);
}

/** Current device + company timeline — date range filter card isi source se render kare. */
export function listDeviceSyncSummaryHistory(
  companyId: string,
  range?: DeviceSyncSummaryRange
): DeviceSyncSummaryHistoryEntry[] {
  const cid = String(companyId || "").trim();
  if (!cid) return [];
  const deviceId = getOrCreateClientDeviceId();
  const fromMs = range ? Math.max(0, Math.floor(range.fromMs)) : Number.MIN_SAFE_INTEGER;
  const toMs = range ? Math.max(fromMs, Math.floor(range.toMs)) : Number.MAX_SAFE_INTEGER;
  return readStore()
    .filter((row) => row.companyId === cid && row.deviceId === deviceId && row.at >= fromMs && row.at <= toMs)
    .sort((a, b) => b.at - a.at);
}

/** Card totals aggregate — selected date range ke saare sync events ka merged view. */
export function summarizeDeviceSyncHistory(
  companyId: string,
  range?: DeviceSyncSummaryRange
): DeviceSyncSummaryHistoryEntry {
  const rows = listDeviceSyncSummaryHistory(companyId, range);
  const sum = rows.reduce(
    (acc, row) => {
      acc.createdFiles += row.createdFiles;
      acc.createdVouchers += row.createdVouchers;
      acc.addedFiles += row.addedFiles;
      acc.addedVouchers += row.addedVouchers;
      acc.uploadedFiles += row.uploadedFiles;
      acc.uploadedVouchers += row.uploadedVouchers;
      acc.downloadedFiles += row.downloadedFiles;
      acc.downloadedVouchers += row.downloadedVouchers;
      return acc;
    },
    {
      createdFiles: 0,
      createdVouchers: 0,
      addedFiles: 0,
      addedVouchers: 0,
      uploadedFiles: 0,
      uploadedVouchers: 0,
      downloadedFiles: 0,
      downloadedVouchers: 0,
    }
  );
  return {
    companyId: String(companyId || "").trim(),
    deviceId: getOrCreateClientDeviceId(),
    at: rows[0]?.at ?? 0,
    ...sum,
  };
}

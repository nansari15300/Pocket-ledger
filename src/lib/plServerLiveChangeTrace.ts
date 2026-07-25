"use client";

import { plGateTrace } from "@/lib/plGateTrace";

const LIVE_CHANGE_TAG = "PL-LIVE-CHANGE";
const VOUCHER_FORENSIC_TAG = "PL-VOUCHER-FORENSIC";

/** User/server live delta — `%APPDATA%\\Pocket Ledger\\pl-trace.log` (EXE). */
export function plServerLiveChangeTrace(event: string, detail?: unknown): void {
  plGateTrace(event, detail, LIVE_CHANGE_TAG);
}

/** Voucher IDs ka content-free fingerprint; amounts/narration/file names kabhi log nahi hote. */
export function voucherIdFingerprint(rows: readonly unknown[]): string {
  const ids = rows
    .map((row) => String((row as { id?: unknown } | null)?.id || "").trim())
    .filter(Boolean)
    .sort();
  let hash = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${ids.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function plServerVoucherForensicTrace(event: string, detail?: unknown): void {
  plGateTrace(event, detail, VOUCHER_FORENSIC_TAG);
}

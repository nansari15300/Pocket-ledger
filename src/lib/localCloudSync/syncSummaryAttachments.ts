"use client";

import { isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import type { LocalCloudSyncOperation } from "@/lib/localCloudSync/types";

/** Cloud sync summary — `drive:` / `local:` refs jo attachment bytes ya metadata sync karte hain. */
export function isCloudSyncTrackableFileRef(v: unknown): v is string {
  if (typeof v !== "string" || !v.trim()) return false;
  return isDriveFileRef(v) || isLocalFileRef(v);
}

/** Nested doc / op payload se saari trackable file refs collect — vouchers ke `fileUrls` bhi. */
export function collectCloudSyncFileRefsFromValue(val: unknown, out: Set<string>): void {
  if (val == null) return;
  if (typeof val === "string") {
    if (isCloudSyncTrackableFileRef(val)) out.add(val);
    return;
  }
  if (Array.isArray(val)) {
    for (const item of val) collectCloudSyncFileRefsFromValue(item, out);
    return;
  }
  if (typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return;
    if (o.__fsTs === true) return;
    for (const k of Object.keys(o)) collectCloudSyncFileRefsFromValue(o[k], out);
  }
}

/** Remote apply ke baad kitni nayi file refs local par aayi — pehle local doc se diff. */
export function countNewCloudSyncFileRefs(
  localDoc: Record<string, unknown> | null,
  mergedDoc: Record<string, unknown>
): number {
  const before = new Set<string>();
  const after = new Set<string>();
  collectCloudSyncFileRefsFromValue(localDoc, before);
  collectCloudSyncFileRefsFromValue(mergedDoc, after);
  let n = 0;
  for (const ref of after) {
    if (!before.has(ref)) n += 1;
  }
  return n;
}

/** Upload hone wale ops me unique attachment refs — voucher / party docs metadata sync. */
export function countUniqueCloudSyncFileRefsInOps(ops: LocalCloudSyncOperation[]): number {
  const refs = new Set<string>();
  for (const op of ops) {
    collectCloudSyncFileRefsFromValue(op.payload, refs);
  }
  return refs.size;
}

const VOUCHER_SYNC_TABLE = "vouchers";

/**
 * Sync summary — ek voucher = ek count (DR/CR legs ya create+update duplicate ops nahi).
 * Pehle voucherNumber+type (RCPT-001 jaisa), phir stable doc id.
 */
export function voucherIdentityKeyFromOp(op: LocalCloudSyncOperation): string {
  const p = op.payload ?? {};
  const voucherNumber = String(p.voucherNumber ?? p.voucherNo ?? "").trim();
  const type = String(p.type ?? p.voucherType ?? "").trim().toLowerCase();
  if (voucherNumber) return `vn:${type}:${voucherNumber}`;
  const docId = String(p.id ?? op.rowId ?? "").trim();
  if (docId) return `id:${docId}`;
  return `row:${String(op.rowId || "").trim()}`;
}

/** Sirf `vouchers` table ops — unique voucher identity keys. */
export function collectUniqueVoucherIdentityKeysFromOps(ops: readonly LocalCloudSyncOperation[]): Set<string> {
  const keys = new Set<string>();
  for (const op of ops) {
    if (op.table !== VOUCHER_SYNC_TABLE) continue;
    const key = voucherIdentityKeyFromOp(op);
    if (key) keys.add(key);
  }
  return keys;
}

export function countUniqueVoucherOps(ops: readonly LocalCloudSyncOperation[]): number {
  return collectUniqueVoucherIdentityKeysFromOps(ops).size;
}

"use client";

import { getBrowserDb } from "@/lib/localSqlite";
import { getOrCreateClientDeviceId } from "@/lib/security/deviceIdentity";
import type { CloudSyncAction, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";

type CloudSyncMetaRow = {
  company_id: string;
  last_local_op_seq: number;
  last_synced_op: number;
  last_sync_at: number | null;
  sync_status: string;
  last_error: string | null;
};

function nextOpId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureMetaRow(companyId: string): Promise<CloudSyncMetaRow> {
  const db = await getBrowserDb();
  if (!db) throw new Error("cloud_sync: SQLite unavailable");
  const existing = db
    .prepare(`SELECT * FROM cloud_sync_meta WHERE company_id = ?`)
    .get(companyId) as CloudSyncMetaRow | undefined;
  if (existing) return existing;
  db.prepare(
    `INSERT INTO cloud_sync_meta(company_id, last_local_op_seq, last_synced_op, last_sync_at, sync_status, last_error)
     VALUES(?, 0, 0, NULL, 'idle', NULL)`
  ).run(companyId);
  return {
    company_id: companyId,
    last_local_op_seq: 0,
    last_synced_op: 0,
    last_sync_at: null,
    sync_status: "idle",
    last_error: null,
  };
}

function allocNextOpSeq(db: NonNullable<Awaited<ReturnType<typeof getBrowserDb>>>, companyId: string): number {
  const row = db.prepare(`SELECT last_local_op_seq FROM cloud_sync_meta WHERE company_id = ?`).get(companyId) as
    | { last_local_op_seq: number }
    | undefined;
  const next = (Number(row?.last_local_op_seq) || 0) + 1;
  db.prepare(`UPDATE cloud_sync_meta SET last_local_op_seq = ? WHERE company_id = ?`).run(next, companyId);
  return next;
}

/** Har local write (create/update/soft-delete) ke baad delta op queue — full DB upload nahi. */
export async function enqueueLocalCloudSyncOp(input: {
  companyId: string;
  table: string;
  action: CloudSyncAction;
  rowId: string;
  payload: Record<string, unknown>;
  updatedAt?: number;
}): Promise<void> {
  const companyId = String(input.companyId || "").trim();
  const table = String(input.table || "").trim();
  const rowId = String(input.rowId || "").trim();
  if (!companyId || !table || !rowId) return;

  const db = await getBrowserDb();
  if (!db) return;

  await ensureMetaRow(companyId);
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : Date.now();
  const opSeq = allocNextOpSeq(db, companyId);
  const opId = nextOpId();
  const deviceId = getOrCreateClientDeviceId();
  const payload = {
    ...input.payload,
    id: rowId,
    updatedAt,
    isDeleted: input.action === "delete" ? true : input.payload.isDeleted === true,
  };

  // Same row par purana pending op replace — sirf latest delta upload ho
  db.prepare(
    `DELETE FROM cloud_sync_outbox WHERE company_id = ? AND table_name = ? AND row_id = ? AND synced_at IS NULL`
  ).run(companyId, table, rowId);

  db.prepare(
    `INSERT INTO cloud_sync_outbox(op_id, company_id, device_id, table_name, action, row_id, updated_at, op_seq, payload, synced_at)
     VALUES(?,?,?,?,?,?,?,?,?,NULL)`
  ).run(
    opId,
    companyId,
    deviceId,
    table,
    input.action,
    rowId,
    updatedAt,
    opSeq,
    JSON.stringify(payload)
  );

  logLocalCloudSync("enqueued", { companyId, table, action: input.action, rowId, opSeq });
}

export async function listPendingLocalCloudSyncOps(companyId: string): Promise<LocalCloudSyncOperation[]> {
  const db = await getBrowserDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT op_id, company_id, device_id, table_name, action, row_id, updated_at, op_seq, payload
       FROM cloud_sync_outbox
       WHERE company_id = ? AND synced_at IS NULL
       ORDER BY op_seq ASC`
    )
    .all(companyId) as Array<{
    op_id: string;
    company_id: string;
    device_id: string;
    table_name: string;
    action: string;
    row_id: string;
    updated_at: number;
    op_seq: number;
    payload: string;
  }>;

  return rows.map((r) => ({
    opId: r.op_id,
    companyId: r.company_id,
    deviceId: r.device_id,
    table: r.table_name,
    action: r.action as CloudSyncAction,
    rowId: r.row_id,
    updatedAt: Number(r.updated_at) || 0,
    opSeq: Number(r.op_seq) || 0,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  }));
}

export async function markLocalCloudSyncOpsSynced(companyId: string, throughOpSeq: number): Promise<void> {
  const db = await getBrowserDb();
  if (!db) return;
  const now = Date.now();
  db.prepare(
    `UPDATE cloud_sync_outbox SET synced_at = ? WHERE company_id = ? AND synced_at IS NULL AND op_seq <= ?`
  ).run(now, companyId, throughOpSeq);
}

/** Single op — upload ke turant baad mark (batch gap / cursor bug se bachao). */
export async function markLocalCloudSyncOpSynced(companyId: string, opSeq: number): Promise<void> {
  const db = await getBrowserDb();
  if (!db) return;
  const seq = Number(opSeq);
  if (!Number.isFinite(seq) || seq <= 0) return;
  const now = Date.now();
  db.prepare(
    `UPDATE cloud_sync_outbox SET synced_at = ? WHERE company_id = ? AND op_seq = ? AND synced_at IS NULL`
  ).run(now, companyId, seq);
}

export async function countPendingLocalCloudSyncOps(companyId: string): Promise<number> {
  const db = await getBrowserDb();
  if (!db) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM cloud_sync_outbox WHERE company_id = ? AND synced_at IS NULL`)
    .get(companyId) as { c: number } | undefined;
  return Number(row?.c) || 0;
}

export async function getCloudSyncCursor(companyId: string): Promise<{
  lastLocalOpSeq: number;
  lastSyncedOp: number;
  lastSyncAt: number | null;
}> {
  const meta = await ensureMetaRow(companyId);
  return {
    lastLocalOpSeq: Number(meta.last_local_op_seq) || 0,
    lastSyncedOp: Number(meta.last_synced_op) || 0,
    lastSyncAt: meta.last_sync_at ?? null,
  };
}

export async function setCloudSyncCursor(
  companyId: string,
  patch: Partial<{ lastSyncedOp: number; lastSyncAt: number; syncStatus: string; lastError: string | null }>
): Promise<void> {
  const db = await getBrowserDb();
  if (!db) return;
  await ensureMetaRow(companyId);
  if (patch.lastSyncedOp != null) {
    db.prepare(`UPDATE cloud_sync_meta SET last_synced_op = ? WHERE company_id = ?`).run(patch.lastSyncedOp, companyId);
  }
  if (patch.lastSyncAt != null) {
    db.prepare(`UPDATE cloud_sync_meta SET last_sync_at = ? WHERE company_id = ?`).run(patch.lastSyncAt, companyId);
  }
  if (patch.syncStatus != null) {
    db.prepare(`UPDATE cloud_sync_meta SET sync_status = ? WHERE company_id = ?`).run(patch.syncStatus, companyId);
  }
  if (patch.lastError !== undefined) {
    db.prepare(`UPDATE cloud_sync_meta SET last_error = ? WHERE company_id = ?`).run(patch.lastError, companyId);
  }
}

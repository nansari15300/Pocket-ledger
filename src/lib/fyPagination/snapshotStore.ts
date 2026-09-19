"use client";

import { getBrowserDbForCompanyId, type BrowserDbWrapper } from "@/lib/localSqlite";
import { beforeMsFromOpeningBoundaryKey } from "@/lib/fyPagination/openingBoundaryKeys";
import type { FyBalanceSnapshot, FyPeriodKind } from "@/lib/fyPagination/types";

function ensureFyPaginationTables(db: BrowserDbWrapper): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fy_balance_snapshots (
      company_id TEXT NOT NULL,
      period_kind TEXT NOT NULL,
      period_key TEXT NOT NULL,
      closing_at_ms INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      updatedAt INTEGER,
      PRIMARY KEY (company_id, period_kind, period_key)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS fy_loaded_ranges (
      company_id TEXT NOT NULL,
      from_ms INTEGER NOT NULL,
      to_ms INTEGER NOT NULL,
      fy_key TEXT,
      loaded_at_ms INTEGER NOT NULL,
      PRIMARY KEY (company_id, from_ms, to_ms)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS fy_archive_meta (
      company_id TEXT NOT NULL,
      fy_key TEXT NOT NULL,
      archived_at_ms INTEGER NOT NULL,
      PRIMARY KEY (company_id, fy_key)
    )
  `);
}

export async function readFyBalanceSnapshot(
  companyId: string,
  periodKind: FyPeriodKind,
  periodKey: string
): Promise<FyBalanceSnapshot | null> {
  if (typeof window === "undefined" || !companyId || !periodKey) return null;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return null;
  ensureFyPaginationTables(db);
  try {
    const row = db
      .prepare(
        `SELECT closing_at_ms, snapshot_json, updatedAt
         FROM fy_balance_snapshots
         WHERE company_id = ? AND period_kind = ? AND period_key = ?`
      )
      .get(companyId, periodKind, periodKey) as
      | { closing_at_ms?: number; snapshot_json?: string; updatedAt?: number }
      | undefined;
    if (!row?.snapshot_json) return null;
    const parsed = JSON.parse(row.snapshot_json) as { balances?: Record<string, number> };
    return {
      companyId,
      periodKind,
      periodKey,
      closingAtMs: Number(row.closing_at_ms) || 0,
      balances: parsed.balances ?? {},
      updatedAtMs: Number(row.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function writeFyBalanceSnapshot(snapshot: FyBalanceSnapshot): Promise<void> {
  if (typeof window === "undefined" || !snapshot.companyId) return;
  const db = await getBrowserDbForCompanyId(snapshot.companyId);
  if (!db) return;
  ensureFyPaginationTables(db);
  const now = Date.now();
  db.prepare(
    `INSERT INTO fy_balance_snapshots(company_id, period_kind, period_key, closing_at_ms, snapshot_json, updatedAt)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(company_id, period_kind, period_key) DO UPDATE SET
       closing_at_ms = excluded.closing_at_ms,
       snapshot_json = excluded.snapshot_json,
       updatedAt = excluded.updatedAt`
  ).run(
    snapshot.companyId,
    snapshot.periodKind,
    snapshot.periodKey,
    snapshot.closingAtMs,
    JSON.stringify({ balances: snapshot.balances }),
    now
  );
}

export async function recordFyLoadedRange(
  companyId: string,
  fromMs: number,
  toMs: number,
  fyKey?: string | null
): Promise<void> {
  if (typeof window === "undefined" || !companyId) return;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return;
  ensureFyPaginationTables(db);
  db.prepare(
    `INSERT OR REPLACE INTO fy_loaded_ranges(company_id, from_ms, to_ms, fy_key, loaded_at_ms)
     VALUES(?,?,?,?,?)`
  ).run(companyId, fromMs, toMs, fyKey ?? null, Date.now());
}

export async function listFyBalanceSnapshotPeriodKeys(
  companyId: string,
  periodKind: FyPeriodKind
): Promise<string[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];
  ensureFyPaginationTables(db);
  try {
    const rows = db
      .prepare(
        `SELECT period_key FROM fy_balance_snapshots WHERE company_id = ? AND period_kind = ? ORDER BY period_key ASC`
      )
      .all(companyId, periodKind) as Array<{ period_key?: string }>;
    return rows.map((r) => String(r.period_key || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function deleteFyBalanceSnapshot(
  companyId: string,
  periodKind: FyPeriodKind,
  periodKey: string
): Promise<void> {
  if (typeof window === "undefined" || !companyId || !periodKey) return;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return;
  ensureFyPaginationTables(db);
  db.prepare(
    `DELETE FROM fy_balance_snapshots WHERE company_id = ? AND period_kind = ? AND period_key = ?`
  ).run(companyId, periodKind, periodKey);
}

export async function invalidateAllLocalOpeningSnapshots(companyId: string): Promise<void> {
  if (typeof window === "undefined" || !companyId) return;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return;
  ensureFyPaginationTables(db);
  db.prepare(`DELETE FROM fy_balance_snapshots WHERE company_id = ?`).run(companyId);
}

export async function invalidateLocalOpeningSnapshotsAfterMs(
  companyId: string,
  afterMs: number
): Promise<void> {
  if (typeof window === "undefined" || !companyId || !Number.isFinite(afterMs)) return;
  const monthKeys = await listFyBalanceSnapshotPeriodKeys(companyId, "month");
  for (const key of monthKeys) {
    const beforeMs = beforeMsFromOpeningBoundaryKey(key);
    if (beforeMs != null && beforeMs > afterMs) {
      await deleteFyBalanceSnapshot(companyId, "month", key);
    }
  }
  const fyKeys = await listFyBalanceSnapshotPeriodKeys(companyId, "fy");
  for (const key of fyKeys) {
    await deleteFyBalanceSnapshot(companyId, "fy", key);
  }
}

export async function listFyLoadedRanges(companyId: string): Promise<Array<{ fromMs: number; toMs: number; fyKey?: string | null }>> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];
  ensureFyPaginationTables(db);
  try {
    const rows = db
      .prepare(`SELECT from_ms, to_ms, fy_key FROM fy_loaded_ranges WHERE company_id = ? ORDER BY from_ms ASC`)
      .all(companyId) as Array<{ from_ms?: number; to_ms?: number; fy_key?: string | null }>;
    return rows.map((r) => ({
      fromMs: Number(r.from_ms) || 0,
      toMs: Number(r.to_ms) || 0,
      fyKey: r.fy_key ?? null,
    }));
  } catch {
    return [];
  }
}

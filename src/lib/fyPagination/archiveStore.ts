"use client";

import { getBrowserDbForCompanyId, type BrowserDbWrapper } from "@/lib/localSqlite";

function ensureArchiveTable(db: BrowserDbWrapper): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fy_archive_meta (
      company_id TEXT NOT NULL,
      fy_key TEXT NOT NULL,
      archived_at_ms INTEGER NOT NULL,
      PRIMARY KEY (company_id, fy_key)
    )
  `);
}

export async function markFyArchived(companyId: string, fyKey: string): Promise<void> {
  if (typeof window === "undefined" || !companyId || !fyKey) return;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return;
  ensureArchiveTable(db);
  db.prepare(
    `INSERT OR REPLACE INTO fy_archive_meta(company_id, fy_key, archived_at_ms) VALUES(?,?,?)`
  ).run(companyId, fyKey, Date.now());
}

export async function listArchivedFyKeys(companyId: string): Promise<string[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];
  ensureArchiveTable(db);
  try {
    const rows = db
      .prepare(`SELECT fy_key FROM fy_archive_meta WHERE company_id = ? ORDER BY fy_key ASC`)
      .all(companyId) as Array<{ fy_key?: string }>;
    return rows.map((r) => String(r.fy_key || "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function isFyArchived(companyId: string, fyKey: string): Promise<boolean> {
  if (typeof window === "undefined" || !companyId || !fyKey) return false;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return false;
  ensureArchiveTable(db);
  try {
    const row = db
      .prepare(`SELECT 1 AS ok FROM fy_archive_meta WHERE company_id = ? AND fy_key = ? LIMIT 1`)
      .get(companyId, fyKey) as { ok?: number } | undefined;
    return Boolean(row?.ok);
  } catch {
    return false;
  }
}

export async function clearFyArchived(companyId: string, fyKey: string): Promise<void> {
  if (typeof window === "undefined" || !companyId || !fyKey) return;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return;
  ensureArchiveTable(db);
  db.prepare(`DELETE FROM fy_archive_meta WHERE company_id = ? AND fy_key = ?`).run(companyId, fyKey);
}

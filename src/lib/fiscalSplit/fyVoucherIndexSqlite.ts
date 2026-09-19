"use client";

import { getBrowserDbForCompanyId, type BrowserDbWrapper } from "@/lib/localSqlite";
import {
  buildFyVoucherIndexFromKeys,
  normalizeFyVoucherIndex,
  type FyVoucherIndex,
} from "@/lib/fiscalSplit/fyVoucherIndexTypes";

function ensureFyVoucherIndexTable(db: BrowserDbWrapper): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fy_voucher_index (
      company_id TEXT PRIMARY KEY,
      index_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    )
  `);
}

export async function readFyVoucherIndexFromSqlite(
  companyId: string
): Promise<FyVoucherIndex | null> {
  if (typeof window === "undefined" || !companyId) return null;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return null;
  ensureFyVoucherIndexTable(db);
  try {
    const row = db
      .prepare(`SELECT index_json FROM fy_voucher_index WHERE company_id = ?`)
      .get(companyId) as { index_json?: string } | undefined;
    if (!row?.index_json) return null;
    return normalizeFyVoucherIndex(JSON.parse(row.index_json));
  } catch {
    return null;
  }
}

export async function writeFyVoucherIndexToSqlite(
  companyId: string,
  index: FyVoucherIndex
): Promise<void> {
  if (typeof window === "undefined" || !companyId) return;
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return;
  ensureFyVoucherIndexTable(db);
  db.prepare(
    `INSERT INTO fy_voucher_index(company_id, index_json, updated_at_ms)
     VALUES(?,?,?)
     ON CONFLICT(company_id) DO UPDATE SET
       index_json = excluded.index_json,
       updated_at_ms = excluded.updated_at_ms`
  ).run(companyId, JSON.stringify(index), index.updatedAtMs);
}

export async function writeFyVoucherIndexKeysToSqlite(
  companyId: string,
  fyKeys: string[],
  minDateMs: number | null = null,
  maxDateMs: number | null = null
): Promise<FyVoucherIndex> {
  const index = buildFyVoucherIndexFromKeys(fyKeys, minDateMs, maxDateMs);
  await writeFyVoucherIndexToSqlite(companyId, index);
  return index;
}

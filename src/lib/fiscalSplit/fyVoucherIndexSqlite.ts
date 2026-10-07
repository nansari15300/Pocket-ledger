"use client";

import { startOfDay } from "date-fns";
import type { CompanyFiscalYearDates } from "@/lib/fiscalRange";
import { getBrowserDbForCompanyId, type BrowserDbWrapper } from "@/lib/localSqlite";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { parseLikelyBsVoucherDate, parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import {
  buildFyVoucherIndexFromKeys,
  normalizeFyVoucherIndex,
  type FyVoucherIndex,
} from "@/lib/fiscalSplit/fyVoucherIndexTypes";

const FY_DOC_SCAN_PAGE_SIZE = 30;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function voucherDateForFyIndex(raw: unknown, country?: string): Date | null {
  if (String(country || "").trim().toLowerCase() === "nepal") {
    const bsDate = parseLikelyBsVoucherDate(raw);
    if (bsDate) return bsDate;
  }
  return parseFirestoreDateFieldToJsDate(raw);
}

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
  if (!db) {
    console.info("[FY-SCAN] sqlite cache unavailable", { companyId });
    return null;
  }
  ensureFyVoucherIndexTable(db);
  try {
    const row = db
      .prepare(`SELECT index_json FROM fy_voucher_index WHERE company_id = ?`)
      .get(companyId) as { index_json?: string } | undefined;
    if (!row?.index_json) {
      console.info("[FY-SCAN] sqlite cache miss", { companyId });
      return null;
    }
    const rawIndex = JSON.parse(row.index_json) as unknown;
    const index = normalizeFyVoucherIndex(rawIndex);
    const rawKeys =
      rawIndex && typeof rawIndex === "object" && Array.isArray((rawIndex as { fyKeys?: unknown }).fyKeys)
        ? ((rawIndex as { fyKeys: unknown[] }).fyKeys.map((key) => String(key ?? "").trim()))
        : [];
    if (index && JSON.stringify(rawKeys) !== JSON.stringify(index.fyKeys)) {
      await writeFyVoucherIndexToSqlite(companyId, index);
      console.info("[FY-SCAN] repaired sqlite cache keys", {
        companyId,
        retainedFyKeyCount: index.fyKeys.length,
        keys: index.fyKeys.slice(0, 16),
      });
    }
    console.info(index?.fyKeys.length ? "[FY-SCAN] sqlite cache hit" : "[FY-SCAN] sqlite cache invalid", {
      companyId,
      fyKeyCount: index?.fyKeys.length ?? 0,
      keys: index?.fyKeys.slice(0, 16) ?? [],
      updatedAtMs: index?.updatedAtMs ?? null,
    });
    return index;
  } catch (err) {
    console.warn("[FY-SCAN] sqlite cache read failed", { companyId, err });
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
  console.info("[FY-SCAN] sqlite cache saved", {
    companyId,
    fyKeyCount: index.fyKeys.length,
    keys: index.fyKeys.slice(0, 16),
    minDateMs: index.minDateMs,
    maxDateMs: index.maxDateMs,
  });
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

/**
 * Recover an FY index from legacy voucher rows whose date projection is missing.
 * SQL extracts only `date` and `isDeleted`; full `company_docs.data` is never
 * returned to JavaScript, so attachment URLs/inline payloads are not parsed here.
 */
export async function rebuildFyVoucherIndexFromCompanyDocs(params: {
  companyId: string;
  country?: string;
  companyDates?: CompanyFiscalYearDates | null;
  onProgress?: (scanned: number, total: number) => void;
}): Promise<FyVoucherIndex> {
  const { companyId, country, companyDates, onProgress } = params;
  if (typeof window === "undefined" || !companyId) return buildFyVoucherIndexFromKeys([]);

  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return buildFyVoucherIndexFromKeys([]);

  try {
    const keys = new Set<string>();
    let minDateMs: number | null = null;
    let maxDateMs: number | null = null;
    let scanned = 0;
    let lastId: string | null = null;

    while (true) {
      const rows = (lastId == null
        ? db
            .prepare(
              `SELECT id,
                      json_extract(data, '$.date') AS voucher_date,
                      json_extract(data, '$.isDeleted') AS is_deleted
               FROM company_docs
               WHERE company_id = ? AND collection = 'vouchers'
               ORDER BY id ASC LIMIT ?`
            )
            .all(companyId, FY_DOC_SCAN_PAGE_SIZE)
        : db
            .prepare(
              `SELECT id,
                      json_extract(data, '$.date') AS voucher_date,
                      json_extract(data, '$.isDeleted') AS is_deleted
               FROM company_docs
               WHERE company_id = ? AND collection = 'vouchers' AND id > ?
               ORDER BY id ASC LIMIT ?`
            )
            .all(companyId, lastId, FY_DOC_SCAN_PAGE_SIZE)) as Array<{
        id: string;
        voucher_date?: unknown;
        is_deleted?: unknown;
      }>;
      if (!rows.length) break;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        lastId = row.id;
        scanned += 1;
        try {
          if (row.is_deleted === true || row.is_deleted === 1) continue;
          let rawDate = row.voucher_date;
          if (typeof rawDate === "string" && /^[\s]*[\[{]/.test(rawDate)) {
            try {
              rawDate = JSON.parse(rawDate) as unknown;
            } catch {
              // Malformed JSON date object; ignore this row.
              continue;
            }
          }
          const date = voucherDateForFyIndex(rawDate, country);
          if (!date) continue;
          const dateMs = startOfDay(date).getTime();
          minDateMs = minDateMs == null ? dateMs : Math.min(minDateMs, dateMs);
          maxDateMs = maxDateMs == null ? dateMs : Math.max(maxDateMs, dateMs);
          keys.add(getAnusuchi13FyKey(country, date, companyDates));
        } catch {
          // Skip malformed mirror rows and continue the paged scan.
        }
        if (i > 0 && i % 10 === 0) await yieldToUi();
      }

      // Avoid a synchronous full-table COUNT(*) before this paged recovery scan.
      onProgress?.(scanned, 0);
      console.info("[FY-SCAN] SQLite date-only recovery page", {
        companyId,
        scanned,
        fyKeyCount: keys.size,
        lastId: lastId?.slice(0, 48) ?? null,
      });
      await yieldToUi();
      if (rows.length < FY_DOC_SCAN_PAGE_SIZE) break;
    }

    const index = buildFyVoucherIndexFromKeys([...keys], minDateMs, maxDateMs);
    if (index.fyKeys.length) await writeFyVoucherIndexToSqlite(companyId, index);
    console.info("[FY-SCAN] SQLite date-only recovery done", {
      companyId,
      scanned,
      fyKeyCount: index.fyKeys.length,
      keys: index.fyKeys.slice(0, 16),
    });
    return index;
  } catch (err) {
    console.warn("[FY-SCAN] SQLite date-only recovery failed", {
      companyId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return buildFyVoucherIndexFromKeys([]);
  }
}

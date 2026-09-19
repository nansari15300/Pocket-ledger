"use client";

import { deserializeLocalDbValue } from "@/lib/localCompanyDocMirror";
import { getBrowserDbForCompanyId } from "@/lib/localSqlite";
import type { FyDateRangeMs } from "@/lib/fyPagination/types";

export type FyVoucherQueryOptions = {
  forBackupMerge?: boolean;
  includeSoftDeleted?: boolean;
};

function parseVoucherRow(
  row: { id: string; data: string },
  options?: FyVoucherQueryOptions
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(row.data) as Record<string, unknown>;
    const data = deserializeLocalDbValue(parsed) as Record<string, unknown>;
    if (!options?.includeSoftDeleted && !options?.forBackupMerge && data.isDeleted === true) {
      return null;
    }
    return { ...data, id: row.id };
  } catch {
    return null;
  }
}

/** Vouchers in [fromMs, toMs] via projection index — avoids full table scan parse. */
export async function listVouchersFromBrowserDbByDateRange(
  companyId: string,
  range: FyDateRangeMs,
  options?: FyVoucherQueryOptions
): Promise<any[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT cd.id, cd.data
       FROM company_docs cd
       INNER JOIN company_docs_projection p
         ON cd.company_id = p.company_id AND cd.collection = p.collection AND cd.id = p.id
       WHERE cd.company_id = ? AND cd.collection = 'vouchers'
         AND p.doc_date_ms IS NOT NULL
         AND p.doc_date_ms >= ? AND p.doc_date_ms <= ?
       ORDER BY p.doc_date_ms ASC`
    )
    .all(companyId, range.fromMs, range.toMs) as Array<{ id: string; data: string }>;

  const out: any[] = [];
  for (const row of rows) {
    const doc = parseVoucherRow(row, options);
    if (doc) out.push(doc);
  }
  return out;
}

/** IDs of vouchers in range without loading full JSON (for link hints). */
export async function listVoucherIdsInDateRange(
  companyId: string,
  range: FyDateRangeMs
): Promise<string[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT id FROM company_docs_projection
         WHERE company_id = ? AND collection = 'vouchers'
           AND doc_date_ms IS NOT NULL
           AND doc_date_ms >= ? AND doc_date_ms <= ?`
      )
      .all(companyId, range.fromMs, range.toMs) as Array<{ id?: string }>;
    return rows.map((r) => String(r.id || "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function countVouchersInDateRange(companyId: string, range: FyDateRangeMs): Promise<number> {
  const ids = await listVoucherIdsInDateRange(companyId, range);
  return ids.length;
}

"use client";

import { getBrowserDbForCompanyId } from "@/lib/localSqlite";
import type { CompanyFiscalYearDates } from "@/lib/fiscalRange";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { markFyArchived, listArchivedFyKeys } from "@/lib/fyPagination/archiveStore";
import { runningFyKey } from "@/lib/fyPagination/periodBounds";

export type FyKeySqliteScanProgress = {
  phase: "span" | "page_scan";
  scanned: number;
  total: number;
  minDateMs?: number | null;
  maxDateMs?: number | null;
};

const FY_KEY_SCAN_PAGE = 250;
/** Safety: never walk more than this many FY steps when filling gaps elsewhere. */
export const FY_KEY_FILL_MAX_STEPS = 80;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    // setTimeout(0) is more reliable than rAF alone when the tab is busy.
    setTimeout(resolve, 0);
  });
}

function fyScanLog(...args: unknown[]) {
  try {
    console.info("[FY-SCAN]", ...args);
  } catch {
    /* ignore */
  }
}

/**
 * Distinct FY keys with vouchers — paginated projection scan (not one giant `.all()`).
 * Yields every page so FY settings / company switch stay clickable.
 */
export async function listFyKeysWithVouchersInSqlite(
  companyId: string,
  country?: string,
  companyDates?: CompanyFiscalYearDates | null,
  onProgress?: (progress: FyKeySqliteScanProgress) => void
): Promise<string[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) {
    fyScanLog("no sqlite db", { companyId });
    return [];
  }
  try {
    await yieldToUi();

    // `company_docs_projection` has a composite primary key on
    // (company_id, collection, id). Keyset pagination uses that index and
    // avoids OFFSET rescanning every earlier voucher for each page.
    const firstPageSql = `SELECT id, doc_date_ms FROM company_docs_projection
       WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL
       ORDER BY id ASC
       LIMIT ?`;
    const nextPageSql = `SELECT id, doc_date_ms FROM company_docs_projection
       WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL AND id > ?
       ORDER BY id ASC
       LIMIT ?`;

    const keys = new Set<string>();
    let lastId: string | null = null;
    let scanned = 0;
    let minDateMs: number | null = null;
    let maxDateMs: number | null = null;
    while (true) {
      // `.all()` frees its SQL.js statement, so prepare a fresh one per page.
      const rows = (lastId == null
        ? db.prepare(firstPageSql).all(companyId, FY_KEY_SCAN_PAGE)
        : db.prepare(nextPageSql).all(companyId, lastId, FY_KEY_SCAN_PAGE)) as Array<{
        id?: string;
        doc_date_ms?: number;
      }>;
      if (!rows.length) break;

      const pageMs: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        const ms = Number(rows[i]?.doc_date_ms);
        if (Number.isFinite(ms)) {
          pageMs.push(ms);
          minDateMs = minDateMs == null ? ms : Math.min(minDateMs, ms);
          maxDateMs = maxDateMs == null ? ms : Math.max(maxDateMs, ms);
        }
      }

      for (let i = 0; i < pageMs.length; i++) {
        keys.add(getAnusuchi13FyKey(country, new Date(pageMs[i]), companyDates));
        // Yield inside large pages so FY key math does not freeze UI.
        if (i > 0 && i % 100 === 0) await yieldToUi();
      }

      scanned += rows.length;
      lastId = String(rows[rows.length - 1]?.id ?? "");
      onProgress?.({
        phase: "page_scan",
        scanned,
        // Exact COUNT(*) would synchronously walk the full SQL.js index before
        // scanning; keep progress responsive and report the checked count only.
        total: 0,
        minDateMs,
        maxDateMs,
      });
      await yieldToUi();

      if (rows.length < FY_KEY_SCAN_PAGE) break;
      if (rows[rows.length - 1]?.id == null) {
        fyScanLog("page scan missing cursor id", { companyId, scanned });
        break;
      }
    }

    const sorted = [...keys].sort((a, b) => {
      const aStart = Number(a.split("-")[0]) || 0;
      const bStart = Number(b.split("-")[0]) || 0;
      return aStart - bStart;
    });
    fyScanLog("page scan done", {
      companyId,
      scanned,
      distinctFyKeys: sorted.length,
      minDateMs,
      maxDateMs,
      keys: sorted.slice(0, 12),
    });
    return sorted;
  } catch (err) {
    fyScanLog("listFyKeysWithVouchersInSqlite failed", err);
    return [];
  }
}

/**
 * Mark every FY except the running FY as archived (cold meta only — data stays in SQLite).
 */
export async function bootstrapArchivePriorFyKeys(params: {
  companyId: string;
  country?: string;
  companyDates?: CompanyFiscalYearDates | null;
  today?: Date;
}): Promise<string[]> {
  const { companyId, country, companyDates, today = new Date() } = params;
  const current = runningFyKey(country, today);
  const allKeys = await listFyKeysWithVouchersInSqlite(companyId, country, companyDates);
  const archived: string[] = [];
  for (const fyKey of allKeys) {
    if (fyKey === current) continue;
    await markFyArchived(companyId, fyKey);
    archived.push(fyKey);
  }
  return archived;
}

export async function listColdFyKeysForLinkScan(
  companyId: string,
  country?: string,
  today = new Date(),
  companyDates?: CompanyFiscalYearDates | null
): Promise<string[]> {
  const archived = await listArchivedFyKeys(companyId);
  if (archived.length) return archived;
  const current = runningFyKey(country, today);
  const all = await listFyKeysWithVouchersInSqlite(companyId, country, companyDates);
  return all.filter((k) => k !== current);
}

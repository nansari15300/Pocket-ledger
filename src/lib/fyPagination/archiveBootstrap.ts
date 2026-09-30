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
    onProgress?.({ phase: "span", scanned: 0, total: 0 });
    const span = db
      .prepare(
        `SELECT MIN(doc_date_ms) AS min_ms, MAX(doc_date_ms) AS max_ms, COUNT(*) AS cnt
         FROM company_docs_projection
         WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL`
      )
      .get(companyId) as { min_ms?: number; max_ms?: number; cnt?: number } | undefined;

    const minMs =
      span?.min_ms != null && Number.isFinite(Number(span.min_ms)) ? Number(span.min_ms) : null;
    const maxMs =
      span?.max_ms != null && Number.isFinite(Number(span.max_ms)) ? Number(span.max_ms) : null;
    const totalApprox = span?.cnt != null && Number.isFinite(Number(span.cnt)) ? Number(span.cnt) : 0;

    fyScanLog("projection span", {
      companyId,
      minMs,
      maxMs,
      totalApprox,
      country: country || null,
      hasCompanyDates: Boolean(companyDates?.fiscalYearStart && companyDates?.fiscalYearEnd),
    });

    if (minMs == null || maxMs == null || totalApprox <= 0) {
      // Projection may lag behind full voucher docs — try a light count without date filter.
      const anyVoucher = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM company_docs_projection
           WHERE company_id = ? AND collection = 'vouchers'`
        )
        .get(companyId) as { cnt?: number } | undefined;
      fyScanLog("no dated projection rows", {
        companyId,
        undatedCount: Number(anyVoucher?.cnt) || 0,
      });
      return [];
    }

    await yieldToUi();

    const pageSql = `SELECT doc_date_ms FROM company_docs_projection
       WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL
       ORDER BY doc_date_ms ASC
       LIMIT ? OFFSET ?`;

    const keys = new Set<string>();
    let offset = 0;
    let scanned = 0;
    while (true) {
      // BrowserDbWrapper.prepare().all() frees the sql.js statement in `finally` —
      // never reuse one prepare() across pages (throws "Statement closed").
      const liveDb = await getBrowserDbForCompanyId(companyId);
      if (!liveDb) {
        fyScanLog("db missing mid-scan", { companyId, offset, scanned });
        break;
      }
      const rows = liveDb.prepare(pageSql).all(companyId, FY_KEY_SCAN_PAGE, offset) as Array<{
        doc_date_ms?: number;
      }>;
      if (!rows.length) break;

      const pageMs: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        const ms = Number(rows[i]?.doc_date_ms);
        if (Number.isFinite(ms)) pageMs.push(ms);
      }

      for (let i = 0; i < pageMs.length; i++) {
        keys.add(getAnusuchi13FyKey(country, new Date(pageMs[i]), companyDates));
        // Yield inside large pages so FY key math does not freeze UI.
        if (i > 0 && i % 100 === 0) await yieldToUi();
      }

      scanned += rows.length;
      offset += rows.length;
      onProgress?.({
        phase: "page_scan",
        scanned,
        total: Math.max(totalApprox, scanned),
      });
      await yieldToUi();

      if (rows.length < FY_KEY_SCAN_PAGE) break;
      // Hard stop — corrupt offset loops
      if (offset > totalApprox + FY_KEY_SCAN_PAGE * 2) {
        fyScanLog("page scan safety break", { offset, totalApprox });
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

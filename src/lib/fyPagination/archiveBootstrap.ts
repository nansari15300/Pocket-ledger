"use client";

import { endOfDay, startOfDay } from "date-fns";
import { getBrowserDbForCompanyId } from "@/lib/localSqlite";
import type { CompanyFiscalYearDates } from "@/lib/fiscalRange";
import { getAnusuchi13FyKey, getFiscalRangeForFyKey } from "@/lib/reports/anusuchi13Confirmation";
import { markFyArchived, listArchivedFyKeys } from "@/lib/fyPagination/archiveStore";
import { runningFyKey } from "@/lib/fyPagination/periodBounds";

export type FyKeySqliteScanProgress = {
  phase: "span" | "fy_probe";
  scanned: number;
  total: number;
};

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function nextFyKey(fyKey: string): string | null {
  const parts = fyKey.split("-").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return `${parts[0] + 1}-${parts[1] + 1}`;
}

function fillFyKeysBetween(sortedVoucherKeys: string[]): string[] {
  if (!sortedVoucherKeys.length) return [];
  const out: string[] = [sortedVoucherKeys[0]];
  for (let i = 1; i < sortedVoucherKeys.length; i++) {
    const target = sortedVoucherKeys[i];
    let cursor = out[out.length - 1];
    while (cursor !== target) {
      const next = nextFyKey(cursor);
      if (!next || next === cursor) break;
      out.push(next);
      cursor = next;
    }
    if (out[out.length - 1] !== target) out.push(target);
  }
  return out;
}

/**
 * Distinct FY keys with vouchers — O(FY years), not O(all vouchers).
 * MIN/MAX date span → candidate FY keys → EXISTS probe per year (indexed).
 * Yields between probes so Settings / company switch stay responsive.
 */
export async function listFyKeysWithVouchersInSqlite(
  companyId: string,
  country?: string,
  companyDates?: CompanyFiscalYearDates | null,
  onProgress?: (progress: FyKeySqliteScanProgress) => void
): Promise<string[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];
  try {
    onProgress?.({ phase: "span", scanned: 0, total: 0 });
    const span = db
      .prepare(
        `SELECT MIN(doc_date_ms) AS min_ms, MAX(doc_date_ms) AS max_ms
         FROM company_docs_projection
         WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL`
      )
      .get(companyId) as { min_ms?: number; max_ms?: number } | undefined;

    const minMs =
      span?.min_ms != null && Number.isFinite(Number(span.min_ms)) ? Number(span.min_ms) : null;
    const maxMs =
      span?.max_ms != null && Number.isFinite(Number(span.max_ms)) ? Number(span.max_ms) : null;
    if (minMs == null || maxMs == null) return [];

    await yieldToUi();

    const startKey = getAnusuchi13FyKey(country, new Date(minMs), companyDates);
    const endKey = getAnusuchi13FyKey(country, new Date(maxMs), companyDates);
    const candidates = fillFyKeysBetween(
      [startKey, endKey].sort((a, b) => {
        const aStart = Number(a.split("-")[0]) || 0;
        const bStart = Number(b.split("-")[0]) || 0;
        return aStart - bStart;
      })
    );

    const existsStmt = db.prepare(
      `SELECT 1 AS ok
       FROM company_docs_projection
       WHERE company_id = ?
         AND collection = 'vouchers'
         AND doc_date_ms IS NOT NULL
         AND doc_date_ms >= ?
         AND doc_date_ms <= ?
       LIMIT 1`
    );

    const withTxn: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const fyKey = candidates[i];
      const { start, end } = getFiscalRangeForFyKey(country, fyKey, companyDates);
      const fromMs = startOfDay(start).getTime();
      const toMs = endOfDay(end).getTime();
      const hit = existsStmt.get(companyId, fromMs, toMs) as { ok?: number } | undefined;
      if (hit) withTxn.push(fyKey);
      onProgress?.({ phase: "fy_probe", scanned: i + 1, total: candidates.length });
      await yieldToUi();
    }

    return withTxn.sort((a, b) => {
      const aStart = Number(a.split("-")[0]) || 0;
      const bStart = Number(b.split("-")[0]) || 0;
      return aStart - bStart;
    });
  } catch {
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

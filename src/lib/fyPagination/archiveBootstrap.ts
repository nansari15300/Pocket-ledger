"use client";

import { getBrowserDbForCompanyId } from "@/lib/localSqlite";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { markFyArchived, listArchivedFyKeys } from "@/lib/fyPagination/archiveStore";
import { runningFyKey } from "@/lib/fyPagination/periodBounds";

const FY_KEY_SCAN_YIELD_EVERY = 1500;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/** Distinct FY keys present in voucher projection index. */
export async function listFyKeysWithVouchersInSqlite(
  companyId: string,
  country?: string
): Promise<string[]> {
  if (typeof window === "undefined" || !companyId) return [];
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT doc_date_ms FROM company_docs_projection
         WHERE company_id = ? AND collection = 'vouchers' AND doc_date_ms IS NOT NULL`
      )
      .all(companyId) as Array<{ doc_date_ms?: number }>;
    const keys = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const ms = Number(rows[i]?.doc_date_ms);
      if (Number.isFinite(ms)) {
        keys.add(getAnusuchi13FyKey(country, new Date(ms)));
      }
      // Large ledgers: yield so Settings → Fiscal year UI stays responsive.
      if (i > 0 && i % FY_KEY_SCAN_YIELD_EVERY === 0) {
        await yieldToUi();
      }
    }
    return [...keys].sort();
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
  today?: Date;
}): Promise<string[]> {
  const { companyId, country, today = new Date() } = params;
  const current = runningFyKey(country, today);
  const allKeys = await listFyKeysWithVouchersInSqlite(companyId, country);
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
  today = new Date()
): Promise<string[]> {
  const archived = await listArchivedFyKeys(companyId);
  if (archived.length) return archived;
  const current = runningFyKey(country, today);
  const all = await listFyKeysWithVouchersInSqlite(companyId, country);
  return all.filter((k) => k !== current);
}

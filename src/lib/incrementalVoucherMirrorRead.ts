"use client";

/**
 * Voucher mirror reads are substantially larger than master lists.  Reading every
 * JSON document in one synchronous loop can block the browser long enough for a
 * Page Unresponsive prompt.  Keep the SQL result and output identical to the
 * normal mirror reader, but yield between short JSON revival slices.
 */
import { deserializeLocalDbValue, listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getBrowserDbForCompanyId } from "@/lib/localSqlite";
import { yieldToMain } from "@/lib/yieldToMain";

const VOUCHER_READ_BATCH_SIZE = 24;
const VOUCHER_READ_SLICE_MS = 8;

type RawVoucherRow = { id: string; data: string };
type VoucherMirrorSignature = { count: number; newestUpdatedAt: number };

const inFlightReads = new Map<string, Promise<any[]>>();

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function readVoucherMirrorSignature(db: Awaited<ReturnType<typeof getBrowserDbForCompanyId>>, companyId: string): VoucherMirrorSignature {
  const row = db
    ?.prepare(
      `SELECT COUNT(*) AS count, MAX(COALESCE(updatedAt, 0)) AS newest_updated_at
       FROM company_docs
       WHERE company_id = ? AND collection = 'vouchers'`
    )
    .get(companyId) as { count?: number; newest_updated_at?: number } | undefined;
  return {
    count: Math.max(0, Number(row?.count) || 0),
    newestUpdatedAt: Math.max(0, Number(row?.newest_updated_at) || 0),
  };
}

function sameVoucherMirrorSignature(a: VoucherMirrorSignature, b: VoucherMirrorSignature): boolean {
  return a.count === b.count && a.newestUpdatedAt === b.newestUpdatedAt;
}

async function readVoucherMirrorRowsIncrementally(companyId: string): Promise<any[]> {
  if (typeof window === "undefined" || !companyId) return [];

  try {
    const db = await getBrowserDbForCompanyId(companyId);
    if (!db) return listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });

    let lastRead: any[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = readVoucherMirrorSignature(db, companyId);
      if (before.count === 0) {
        // Thin PL staff sessions intentionally fall back to the display cache
        // when their SQLite mirror is empty.
        return listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
      }

      const out: any[] = [];
      let lastId = "";
      let sliceStartedAt = nowMs();

      while (true) {
        const rows = db
          .prepare(
            `SELECT id, data
             FROM company_docs
             WHERE company_id = ? AND collection = 'vouchers' AND id > ?
             ORDER BY id
             LIMIT ?`
          )
          .all(companyId, lastId, VOUCHER_READ_BATCH_SIZE) as RawVoucherRow[];
        if (!rows.length) break;

        for (const row of rows) {
          try {
            const parsed = JSON.parse(row.data) as Record<string, unknown>;
            const data = deserializeLocalDbValue(parsed) as Record<string, unknown>;
            out.push({ ...data, id: row.id });
          } catch {
            /* Match the normal mirror reader: skip malformed rows. */
          }

          if (nowMs() - sliceStartedAt >= VOUCHER_READ_SLICE_MS) {
            await yieldToMain();
            sliceStartedAt = nowMs();
          }
        }

        lastId = rows[rows.length - 1].id;
        if (rows.length < VOUCHER_READ_BATCH_SIZE) break;
        await yieldToMain();
        sliceStartedAt = nowMs();
      }

      lastRead = out;
      if (sameVoucherMirrorSignature(before, readVoucherMirrorSignature(db, companyId))) {
        return out.length
          ? out
          : listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
      }
      await yieldToMain();
    }
    // A continuous sync/write stream may change again during the retry. Return
    // the newest complete pass; the normal collection bump will schedule the
    // following refresh.
    return lastRead.length
      ? lastRead
      : listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
  } catch {
    return listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
  }
}

/**
 * Coalesce concurrent dashboard/bootstrap reads for one company.  The first
 * reader yields during parsing; followers receive its completed rows without
 * starting another full JSON revival pass.
 */
export function listVoucherMirrorRowsIncrementally(companyId: string): Promise<any[]> {
  const key = String(companyId || "").trim();
  if (!key) return Promise.resolve([]);
  const pending = inFlightReads.get(key);
  if (pending) return pending;

  const work = readVoucherMirrorRowsIncrementally(key);
  inFlightReads.set(key, work);
  const clearInFlight = () => {
    if (inFlightReads.get(key) === work) inFlightReads.delete(key);
  };
  void work.then(clearInFlight, clearInFlight);
  return work;
}

"use client";

/**
 * Firestore → browser SQLite (company_docs) best-effort mirror.
 * Static/APK/Electron builds ke liye: har successful voucher write ke baad local DB update ho,
 * taaki baad mein offline read / sync layer isi source se attach ho sake.
 *
 * Sync / download (local-first):
 * - Firestore → SQLite: `firestoreToLocalCompanyPull.pullCompanySubcollectionFromFirestoreToLocalDb` (prefetch) +
 *   `onSnapshot` → `mirrorCollectionDocsToBrowserDbSilent`
 * - Offline reads: `listCompanyDocsFromBrowserDb` (prefetch jab network kharab / pehle se cache)
 * - Writes: local SQLite + outbox (`localVoucherOutbox`) → Firestore flush jab online
 */

import { doc, getDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { clearBrowserDbCache, getBrowserDb } from "@/lib/localSqlite";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { decryptFirestoreCompanyDocIfNeeded, isEncryptedServerBackupDoc } from "@/lib/serverBackupEncryption";
import { stampLocalMirrorBackedByFirestore } from "@/lib/localMirrorServerMeta";

/** UI/listeners ko batane ke liye: local `company_docs` update hua (static APk/Electron). */
export const BROWSER_DB_COLLECTION_BUMP = "pocket-ledger-browser-db-bump";

export type BrowserDbCollectionBumpDetail = { companyId: string; collection: string };

/** Firestore write mirror ke turant baad lists refresh kar sakein (same tab). */
export function notifyBrowserDbCollectionUpdated(companyId: string, collectionName: string): void {
  if (typeof window === "undefined" || !companyId || !collectionName) return;
  window.dispatchEvent(
    new CustomEvent<BrowserDbCollectionBumpDetail>(BROWSER_DB_COLLECTION_BUMP, {
      detail: { companyId, collection: collectionName },
    })
  );
}

/** True when default mirror rules apply (`static`/local‑only). Cloud firebase companies ke liye alag explicit flag (neeche). */
function shouldMirrorToBrowserDb(): boolean {
  return isLocalOnlyMode();
}

const MIRROR_SQLITE_ERROR_WINDOW_MS = 30_000;
const MIRROR_SQLITE_ERROR_BURST_LIMIT = 15;
let mirrorSqliteErrorWindowStartMs = 0;
let mirrorSqliteErrorCount = 0;
let mirrorWritesTemporarilyDisabledUntilMs = 0;

function isSqliteBadParamError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return message.includes("bad parameter") || message.includes("api misuse");
}

function shouldSkipMirrorWritesNow(): boolean {
  // Error storm ke dauran mirror writes pause karo taaki UI freeze + log flood ruk sake.
  return Date.now() < mirrorWritesTemporarilyDisabledUntilMs;
}

function markMirrorSqliteErrorAndMaybePauseWrites(error: unknown): void {
  const now = Date.now();
  if (now - mirrorSqliteErrorWindowStartMs > MIRROR_SQLITE_ERROR_WINDOW_MS) {
    mirrorSqliteErrorWindowStartMs = now;
    mirrorSqliteErrorCount = 0;
  }
  mirrorSqliteErrorCount += 1;
  if (mirrorSqliteErrorCount >= MIRROR_SQLITE_ERROR_BURST_LIMIT) {
    // Repeated sqlite misuse se loop na bane; 60s cool-down me app responsive rahega.
    mirrorWritesTemporarilyDisabledUntilMs = now + 60_000;
    console.warn("[localCompanyDocMirror] temporarily disabling browser-db mirror writes after repeated SQLite errors", error);
    mirrorSqliteErrorCount = 0;
    mirrorSqliteErrorWindowStartMs = now;
  }
}

/** Explicit row-delete: kabhi-kabhi `force` ho (Firestore wipe ke baad merge ghost rokna) chahe mirror write path band ho */
function shouldApplyBrowserCompanyDocMutation(force?: boolean): boolean {
  if (force === true && typeof window !== "undefined") return true;
  return shouldMirrorToBrowserDb();
}

/**
 * Local JSON se Firestore-compatible values (Timestamp + nested).
 */
export function deserializeLocalDbValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserializeLocalDbValue);
  if (typeof value === "object") {
    const o = value as Record<string, unknown> & { __fsTs?: boolean; seconds?: number; nanoseconds?: number };
    if (o.__fsTs === true && typeof o.seconds === "number") {
      const ns = typeof o.nanoseconds === "number" ? o.nanoseconds : 0;
      return Timestamp.fromMillis(o.seconds * 1000 + Math.floor(ns / 1e6));
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = deserializeLocalDbValue(o[k]);
    }
    return out;
  }
  return value;
}

type VoucherProjectionRow = {
  id: string;
  type?: string;
  date?: Date | null;
  amount?: number;
};

/**
 * Static build: ek company subcollection ke saare docs browser SQLite se (read-only cache).
 * Web bundle pe jaldi return — sql.js load avoid.
 */
/** Ek doc (e.g. invoice voucher) — static build read fallback. */
export async function getCompanyDocFromBrowserDb(
  companyId: string,
  collectionName: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  if (!isLocalOnlyMode() || typeof window === "undefined" || !companyId || !collectionName || !docId) return null;
  try {
    const db = await getBrowserDb();
    if (!db) return null;
    const row = db
      .prepare("SELECT id, data FROM company_docs WHERE company_id = ? AND collection = ? AND id = ?")
      .get(companyId, collectionName, docId) as { id: string; data: string } | undefined;
    if (!row?.data) return null;
    const parsed = JSON.parse(row.data) as Record<string, unknown>;
    const data = deserializeLocalDbValue(parsed) as Record<string, unknown>;
    if (data.isDeleted === true) return null;
    return { ...data, id: row.id };
  } catch {
    return null;
  }
}

export async function listCompanyDocsFromBrowserDb(
  companyId: string,
  collectionName: string,
  /** Backup merge / recycle-bin duplicate: soft-deleted rows bhi dikhao */
  options?: { forBackupMerge?: boolean; includeSoftDeleted?: boolean }
): Promise<any[]> {
  if ((!options?.forBackupMerge && !isLocalOnlyMode()) || typeof window === "undefined" || !companyId || !collectionName) return [];
  try {
    const db = await getBrowserDb();
    if (!db) return [];
    const rows = db
      .prepare("SELECT id, data FROM company_docs WHERE company_id = ? AND collection = ?")
      .all(companyId, collectionName) as Array<{ id: string; data: string }>;
    const out: any[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        const data = deserializeLocalDbValue(parsed) as Record<string, unknown>;
        out.push({ ...data, id: row.id });
      } catch {
        // corrupt row skip
      }
    }
    if (options?.includeSoftDeleted) return out;
    return out.filter((item: any) => item.isDeleted !== true);
  } catch {
    return [];
  }
}

/** Voucher lite rows: dashboard/recent quick paint ke liye projection table se cheap read. */
export async function listVoucherSummaryProjectionFromBrowserDb(
  companyId: string,
  options?: { forBackupMerge?: boolean; limit?: number }
): Promise<VoucherProjectionRow[]> {
  if ((!options?.forBackupMerge && !isLocalOnlyMode()) || typeof window === "undefined" || !companyId) return [];
  try {
    const db = await getBrowserDb();
    if (!db) return [];
    const raw = db
      .prepare(
        `SELECT id, doc_type, doc_date_ms, amount_value
         FROM company_docs_projection
         WHERE company_id = ? AND collection = 'vouchers'
         ORDER BY COALESCE(doc_date_ms, 0) DESC
         ${typeof options?.limit === "number" && options.limit > 0 ? "LIMIT ?" : ""}`
      )
      .all(
        ...(typeof options?.limit === "number" && options.limit > 0
          ? [companyId, Math.max(1, Math.floor(options.limit))]
          : [companyId])
      ) as Array<{
      id: string;
      doc_type?: string | null;
      doc_date_ms?: number | null;
      amount_value?: number | null;
    }>;
    return raw.map((r) => ({
      id: r.id,
      type: r.doc_type ?? undefined,
      date: typeof r.doc_date_ms === "number" ? new Date(r.doc_date_ms) : null,
      amount: typeof r.amount_value === "number" ? r.amount_value : 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Firestore snapshot values ko JSON-stable shape mein (Timestamps → portable object).
 */
function serializeForLocalDb(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // Binary / File SQLite JSON column me nahi — omit (parent object keys skip jab undefined).
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  if (typeof Blob !== "undefined" && value instanceof Blob) return undefined;
  if (typeof value === "bigint") return (value as bigint).toString();
  if (value instanceof Timestamp) {
    return { __fsTs: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate();
    return { __fsTs: true, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
  }
  if (value instanceof Date) {
    return { __fsTs: true, seconds: Math.floor(value.getTime() / 1000), nanoseconds: 0 };
  }
  if (Array.isArray(value)) return (value as unknown[]).map(serializeForLocalDb).filter((v) => v !== undefined);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = serializeForLocalDb(obj[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}

/** Voucher projection parsing: Timestamp/Date/string/epoch variants ko sortable ms me normalize. */
function parseDateToMsLoose(raw: unknown): number | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof raw === "object") {
    const anyRaw = raw as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof anyRaw.toDate === "function") {
      const d = anyRaw.toDate();
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof anyRaw.seconds === "number") {
      const ns = typeof anyRaw.nanoseconds === "number" ? anyRaw.nanoseconds : 0;
      const ms = anyRaw.seconds * 1000 + Math.floor(ns / 1e6);
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
}

/** Voucher amount best-effort: common fields (`total`/`amount`/`grandTotal`) me se pehla finite number. */
function parseAmountLoose(raw: Record<string, unknown>): number | null {
  const keys = ["total", "amount", "grandTotal", "netAmount"];
  for (const k of keys) {
    const n = Number(raw[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Separate projection table maintain karo taaki dashboard/recent quick load me full JSON parse avoid ho. */
async function upsertVoucherProjection(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (collectionName !== "vouchers") return;
  const db = await getBrowserDb();
  if (!db) return;
  const docType = typeof data.type === "string" ? data.type : null;
  const docDateMs = parseDateToMsLoose(data.date);
  const amountValue = parseAmountLoose(data);
  const now = Date.now();
  db.prepare(
    `INSERT INTO company_docs_projection(company_id, collection, id, doc_type, doc_date_ms, amount_value, updatedAt)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(company_id, collection, id) DO UPDATE SET
       doc_type = excluded.doc_type,
       doc_date_ms = excluded.doc_date_ms,
       amount_value = excluded.amount_value,
       updatedAt = excluded.updatedAt`
  ).run(companyId, collectionName, docId, docType, docDateMs, amountValue, now);
}

async function deleteVoucherProjection(companyId: string, collectionName: string, docId: string): Promise<void> {
  if (collectionName !== "vouchers") return;
  const db = await getBrowserDb();
  if (!db) return;
  db.prepare(
    "DELETE FROM company_docs_projection WHERE company_id = ? AND collection = ? AND id = ?"
  ).run(companyId, collectionName, docId);
}

export type UpsertCompanyBrowserOptions = {
  /** default true; snapshot batch ke liye false rakho */
  notify?: boolean;
  /** Backup restore / `storageOption: local` jab `isLocalOnlyMode` false ho — mirror guard bypass */
  force?: boolean;
};

/** Restore se pehle purani cache rows hatao — stale voucher merge na rahe */
export async function deleteAllCompanyDocsForCompany(companyId: string): Promise<void> {
  try {
    const db = await getBrowserDb();
    if (!db || !companyId) return;
    db.prepare(`DELETE FROM company_docs WHERE company_id = ?`).run(companyId);
    // Full wipe ke sath projection wipe bhi taaki stale dashboard rows na bache.
    db.prepare(`DELETE FROM company_docs_projection WHERE company_id = ?`).run(companyId);
  } catch (e) {
    console.warn("[localCompanyDocMirror] deleteAllCompanyDocsForCompany failed", companyId, e);
  }
}

export type DeleteCompanyBrowserDbOptions = {
  /** Offline mirror ke alawa backup-merge path pe bhi row hataao (Firestore deleteDoc ke baad stale merge rokna). */
  force?: boolean;
  notify?: boolean;
};

/** Firestore se doc permanently delete hone ke baad isi row ko SQLite mirror se hatado — mergeRemoteSnapshot extras se ghost list na बने. */
export async function deleteCompanyDocFromBrowserDb(
  companyId: string,
  collectionName: string,
  docId: string,
  options?: DeleteCompanyBrowserDbOptions
): Promise<void> {
  // `force`: backup-merge SQLite row hataao jab authoritative doc Firestore se delete ho chuka ho (extras merge ghotala).
  if (!shouldApplyBrowserCompanyDocMutation(options?.force) || typeof window === "undefined" || !companyId || !collectionName || !docId) return;
  const notify = options?.notify !== false;
  try {
    const db = await getBrowserDb();
    if (!db) return;
    db.prepare("DELETE FROM company_docs WHERE company_id = ? AND collection = ? AND id = ?").run(companyId, collectionName, docId);
    await deleteVoucherProjection(companyId, collectionName, docId);
    if (notify) notifyBrowserDbCollectionUpdated(companyId, collectionName);
  } catch (e) {
    console.warn("[localCompanyDocMirror] deleteCompanyDocFromBrowserDb failed", collectionName, docId, e);
  }
}

/**
 * Generic upsert into company_docs; errors swallow — main Firestore flow kabhi fail na ho.
 */
export async function upsertCompanyDocInBrowserDb(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<void> {
  if ((!options?.force && !shouldMirrorToBrowserDb()) || !companyId || !collectionName || !docId) return;
  if (shouldSkipMirrorWritesNow()) return;
  const shouldNotify = options?.notify !== false;
  try {
    const db = await getBrowserDb();
    if (!db) return;
    const json = JSON.stringify(serializeForLocalDb(data));
    const now = Date.now();
    // SQLite UPSERT: static build ke single write path
    db.prepare(
      `INSERT INTO company_docs(company_id, collection, id, data, updatedAt)
       VALUES(?,?,?,?,?)
       ON CONFLICT(company_id, collection, id) DO UPDATE SET
         data = excluded.data,
         updatedAt = excluded.updatedAt`
    ).run(companyId, collectionName, docId, json, now);
    await upsertVoucherProjection(companyId, collectionName, docId, data);
    // Single-write paths: UI bump; Firestore snapshot batch → notify false (React pehle hi fresh).
    if (shouldNotify) notifyBrowserDbCollectionUpdated(companyId, collectionName);
  } catch (e) {
    if (isSqliteBadParamError(e)) {
      try {
        // sql.js stale handle race aaye to one-time cache reset + retry se self-heal karo.
        clearBrowserDbCache();
        const retryDb = await getBrowserDb();
        if (retryDb) {
          const retryJson = JSON.stringify(serializeForLocalDb(data));
          const now = Date.now();
          retryDb
            .prepare(
              `INSERT INTO company_docs(company_id, collection, id, data, updatedAt)
               VALUES(?,?,?,?,?)
               ON CONFLICT(company_id, collection, id) DO UPDATE SET
                 data = excluded.data,
                 updatedAt = excluded.updatedAt`
            )
            .run(companyId, collectionName, docId, retryJson, now);
          await upsertVoucherProjection(companyId, collectionName, docId, data);
          if (shouldNotify) notifyBrowserDbCollectionUpdated(companyId, collectionName);
          return;
        }
      } catch (retryError) {
        markMirrorSqliteErrorAndMaybePauseWrites(retryError);
        console.warn("[localCompanyDocMirror] upsert retry failed", collectionName, docId, retryError);
        return;
      }
      markMirrorSqliteErrorAndMaybePauseWrites(e);
    }
    console.warn("[localCompanyDocMirror] upsert failed", collectionName, docId, e);
  }
}

/**
 * onSnapshot se aayi poori list SQLite mein — offline read + invoice party/items ke liye cache.
 * Har doc par notify nahi (performance / flood avoid).
 * `cloudBackedOfflineCache`: firebase storage company browser/PWA web par SQLite shadow — purane guard me yahan skip tha aur offline sirf jitna RAM/Firestore cache me tha wahi.
 */
export async function mirrorCollectionDocsToBrowserDbSilent(
  companyId: string,
  collectionName: string,
  docs: unknown[],
  options?: { cloudBackedOfflineCache?: boolean }
): Promise<void> {
  if (typeof window === "undefined" || !companyId || !collectionName || !Array.isArray(docs) || docs.length === 0)
    return;
  const persistAllowed = shouldMirrorToBrowserDb() || options?.cloudBackedOfflineCache === true;
  if (!persistAllowed) return;
  /** Web cloud path: upsertCompanyDoc gate `shouldMirrorToBrowserDb` false — `force` se SQLite hi likho */
  const forceUpsert = !shouldMirrorToBrowserDb();
  for (const row of docs) {
    const rec = row as { id?: string };
    const id = rec?.id as string | undefined;
    if (!id) continue;
    const payload = { ...(row as object), id } as Record<string, unknown>;
    await upsertCompanyDocInBrowserDb(companyId, collectionName, id, payload, { notify: false, force: forceUpsert });
  }
}

/**
 * Voucher doc Firestore se read karke local DB mein same snapshot store karo (post-write truth).
 */
export async function mirrorVoucherDocToBrowserDb(companyId: string, voucherId: string): Promise<void> {
  if (!shouldMirrorToBrowserDb() || !companyId || !voucherId) return;
  try {
    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    const fsCompanyId = String(reg?.authoritativeCompanyId || companyId).trim() || companyId;
    const ref = doc(firestore, `companies/${fsCompanyId}/vouchers`, voucherId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    let payload: Record<string, unknown> = { id: snap.id, ...(snap.data() as Record<string, unknown>) };
    const ctx = reg ? { encryptServerBackupSalt: (reg as Record<string, unknown>).encryptServerBackupSalt as string | undefined } : null;
    const dec = await decryptFirestoreCompanyDocIfNeeded(
      payload as Record<string, unknown> & { id: string },
      ctx,
      companyId
    );
    if (dec) payload = dec;
    else if (isEncryptedServerBackupDoc(payload)) return;
    /** Post-flush Firebase read confirm — orphans ko extras merge band kare META se (extras par stamp mat lagu). */
    await upsertCompanyDocInBrowserDb(companyId, "vouchers", voucherId, stampLocalMirrorBackedByFirestore(payload));
  } catch (e) {
    console.warn("[localCompanyDocMirror] mirror voucher failed", voucherId, e);
  }
}

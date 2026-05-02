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
import { getBrowserDb } from "@/lib/localSqlite";
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

/** True jab local browser DB mirror chalana hai (static + web local-only). */
function shouldMirrorToBrowserDb(): boolean {
  return isLocalOnlyMode();
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
  /** Backup merge: `isLocalOnlyMode` false par bhi SQLite rows lo — jo voucher abhi Firestore flush nahi hue */
  options?: { forBackupMerge?: boolean }
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
    return out.filter((item: any) => item.isDeleted !== true);
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
    // Single-write paths: UI bump; Firestore snapshot batch → notify false (React pehle hi fresh).
    if (shouldNotify) notifyBrowserDbCollectionUpdated(companyId, collectionName);
  } catch (e) {
    console.warn("[localCompanyDocMirror] upsert failed", collectionName, docId, e);
  }
}

/**
 * onSnapshot se aayi poori list SQLite mein — offline read + invoice party/items ke liye cache.
 * Har doc par notify nahi (performance / flood avoid).
 */
export async function mirrorCollectionDocsToBrowserDbSilent(
  companyId: string,
  collectionName: string,
  docs: any[]
): Promise<void> {
  if (!shouldMirrorToBrowserDb() || !companyId || !collectionName || !Array.isArray(docs) || docs.length === 0) return;
  for (const row of docs) {
    const id = row?.id as string | undefined;
    if (!id) continue;
    const payload = { ...(row as object), id } as Record<string, unknown>;
    await upsertCompanyDocInBrowserDb(companyId, collectionName, id, payload, { notify: false });
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

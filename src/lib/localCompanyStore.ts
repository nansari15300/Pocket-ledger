"use client";

/**
 * Local-only company registry in browser SQLite.
 * App static/offline mode me company CRUD isi store se karega.
 */

import { flushPendingBrowserDbSave, getBrowserDb } from "@/lib/localSqlite";
import { mergePersistedLocalCloudSyncUserSettings } from "@/lib/localCloudSync/persistRegistryUserSettings";
import { clearLocalAuth } from "@/lib/localApiClient";
import { clearCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";
import { clearCloudCompanyPasswordUnlockSession } from "@/lib/cloudCompanyPasswordUnlockRemember";
import { clearOfflineUnlockSession } from "@/lib/offlineCompanyUnlockRemember";
import { clearRememberedSharedUnlockUsername } from "@/lib/onlineSharedUnlockRememberUsername";

const REMOVED_COMPANY_TOMBSTONE_PREFIX = "pl_removed_local_company_v1:";
const REMOVED_COMPANY_TOMBSTONE_MS = 10 * 60 * 1000;

export type LocalCompanyDoc = {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail?: string | null;
  isDeleted?: boolean;
  /** Offline login users (username/password) — `src/lib/localCompanyUsers.ts` */
  localCompanyUsers?: Array<{
    id: string;
    username: string;
    displayName: string;
    role: string;
    password: string;
  }>;
  [key: string]: unknown;
};

function shouldStampAsLocalOnly(row: LocalCompanyDoc | null | undefined): boolean {
  if (!row) return false;
  if ((row as { plServerShared?: unknown }).plServerShared === true) return false;
  if ((row as { localOnly?: unknown }).localOnly === true) return true;
  if ((row as { firestoreSyncDisabled?: unknown }).firestoreSyncDisabled === true) return true;
  if (String((row as { localPersistence?: unknown }).localPersistence ?? "").toLowerCase().trim() === "sqlite") return true;
  if (String((row as { storageOption?: unknown }).storageOption ?? "").toLowerCase().trim() === "local") return true;
  if (String((row as { syncPolicy?: unknown }).syncPolicy ?? "").toLowerCase().trim() === "offline") return true;
  return false;
}

function stampLocalOnlyCompanyDoc<T extends LocalCompanyDoc>(row: T): T {
  return {
    ...row,
    localOnly: true,
    localPersistence: "sqlite",
    firestoreSyncDisabled: true,
    storageOption: "local",
    syncPolicy: "offline",
    syncedFromCloud: false,
    authoritativeCompanyId: "",
  } as T;
}

function safeParseCompany(json: string): LocalCompanyDoc | null {
  try {
    return JSON.parse(json) as LocalCompanyDoc;
  } catch {
    return null;
  }
}

/** SQLite/JSON mirror kabhi `1` / `"true"` bhej sakta hai — strict `=== true` filters / purge logic is se safe rahein. */
export function localCompanyRowIsDeleted(row: { isDeleted?: unknown }): boolean {
  const v = row.isDeleted;
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1";
  }
  return false;
}

export async function upsertLocalCompany(company: LocalCompanyDoc): Promise<void> {
  const db = await getBrowserDb();
  if (!db || !company?.id) return;
  const now = Date.now();
  const existingLocalRow = db.prepare(`SELECT data FROM local_companies WHERE id = ?`).get(company.id) as
    | { data?: string }
    | undefined;
  const existingCloudRow = db.prepare(`SELECT data FROM companies WHERE id = ?`).get(company.id) as
    | { data?: string }
    | undefined;
  const existing = existingLocalRow?.data
    ? safeParseCompany(existingLocalRow.data)
    : existingCloudRow?.data
      ? safeParseCompany(existingCloudRow.data)
      : null;
  const mergedRaw = mergePersistedLocalCloudSyncUserSettings(existing, company);
  const merged = shouldStampAsLocalOnly(company) || shouldStampAsLocalOnly(existing)
    ? stampLocalOnlyCompanyDoc(mergedRaw)
    : mergedRaw;
  if (shouldStampAsLocalOnly(merged)) {
    db.prepare(
      `INSERT INTO local_companies(id, data, updatedAt)
       VALUES(?,?,?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`
    ).run(merged.id, JSON.stringify(merged), now);
    db.prepare(`DELETE FROM companies WHERE id = ?`).run(merged.id);
    return;
  }
  // companies table keeps cloud-backed root docs; strict local rows live in local_companies.
  db.prepare(
    `INSERT INTO companies(id, data, updatedAt)
     VALUES(?,?,?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`
  ).run(merged.id, JSON.stringify(merged), now);
}

/**
 * Local-only → online promotion: `upsertLocalCompany` re-stamps device-local rows, so
 * write the cloud shape into `companies` and remove `local_companies` explicitly.
 */
export async function promoteLocalCompanyRowToOnline(
  companyId: string,
  patch?: Partial<LocalCompanyDoc>
): Promise<LocalCompanyDoc | null> {
  const db = await getBrowserDb();
  const cid = String(companyId || "").trim();
  if (!db || !cid) return null;
  const existing = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!existing) return null;

  const mergedRaw = mergePersistedLocalCloudSyncUserSettings(existing, {
    ...existing,
    ...(patch || {}),
    id: cid,
  } as LocalCompanyDoc);
  const promoted: LocalCompanyDoc = {
    ...mergedRaw,
    id: cid,
    storageOption: "firebase",
    syncPolicy: "online",
    syncedFromCloud: (patch as { syncedFromCloud?: boolean } | undefined)?.syncedFromCloud === true,
    authoritativeCompanyId: cid,
    localOnly: false,
    firestoreSyncDisabled: false,
    updatedAt: Date.now(),
  };
  delete (promoted as { demoteReason?: unknown }).demoteReason;
  delete (promoted as { demotedFromOnlineAt?: unknown }).demotedFromOnlineAt;
  delete (promoted as { localPersistence?: unknown }).localPersistence;

  const now = Date.now();
  db.prepare(
    `INSERT INTO companies(id, data, updatedAt)
     VALUES(?,?,?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`
  ).run(cid, JSON.stringify(promoted), now);
  try {
    db.prepare(`DELETE FROM local_companies WHERE id = ?`).run(cid);
  } catch {
    /* pre-local_companies DB */
  }
  return promoted;
}

export async function getLocalCompanyById(
  companyId: string,
  options?: { includeDeleted?: boolean }
): Promise<LocalCompanyDoc | null> {
  const db = await getBrowserDb();
  if (!db || !companyId) return null;
  const localRow = db.prepare(`SELECT id, data FROM local_companies WHERE id = ?`).get(companyId) as
    | { id: string; data: string }
    | undefined;
  const row = localRow ?? (db.prepare(`SELECT id, data FROM companies WHERE id = ?`).get(companyId) as { id: string; data: string } | undefined);
  if (!row?.data) return null;
  const parsed = safeParseCompany(row.data);
  if (!parsed) return null;
  // SQLite/JSON rows may store soft-delete as true/1/"1"; use normalized check everywhere.
  if (options?.includeDeleted !== true && localCompanyRowIsDeleted(parsed)) return null;
  return { ...parsed, id: row.id };
}

export async function listLocalCompanies(options?: { includeDeleted?: boolean }): Promise<LocalCompanyDoc[]> {
  const db = await getBrowserDb();
  if (!db) return [];
  const rows = [
    ...(db.prepare(`SELECT id, data, updatedAt FROM local_companies ORDER BY updatedAt DESC`).all() as Array<{
      id: string;
      data: string;
      updatedAt?: number;
    }>),
    ...(db.prepare(`SELECT id, data, updatedAt FROM companies ORDER BY updatedAt DESC`).all() as Array<{
      id: string;
      data: string;
      updatedAt?: number;
    }>),
  ];
  const out: LocalCompanyDoc[] = [];
  const seen = new Set<string>();
  const includeDeleted = options?.includeDeleted === true;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const parsed = safeParseCompany(row.data);
    if (!parsed) continue;
    if (!includeDeleted && localCompanyRowIsDeleted(parsed)) continue;
    out.push({ ...parsed, id: row.id });
  }
  return out;
}

export type RemoveLocalCompanyOptions = {
  /** Firebase Auth uid — company unlock / remember sessions hataane ke liye */
  firebaseUid?: string | null;
};

function markLocalCompanyRecentlyRemoved(companyId: string): void {
  if (typeof window === "undefined") return;
  try {
    // Running cloud-sync cycle stale registry snapshot se Drive folder recreate na kare.
    window.localStorage.setItem(`${REMOVED_COMPANY_TOMBSTONE_PREFIX}${companyId}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function wasLocalCompanyRecentlyRemoved(companyId: string): boolean {
  if (typeof window === "undefined") return false;
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  try {
    const key = `${REMOVED_COMPANY_TOMBSTONE_PREFIX}${cid}`;
    const raw = window.localStorage.getItem(key);
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    if (Date.now() - ts <= REMOVED_COMPANY_TOMBSTONE_MS) return true;
    window.localStorage.removeItem(key);
    return false;
  } catch {
    return false;
  }
}

/**
 * Device se company ka saara local data hatao: registry + company_docs + users + sync outbox + related localStorage.
 * Shared access revoke / recycle bin permanent delete dono yahi use karte hain.
 */
export async function removeLocalCompanyById(
  companyId: string,
  options?: RemoveLocalCompanyOptions
): Promise<void> {
  const db = await getBrowserDb();
  if (!db || !companyId) return;
  const cid = String(companyId).trim();
  if (!cid) return;
  markLocalCompanyRecentlyRemoved(cid);

  db.prepare(`DELETE FROM company_docs WHERE company_id = ?`).run(cid);
  db.prepare(`DELETE FROM company_docs_projection WHERE company_id = ?`).run(cid);
  db.prepare(`DELETE FROM company_users WHERE company_id = ?`).run(cid);
  db.prepare(`DELETE FROM sync_outbox WHERE company_id = ?`).run(cid);
  try {
    db.prepare(`DELETE FROM cloud_sync_outbox WHERE company_id = ?`).run(cid);
    db.prepare(`DELETE FROM cloud_sync_meta WHERE company_id = ?`).run(cid);
  } catch {
    /* pre-v3 DB */
  }
  try {
    db.prepare(`DELETE FROM local_companies WHERE id = ?`).run(cid);
  } catch {
    /* pre-local_companies DB */
  }
  db.prepare(`DELETE FROM companies WHERE id = ?`).run(cid);

  try {
    clearLocalAuth(cid);
  } catch {
    /* ignore */
  }
  try {
    clearCompanyPlanLocalCache(cid);
  } catch {
    /* ignore */
  }
  const uid = options?.firebaseUid;
  if (uid != null && String(uid).trim()) {
    const u = String(uid).trim();
    try {
      clearCloudCompanyPasswordUnlockSession(u, cid);
      clearOfflineUnlockSession(u, cid);
      clearRememberedSharedUnlockUsername(u, cid);
    } catch {
      /* ignore */
    }
  }
  try {
    await flushPendingBrowserDbSave();
  } catch {
    /* best-effort */
  }
}

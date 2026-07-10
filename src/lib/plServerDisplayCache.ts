"use client";

import type { CompanyBackupCollection } from "@/lib/companyBackupCollections";
import { COLLECTIONS_TO_BACKUP } from "@/lib/companyBackupCollections";
import { deserializeLocalDbValue } from "@/lib/localCompanyDocMirror";
import { notifyBrowserDbCollectionUpdated, mirrorDocTimestampFields } from "@/lib/localCompanyDocMirror";
import { resolvePlServerMirrorTransport } from "@/lib/plServerClientMirrorPush";
import { gateHttpGet } from "@/lib/gates/gateServerFetch";
import { livePullDevLog, livePullBugCatch } from "@/lib/plServerLivePullDevLog";
import {
  cacheCompanyCollection,
  getCachedCompanyCollection,
  getCachedCompanyCollections,
  type CompanyCollectionPath,
} from "@/lib/companyMirrorCache";

type DocRow = Record<string, unknown> & { id: string };

const cacheByCompany = new Map<string, Map<string, Map<string, DocRow>>>();
const fetchInFlight = new Map<string, Promise<void>>();
const persistTimers = new Map<string, number>();

const PERSISTABLE_COLLECTIONS = new Set<string>([
  "vouchers",
  "parties",
  "bank_accounts",
  "items",
  "staff",
  "expense_accounts",
  "taxes",
  "groups",
  "account_groups",
  "staff_groups",
  "item_groups",
  "tax_groups",
  "expense_groups",
  "recurring_voucher_templates",
  "alarms",
]);

function persistableCollectionName(collection: string): collection is CompanyCollectionPath {
  return PERSISTABLE_COLLECTIONS.has(collectionKey(collection));
}

function schedulePersistPlServerDisplayCacheCollection(companyId: string, collectionName: string): void {
  const cid = companyKey(companyId);
  const col = collectionKey(collectionName);
  if (!cid || !col || !persistableCollectionName(col)) return;
  const timerKey = `${cid}::${col}`;
  const prev = persistTimers.get(timerKey);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    timerKey,
    window.setTimeout(() => {
      persistTimers.delete(timerKey);
      const docs = listPlServerDisplayCacheDocs(cid, col, { includeSoftDeleted: true });
      void cacheCompanyCollection(cid, col, docs).catch((e) => {
        console.warn("[plServerDisplayCache] idb persist failed", cid, col, e);
      });
    }, 400)
  );
}

function companyKey(companyId: string): string {
  return String(companyId || "").trim();
}

function collectionKey(collection: string): string {
  return String(collection || "").trim();
}

function fetchKey(companyId: string, collection: string): string {
  return `${companyKey(companyId)}::${collectionKey(collection)}`;
}

function getOrCreateCompanyCache(companyId: string): Map<string, Map<string, DocRow>> {
  const cid = companyKey(companyId);
  let row = cacheByCompany.get(cid);
  if (!row) {
    row = new Map();
    cacheByCompany.set(cid, row);
  }
  return row;
}

function getOrCreateCollectionCache(companyId: string, collection: string): Map<string, DocRow> {
  const company = getOrCreateCompanyCache(companyId);
  const col = collectionKey(collection);
  let row = company.get(col);
  if (!row) {
    row = new Map();
    company.set(col, row);
  }
  return row;
}

function normalizeDoc(doc: Record<string, unknown>, docId?: string): DocRow | null {
  const id = String(docId || doc.id || "").trim();
  if (!id) return null;
  const parsed = deserializeLocalDbValue(doc) as Record<string, unknown>;
  return { ...parsed, id };
}

function displayCacheDocsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function listPlServerDisplayCacheDocs(
  companyId: string,
  collectionName: string,
  options?: { includeSoftDeleted?: boolean }
): DocRow[] {
  const col = getOrCreateCollectionCache(companyId, collectionName);
  const out: DocRow[] = [];
  for (const doc of col.values()) {
    if (!options?.includeSoftDeleted && doc.isDeleted === true) continue;
    out.push(doc);
  }
  return out;
}

export function getPlServerDisplayCacheDoc(
  companyId: string,
  collectionName: string,
  docId: string,
  options?: { includeDeleted?: boolean }
): DocRow | null {
  const doc = getOrCreateCollectionCache(companyId, collectionName).get(String(docId || "").trim());
  if (!doc) return null;
  if (!options?.includeDeleted && doc.isDeleted === true) return null;
  return doc;
}

/** Staff thin client: cache me kuch ledger data hai to background refresh fail par UI stale mat dikhao. */
export function plServerDisplayCacheHasUsableLedger(companyId: string): boolean {
  const cid = companyKey(companyId);
  if (!cid) return false;
  for (const col of ["vouchers", "parties", "bank_accounts", "staff", "items"] as const) {
    if (listPlServerDisplayCacheDocs(cid, col).length > 0) return true;
  }
  return false;
}

export function patchPlServerDisplayCacheDoc(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>
): boolean {
  const normalized = normalizeDoc(data, docId);
  if (!normalized) return false;
  const col = getOrCreateCollectionCache(companyId, collectionName);
  const prev = col.get(normalized.id);
  if (prev && displayCacheDocsEqual(prev, normalized)) return false;
  col.set(normalized.id, normalized);
  schedulePersistPlServerDisplayCacheCollection(companyId, collectionName);
  return true;
}

export function replacePlServerDisplayCacheCollection(
  companyId: string,
  collectionName: string,
  docs: Array<Record<string, unknown>>
): boolean {
  const col = getOrCreateCollectionCache(companyId, collectionName);
  const next = new Map<string, DocRow>();
  for (const raw of docs) {
    const normalized = normalizeDoc(raw);
    if (normalized) next.set(normalized.id, normalized);
  }
  let changed = col.size !== next.size;
  if (!changed) {
    for (const [id, doc] of next) {
      const prev = col.get(id);
      if (!prev || !displayCacheDocsEqual(prev, doc)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return false;
  col.clear();
  for (const [id, doc] of next) col.set(id, doc);
  schedulePersistPlServerDisplayCacheCollection(companyId, collectionName);
  return true;
}

/** Live pull: staff optimistic save ko purani server snapshot se overwrite mat karo (editTimeMs compare). */
export function mergePlServerDisplayCacheFromServerPull(
  companyId: string,
  collectionName: string,
  docs: Array<Record<string, unknown>>
): boolean {
  const col = getOrCreateCollectionCache(companyId, collectionName);
  let changed = false;
  for (const raw of docs) {
    const normalized = normalizeDoc(raw);
    if (!normalized) continue;
    const prev = col.get(normalized.id);
    if (!prev) {
      col.set(normalized.id, normalized);
      changed = true;
      continue;
    }
    const prevMs = mirrorDocTimestampFields(prev).editTimeMs;
    const incMs = mirrorDocTimestampFields(normalized).editTimeMs;
    if (incMs > prevMs) {
      if (!displayCacheDocsEqual(prev, normalized)) {
        col.set(normalized.id, normalized);
        changed = true;
      }
    } else if (incMs === prevMs) {
      const merged = { ...prev, ...normalized, id: normalized.id };
      if (!displayCacheDocsEqual(prev, merged)) {
        col.set(normalized.id, merged);
        changed = true;
      }
    }
  }
  if (changed) schedulePersistPlServerDisplayCacheCollection(companyId, collectionName);
  return changed;
}

export function mergePlServerDisplayCacheCollection(
  companyId: string,
  collectionName: string,
  docs: Array<Record<string, unknown>>,
  options?: { incomingWins?: boolean }
): boolean {
  const col = getOrCreateCollectionCache(companyId, collectionName);
  let changed = false;
  for (const raw of docs) {
    const normalized = normalizeDoc(raw);
    if (!normalized) continue;
    const prev = col.get(normalized.id);
    if (!prev || options?.incomingWins !== false) {
      if (prev && displayCacheDocsEqual(prev, normalized)) continue;
      col.set(normalized.id, normalized);
      changed = true;
      continue;
    }
    const merged = { ...prev, ...normalized, id: normalized.id };
    if (displayCacheDocsEqual(prev, merged)) continue;
    col.set(normalized.id, merged);
    changed = true;
  }
  if (changed) schedulePersistPlServerDisplayCacheCollection(companyId, collectionName);
  return changed;
}

/** Staff offline: IndexedDB se memory cache hydrate — app restart / LAN band par bhi lists dikhein. */
export async function hydratePlServerDisplayCacheFromIdb(
  companyId: string,
  collectionName?: string
): Promise<number> {
  const cid = companyKey(companyId);
  if (!cid || typeof window === "undefined") return 0;
  let loaded = 0;

  if (collectionName) {
    const col = collectionKey(collectionName);
    if (listPlServerDisplayCacheDocs(cid, col).length > 0) return 0;
    try {
      const docs = await getCachedCompanyCollection(cid, col);
      if (Array.isArray(docs) && docs.length > 0) {
        mergePlServerDisplayCacheFromServerPull(cid, col, docs);
        loaded = 1;
        livePullDevLog("display_cache_idb_hydrate", { companyId: cid, collection: col, count: docs.length });
      }
    } catch {
      /* idb miss */
    }
    return loaded;
  }

  try {
    const cached = await getCachedCompanyCollections(cid);
    for (const [col, docs] of Object.entries(cached)) {
      if (!Array.isArray(docs) || docs.length === 0) continue;
      if (listPlServerDisplayCacheDocs(cid, col).length > 0) continue;
      mergePlServerDisplayCacheFromServerPull(cid, col, docs);
      loaded += 1;
      livePullDevLog("display_cache_idb_hydrate", { companyId: cid, collection: col, count: docs.length });
    }
  } catch {
    /* idb unavailable */
  }
  return loaded;
}

function isClientOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function fetchCollectionFromServer(
  companyId: string,
  collection: CompanyBackupCollection
): Promise<Array<Record<string, unknown>> | null> {
  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport?.baseUrl) return null;
  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_mirror/${encodeURIComponent(companyId)}/${encodeURIComponent(collection)}`;
  try {
    const { status, body } = await gateHttpGet(url, transport.accessToken);
    if (!status || status >= 400) return null;
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { docs?: unknown }).docs)) {
      return (parsed as { docs: Array<Record<string, unknown>> }).docs;
    }
    return [];
  } catch {
    return null;
  }
}

async function fetchBundleFromServer(companyId: string): Promise<{
  collections?: Record<string, Array<Record<string, unknown>>>;
} | null> {
  const transport = resolvePlServerMirrorTransport(companyId);
  if (!transport?.baseUrl) return null;
  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_mirror/${encodeURIComponent(companyId)}`;
  try {
    const { status, body } = await gateHttpGet(url, transport.accessToken);
    if (!status || status >= 400) return null;
    return JSON.parse(body) as { collections?: Record<string, Array<Record<string, unknown>>> };
  } catch {
    return null;
  }
}

/** Server se collection load → display cache (SQLite mirror nahi). */
export type PlServerDisplayCacheCollectionRefreshResult = {
  ok: boolean;
  changed: boolean;
};

export async function refreshPlServerDisplayCacheCollection(
  companyId: string,
  collectionName: string,
  options?: { forceRefresh?: boolean }
): Promise<PlServerDisplayCacheCollectionRefreshResult> {
  const cid = companyKey(companyId);
  const col = collectionKey(collectionName);
  const empty = { ok: false, changed: false };
  if (!cid || !col) return empty;
  if (!(COLLECTIONS_TO_BACKUP as readonly string[]).includes(col)) return empty;

  if (!options?.forceRefresh && listPlServerDisplayCacheDocs(cid, col).length > 0) {
    return { ok: true, changed: false };
  }

  if (isClientOffline()) {
    const hydrated = await hydratePlServerDisplayCacheFromIdb(cid, col);
    return { ok: listPlServerDisplayCacheDocs(cid, col).length > 0, changed: hydrated > 0 };
  }

  const inflightKey = fetchKey(cid, col);
  const existing = fetchInFlight.get(inflightKey);
  if (existing) {
    await existing.catch(() => undefined);
    return { ok: listPlServerDisplayCacheDocs(cid, col).length > 0, changed: false };
  }

  let changed = false;
  let fetched = false;
  const task = (async () => {
    const docs = await fetchCollectionFromServer(cid, col as CompanyBackupCollection);
    if (docs != null) {
      fetched = true;
      changed = mergePlServerDisplayCacheFromServerPull(cid, col, docs) || changed;
      livePullDevLog("display_cache_collection_loaded", { companyId: cid, collection: col, count: docs.length });
      return;
    }
    const bundle = await fetchBundleFromServer(cid);
    const fromBundle = bundle?.collections?.[col];
    if (Array.isArray(fromBundle)) {
      fetched = true;
      changed = mergePlServerDisplayCacheFromServerPull(cid, col, fromBundle) || changed;
      livePullDevLog("display_cache_collection_from_bundle", { companyId: cid, collection: col, count: fromBundle.length });
      return;
    }
    if (listPlServerDisplayCacheDocs(cid, col).length > 0) {
      livePullDevLog("display_cache_collection_fetch_miss_using_stale", { companyId: cid, collection: col });
    } else {
      const hydrated = await hydratePlServerDisplayCacheFromIdb(cid, col);
      changed = hydrated > 0 || changed;
      if (listPlServerDisplayCacheDocs(cid, col).length > 0) {
        livePullDevLog("display_cache_collection_idb_fallback", { companyId: cid, collection: col });
      } else {
        livePullBugCatch("DISPLAY_CACHE_COLLECTION_FETCH_EMPTY", { companyId: cid, collection: col });
      }
    }
  })();

  fetchInFlight.set(inflightKey, task);
  try {
    await task;
  } finally {
    fetchInFlight.delete(inflightKey);
  }
  return { ok: fetched || listPlServerDisplayCacheDocs(cid, col).length > 0, changed };
}

export async function ensurePlServerDisplayCacheCollection(
  companyId: string,
  collectionName: string
): Promise<boolean> {
  return (await refreshPlServerDisplayCacheCollection(companyId, collectionName)).ok;
}

/** Full ledger refresh — saari allowed collections server se cache me. */
export async function refreshPlServerDisplayCacheCompany(
  companyId: string,
  options?: {
    pullFullLedger?: boolean;
    pollOnly?: boolean;
    focusCollections?: CompanyBackupCollection[];
  }
): Promise<{ ok: boolean; collections: number; changedCollections: CompanyBackupCollection[] }> {
  const cid = companyKey(companyId);
  if (!cid) return { ok: false, collections: 0, changedCollections: [] };
  if (isClientOffline()) {
    const hydrated = await hydratePlServerDisplayCacheFromIdb(cid);
    const usable = plServerDisplayCacheHasUsableLedger(cid);
    return { ok: usable || hydrated > 0, collections: hydrated, changedCollections: [] };
  }
  const pullFull = options?.pullFullLedger !== false;
  let loaded = 0;
  const changedCollections: CompanyBackupCollection[] = [];

  const PRIORITY: CompanyBackupCollection[] = [
    "vouchers",
    "parties",
    "bank_accounts",
    "items",
    "staff",
    "expense_accounts",
    "taxes",
  ];

  if (options?.focusCollections?.length) {
    for (const col of options.focusCollections) {
      const result = await refreshPlServerDisplayCacheCollection(cid, col, { forceRefresh: true });
      if (result.ok) {
        loaded += 1;
        if (result.changed) {
          changedCollections.push(col);
          notifyBrowserDbCollectionUpdated(cid, col);
        }
      }
    }
    return { ok: loaded > 0, collections: loaded, changedCollections };
  }

  if (pullFull) {
    const cols = options?.pollOnly
      ? PRIORITY
      : ([...PRIORITY, ...COLLECTIONS_TO_BACKUP.filter((c) => !PRIORITY.includes(c as CompanyBackupCollection))] as CompanyBackupCollection[]);

    for (const col of PRIORITY.filter((c) => cols.includes(c))) {
      const result = await refreshPlServerDisplayCacheCollection(cid, col, { forceRefresh: true });
      if (result.ok) {
        loaded += 1;
        if (result.changed) {
          changedCollections.push(col);
          notifyBrowserDbCollectionUpdated(cid, col);
        }
      }
    }

    const rest = cols.filter((c) => !PRIORITY.includes(c));
    if (rest.length > 0) {
      const restResults = await Promise.all(
        rest.map(async (col) => {
          const result = await refreshPlServerDisplayCacheCollection(cid, col, { forceRefresh: true });
          if (result.changed) {
            changedCollections.push(col);
            notifyBrowserDbCollectionUpdated(cid, col);
          }
          return result.ok;
        })
      );
      loaded += restResults.filter(Boolean).length;
    }
  } else {
    const bundle = await fetchBundleFromServer(cid);
    const collections = bundle?.collections || {};
    for (const col of COLLECTIONS_TO_BACKUP) {
      if (col === "vouchers" || col === "recurring_voucher_templates") continue;
      const docs = collections[col];
      if (!Array.isArray(docs) || docs.length === 0) continue;
      const changed = mergePlServerDisplayCacheFromServerPull(cid, col, docs);
      loaded += 1;
      if (changed) {
        changedCollections.push(col);
        notifyBrowserDbCollectionUpdated(cid, col);
      }
    }
  }

  return { ok: loaded > 0 || plServerDisplayCacheHasUsableLedger(cid), collections: loaded, changedCollections };
}

export function clearPlServerDisplayCacheCompany(companyId: string): void {
  cacheByCompany.delete(companyKey(companyId));
}

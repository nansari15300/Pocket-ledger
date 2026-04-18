/**
 * Incremental sync client – local mode me server se sirf changed data pull.
 * lastSyncAt store karo; updatedAfter=lastSyncAt bhej kar merge karo. See docs/INCREMENTAL-SYNC.md.
 */

const STORAGE_LAST_SYNC_AT = "lastSyncAt";

export function getLastSyncAt(): number | null {
  if (typeof window === "undefined") return null;
  const ts = localStorage.getItem(STORAGE_LAST_SYNC_AT);
  return ts ? parseInt(ts, 10) : null;
}

export function setLastSyncAt(ts: number | null): void {
  if (typeof window === "undefined") return;
  if (ts == null) localStorage.removeItem(STORAGE_LAST_SYNC_AT);
  else localStorage.setItem(STORAGE_LAST_SYNC_AT, String(ts));
}

const COLLECTIONS = [
  "groups",
  "parties",
  "bank_accounts",
  "account_groups",
  "staff",
  "staff_groups",
  "taxes",
  "tax_groups",
  "items",
  "item_groups",
  "expense_accounts",
  "expense_groups",
  "vouchers",
  "devices",
  "device_history",
  "payments",
  "alarms",
  "presence",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/**
 * Fetch companies with updatedAfter (incremental). Pehli baar lastSyncAt null bhejo = full pull.
 * Server returns [{ id, ...data, updatedAt }].
 */
export async function fetchCompaniesIncremental(
  baseUrl: string,
  lastSyncAt: number | null
): Promise<{ id: string; data: Record<string, unknown>; updatedAt: number }[]> {
  const url = lastSyncAt != null
    ? `${baseUrl.replace(/\/$/, "")}/api/companies?updatedAfter=${lastSyncAt}`
    : `${baseUrl.replace(/\/$/, "")}/api/companies`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch companies");
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  return list.map((c: Record<string, unknown>) => ({
    id: String(c.id),
    data: c as Record<string, unknown>,
    updatedAt: Number(c.updatedAt) || 0,
  }));
}

/**
 * Fetch one company's collection with updatedAfter. Server returns [{ id, ...data, updatedAt }].
 */
export async function fetchCollectionIncremental(
  baseUrl: string,
  companyId: string,
  collection: string,
  lastSyncAt: number | null
): Promise<{ id: string; data: Record<string, unknown>; updatedAt: number }[]> {
  const url = lastSyncAt != null
    ? `${baseUrl.replace(/\/$/, "")}/api/companies/${companyId}/${collection}?updatedAfter=${lastSyncAt}`
    : `${baseUrl.replace(/\/$/, "")}/api/companies/${companyId}/${collection}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${collection}`);
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  return list.map((d: Record<string, unknown>) => ({
    id: String(d.id),
    data: d as Record<string, unknown>,
    updatedAt: Number(d.updatedAt) || 0,
  }));
}

/**
 * Full incremental sync: fetch companies + har company ke saari collections (updatedAfter).
 * Returns { companies, companyDocs: { [companyId]: { [collection]: docs } }, suggestedLastSyncAt }.
 * Caller (or sync service) can merge into local SQLite / update Firestore and then setLastSyncAt(suggestedLastSyncAt).
 */
export async function runIncrementalSync(baseUrl: string): Promise<{
  companies: { id: string; data: Record<string, unknown>; updatedAt: number }[];
  companyDocs: Record<string, Record<string, { id: string; data: Record<string, unknown>; updatedAt: number }[]>>;
  suggestedLastSyncAt: number;
}> {
  const lastSyncAt = getLastSyncAt();
  const now = Date.now();
  const companies = await fetchCompaniesIncremental(baseUrl, lastSyncAt);
  const companyDocs: Record<string, Record<string, { id: string; data: Record<string, unknown>; updatedAt: number }[]>> = {};

  for (const co of companies) {
    companyDocs[co.id] = {};
    for (const coll of COLLECTIONS) {
      const docs = await fetchCollectionIncremental(baseUrl, co.id, coll, lastSyncAt);
      companyDocs[co.id][coll] = docs;
    }
  }

  return {
    companies,
    companyDocs,
    suggestedLastSyncAt: now,
  };
}

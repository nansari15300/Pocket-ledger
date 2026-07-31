/**
 * Browser SQLite storage namespaces (“folders”):
 * - local — device-local / offline companies
 * - plservers — PL-server shared gate companies
 * - online — Firebase/Drive cloud-linked companies
 *
 * Read/write must target the company-kind folder so gate lists stay isolated.
 */

import {
  isDeviceLocalCompany,
  isServerGateCompany,
  type CompanyStorageRow,
} from "@/lib/companyStorageKind";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";

export const SQLITE_STORAGE_NAMESPACES = ["local", "plservers", "online"] as const;
export type SqliteStorageNamespace = (typeof SQLITE_STORAGE_NAMESPACES)[number];

const NS_MAP_KEY = "pl_company_sqlite_ns_v1";

export function isSqliteStorageNamespace(v: unknown): v is SqliteStorageNamespace {
  return v === "local" || v === "plservers" || v === "online";
}

/** Company JSON stamps → which SQLite folder holds that company’s data. */
export function resolveSqliteStorageNamespace(
  row: CompanyStorageRow | null | undefined
): SqliteStorageNamespace {
  if (!row) return "local";
  if (isServerGateCompany(row)) return "plservers";
  if (isCloudLinkedCompanyStorage(row)) return "online";
  const so = String(row.storageOption ?? "").toLowerCase().trim();
  if (so === "firebase" || so === "drive") return "online";
  if (String(row.syncPolicy ?? "").toLowerCase().trim() === "online") return "online";
  if (row.syncedFromCloud === true) return "online";
  if (isDeviceLocalCompany(row)) return "local";
  return "local";
}

export function readCachedCompanySqliteNamespace(companyId: string): SqliteStorageNamespace | null {
  if (typeof window === "undefined") return null;
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  try {
    const raw = window.localStorage.getItem(NS_MAP_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const v = map[cid];
    return isSqliteStorageNamespace(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeCachedCompanySqliteNamespace(
  companyId: string,
  ns: SqliteStorageNamespace
): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  if (!cid) return;
  try {
    const raw = window.localStorage.getItem(NS_MAP_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
    map[cid] = ns;
    window.localStorage.setItem(NS_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function clearCachedCompanySqliteNamespace(companyId: string): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  if (!cid) return;
  try {
    const raw = window.localStorage.getItem(NS_MAP_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, string>;
    if (!(cid in map)) return;
    delete map[cid];
    window.localStorage.setItem(NS_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Active gate type → which namespace(s) may be listed / written for that gate. */
export function namespacesAllowedForGateType(
  gateType: "device" | "online" | "local_server" | string
): SqliteStorageNamespace[] {
  if (gateType === "online") return ["online"];
  if (gateType === "local_server") return ["plservers"];
  if (gateType === "device") return ["local"];
  return [...SQLITE_STORAGE_NAMESPACES];
}

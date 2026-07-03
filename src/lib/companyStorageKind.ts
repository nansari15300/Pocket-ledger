import type { Company } from "@/hooks/useCompany";
import { isCloudLinkedCompanyStorage, isOfflineCompanyStorage } from "@/lib/companyUnlockGate";

type CompanyStorageRow = {
  id?: string;
  name?: string;
  ownerId?: string;
  storageOption?: string | null;
  syncPolicy?: string | null;
  syncedFromCloud?: boolean;
  isOwned?: boolean;
  plServerShared?: boolean;
  authoritativeCompanyId?: string;
};

/**
 * Device-local / offline company — explicit `storageOption: local` ya `syncPolicy: offline` Firestore mirror se pehle.
 * Selector + Danger Zone me galat "online" bucket rokne ke liye.
 */
export function isDeviceLocalCompany(c: CompanyStorageRow | null | undefined): boolean {
  if (!c) return false;
  const so = String(c.storageOption ?? "").toLowerCase().trim();
  if (so === "local") return true;
  if (String(c.syncPolicy ?? "").toLowerCase() === "offline") return true;
  if (so === "firebase" || so === "drive") return false;
  if (c.syncedFromCloud === true) return false;
  if (String(c.syncPolicy ?? "").toLowerCase() === "online") return false;
  if (String((c as { authoritativeCompanyId?: string }).authoritativeCompanyId ?? "").trim()) return false;
  return true;
}

/** Ledger read/write SQLite-only — device-local, server gate, offline sync (web dev + static + EXE/APK). */
export function companyRowUsesSqliteLedgerWrites(
  c: (CompanyStorageRow & { plServerShared?: boolean }) | null | undefined
): boolean {
  if (!c) return false;
  const so = String(c.storageOption ?? "").toLowerCase().trim();
  if (so === "local") return true;
  if (shouldReadLedgerFromSqliteOnly(c)) return true;
  if (isCloudLinkedCompanyStorage(c) && !isServerGateCompany(c)) return false;
  return isOfflineCompanyStorage(c) || isDeviceLocalCompany(c);
}

/** Handover / Delete dropdown: cloud-synced company (Firestore row as source of truth for handover) */
export function isOnlineCompanyRow(c: Company): boolean {
  return !isDeviceLocalCompany(c);
}

export function isSharedOnlineCompany(c: CompanyStorageRow | null | undefined): boolean {
  if (!c) return false;
  return !c.isOwned && !isDeviceLocalCompany(c);
}

/** LAN / remote server gate se mirrored ya shared company — Local tab se alag Server Gate tab me. */
export function isServerGateCompany(
  c: (CompanyStorageRow & { plServerShared?: boolean }) | null | undefined
): boolean {
  return c?.plServerShared === true;
}

/**
 * SQLite-only ledger row — device-local ya server-gate mirrored.
 * Firebase writes, outbox flush, aur online mirror reconcile in par mat chalao.
 */
export function isPureLocalLedgerCompany(
  c: (CompanyStorageRow & { plServerShared?: boolean }) | null | undefined
): boolean {
  if (!c) return false;
  if (isServerGateCompany(c)) return true;
  const so = String(c.storageOption ?? "").toLowerCase().trim();
  if (so !== "local") return false;
  if (c.syncedFromCloud === true) return false;
  if (String(c.syncPolicy ?? "").toLowerCase() === "online") return false;
  if (String((c as { authoritativeCompanyId?: string }).authoritativeCompanyId ?? "").trim()) return false;
  return true;
}

/** Ledger read/write SQLite only — Firestore listeners / pull skip (local restore, device-local). */
export function shouldReadLedgerFromSqliteOnly(
  c: (CompanyStorageRow & { plServerShared?: boolean }) | null | undefined
): boolean {
  if (!c) return false;
  if (isServerGateCompany(c)) return true;
  if (String(c.syncPolicy ?? "").toLowerCase() === "offline") return true;
  return isPureLocalLedgerCompany(c);
}

export type CompanyListTab = "local" | "online" | "server";

export type SelectorCompanyBuckets = {
  localOwnedCompanies: Company[];
  sharedLocalCompanies: Company[];
  cloudOwnedCompanies: Company[];
  sharedCloudCompanies: Company[];
  serverTabCompanies: Company[];
  localTabCompanies: Company[];
  onlineTabCompanies: Company[];
};

function dedupeCompaniesById(companies: Company[]): Company[] {
  const map = new Map<string, Company>();
  for (const c of companies) {
    if (c?.id) map.set(c.id, c);
  }
  return Array.from(map.values());
}

/** Mutual-exclusive Local vs Online buckets for company picker / settings dropdowns. */
export function partitionCompaniesForSelector(companies: Company[]): SelectorCompanyBuckets {
  const rows = dedupeCompaniesById(companies.filter((c): c is Company => c != null && Boolean(c?.id)));
  const owned = rows.filter((c) => c.isOwned);
  const localOwnedCompanies = owned.filter((c) => isDeviceLocalCompany(c));
  const cloudOwnedCompanies = owned.filter((c) => !isDeviceLocalCompany(c));
  const sharedCloudCompanies = rows.filter((c) => isSharedOnlineCompany(c));
  const sharedLocalCompanies = rows.filter(
    (c) =>
      !c.isOwned &&
      isDeviceLocalCompany(c) &&
      !isSharedOnlineCompany(c) &&
      !isServerGateCompany(c)
  );
  const serverTabCompanies = rows.filter((c) => isServerGateCompany(c));
  const localTabCompanies = dedupeCompaniesById(
    [...localOwnedCompanies, ...sharedLocalCompanies].filter((c) => !isServerGateCompany(c))
  );
  const onlineTabCompanies = dedupeCompaniesById(
    [...cloudOwnedCompanies, ...sharedCloudCompanies].filter((c) => !isServerGateCompany(c))
  );
  return {
    localOwnedCompanies,
    sharedLocalCompanies,
    cloudOwnedCompanies,
    sharedCloudCompanies,
    serverTabCompanies,
    localTabCompanies,
    onlineTabCompanies,
  };
}

export function defaultSelectorTab(
  companyId: string | null | undefined,
  buckets: SelectorCompanyBuckets
): CompanyListTab {
  const id = companyId?.trim();
  if (id) {
    if (buckets.localTabCompanies.some((c) => c.id === id)) return "local";
    if (buckets.onlineTabCompanies.some((c) => c.id === id)) return "online";
    if (buckets.serverTabCompanies.some((c) => c.id === id)) return "server";
  }
  if (buckets.serverTabCompanies.length > 0) return "server";
  if (buckets.localTabCompanies.length > 0) return "local";
  return "online";
}

/** Selected company sirf sahi tab me add — local ko online list me mat chipkao. */
export function ensureSelectedInTabList(
  list: Company[],
  selectedId: string | null | undefined,
  pool: Company[],
  tab: CompanyListTab
): Company[] {
  const id = selectedId?.trim();
  if (!id || list.some((c) => c.id === id)) return list;
  const selected = pool.find((c) => c.id === id);
  if (!selected) return list;
  const isLocal = isDeviceLocalCompany(selected);
  if (tab === "server" && isServerGateCompany(selected)) return [selected, ...list];
  if (tab === "local" && isLocal && !isServerGateCompany(selected)) return [selected, ...list];
  if (tab === "online" && !isLocal && !isServerGateCompany(selected)) return [selected, ...list];
  return list;
}

/** Owned companies for settings (delete / handover) — registry + filtered list merge. */
export function mergeOwnedCompaniesForUser(
  lists: Company[][],
  user: { uid: string; email: string | null } | null | undefined,
  resolveOwned: (c: Company, user: { uid: string; email: string | null }) => boolean
): Company[] {
  const byId = new Map<string, Company>();
  if (!user?.uid) return [];
  for (const list of lists) {
    for (const c of list) {
      if (!c?.id || c.isDeleted) continue;
      if ((c as Company & { movedToAdminRecycleAt?: unknown }).movedToAdminRecycleAt != null) continue;
      if (!resolveOwned(c, user)) continue;
      byId.set(c.id, { ...c, isOwned: true });
    }
  }
  return Array.from(byId.values());
}

/** Same naam do companies par ho to Select me id se alag dikhao */
export function buildDuplicateNameCountMap(companies: { name?: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of companies) {
    const k = (c.name || "").trim().toLowerCase();
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function companySelectOptionLabel(c: Company, duplicateNameCountMap: Map<string, number>): string {
  const k = (c.name || "").trim().toLowerCase();
  const dup = (duplicateNameCountMap.get(k) || 0) > 1;
  return dup ? `${c.name} · ${String(c.id).slice(0, 8)}…` : (c.name || "");
}

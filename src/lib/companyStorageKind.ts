import type { Company } from "@/hooks/useCompany";

type CompanyStorageRow = Company & {
  syncPolicy?: string | null;
  syncedFromCloud?: boolean;
  isOwned?: boolean;
};

/**
 * Device-local / offline company — explicit `storageOption: local` ya `syncPolicy: offline` Firestore mirror se pehle.
 * Selector + Danger Zone me galat "online" bucket rokne ke liye.
 */
export function isDeviceLocalCompany(c: CompanyStorageRow): boolean {
  const so = String(c.storageOption ?? "").toLowerCase().trim();
  if (so === "local") return true;
  if (String(c.syncPolicy ?? "").toLowerCase() === "offline") return true;
  if (so === "firebase" || so === "drive") return false;
  if (c.syncedFromCloud === true) return false;
  if (String(c.syncPolicy ?? "").toLowerCase() === "online") return false;
  if (String((c as { authoritativeCompanyId?: string }).authoritativeCompanyId ?? "").trim()) return false;
  return true;
}

/** Handover / Delete dropdown: cloud-synced company (Firestore row as source of truth for handover) */
export function isOnlineCompanyRow(c: Company): boolean {
  return !isDeviceLocalCompany(c);
}

export function isSharedOnlineCompany(c: CompanyStorageRow): boolean {
  return !c.isOwned && !isDeviceLocalCompany(c);
}

export type CompanyListTab = "local" | "online";

export type SelectorCompanyBuckets = {
  localOwnedCompanies: Company[];
  sharedLocalCompanies: Company[];
  cloudOwnedCompanies: Company[];
  sharedCloudCompanies: Company[];
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
  const rows = dedupeCompaniesById(companies);
  const owned = rows.filter((c) => c.isOwned);
  const localOwnedCompanies = owned.filter((c) => isDeviceLocalCompany(c));
  const cloudOwnedCompanies = owned.filter((c) => !isDeviceLocalCompany(c));
  const sharedCloudCompanies = rows.filter((c) => isSharedOnlineCompany(c));
  const sharedLocalCompanies = rows.filter(
    (c) => !c.isOwned && isDeviceLocalCompany(c) && !isSharedOnlineCompany(c)
  );
  const localTabCompanies = dedupeCompaniesById([...localOwnedCompanies, ...sharedLocalCompanies]);
  const onlineTabCompanies = dedupeCompaniesById([...cloudOwnedCompanies, ...sharedCloudCompanies]);
  return {
    localOwnedCompanies,
    sharedLocalCompanies,
    cloudOwnedCompanies,
    sharedCloudCompanies,
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
  }
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
  if (tab === "local" && isLocal) return [selected, ...list];
  if (tab === "online" && !isLocal) return [selected, ...list];
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

import type { Company } from "@/hooks/useCompany";

/** Handover / Delete dropdown: cloud-synced company (Firestore row as source of truth for handover) */
export function isOnlineCompanyRow(c: Company): boolean {
  const so = String(c.storageOption || "").toLowerCase();
  if (so === "local") return false;
  if (so === "firebase") return true;
  if (c.syncedFromCloud === true) return true;
  if (String(c.syncPolicy || "").toLowerCase() === "online") return true;
  if (String((c as { authoritativeCompanyId?: string }).authoritativeCompanyId || "").trim().length > 0) return true;
  return false;
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

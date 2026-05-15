"use client";

/**
 * Company-level unit labels for voucher lines (Sale/Purchase): merge item-derived units with
 * `companies/{id}.customUnits` so "+ Add unit" persists and dropdowns stay deduped (case-insensitive).
 */

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
/** Normalize Firestore/local JSON into string[] (ignores non-strings). */
export function parseCustomUnitsArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * Dedupe by lowercase; first spelling wins. Sorted A–Z for stable dropdown order.
 */
export function mergeUnitsForDropdown(...groups: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const g of groups) {
    for (const u of g) {
      const t = (u || "").trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (!seen.has(k)) seen.set(k, t);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Whether `units` contains `value` (case-insensitive). */
export function unitListHas(units: string[], value: string | undefined | null): boolean {
  if (value == null || value === "") return true;
  const k = value.trim().toLowerCase();
  if (!k) return true;
  return units.some((u) => u.trim().toLowerCase() === k);
}

export type PersistCustomUnitOptions = {
  companyId: string | null | undefined;
  /** Trimmed unit label from combobox (add-new or pick). */
  unitLabel: string;
  /** After SQLite / Firestore write — refresh `useCompany` local registry. */
  reloadLocalCompanyRegistry: () => void;
  /** Online: bump Firestore listeners if needed (optional). */
  triggerSync?: () => void;
};

/**
 * Append `unitLabel` to company `customUnits` if not already present (case-insensitive).
 * Local-only: SQLite company row; online: Firestore `companies/{id}`.
 */
export async function persistCustomUnitIfNew(opts: PersistCustomUnitOptions): Promise<void> {
  const { companyId, unitLabel, reloadLocalCompanyRegistry, triggerSync } = opts;
  const t = unitLabel.trim();
  if (!t || !companyId) return;

  if (isLocalOnlyMode()) {
    const row = await getLocalCompanyById(companyId);
    if (!row) return;
    const prev = parseCustomUnitsArray(row.customUnits);
    if (prev.some((u) => u.toLowerCase() === t.toLowerCase())) return;
    const merged = mergeUnitsForDropdown(prev, [t]);
    await upsertLocalCompany({ ...row, customUnits: merged } as Parameters<typeof upsertLocalCompany>[0]);
    reloadLocalCompanyRegistry();
    return;
  }

  const ref = doc(firestore, "companies", companyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const fromServer = parseCustomUnitsArray(snap.data()?.customUnits);
  if (fromServer.some((u) => u.toLowerCase() === t.toLowerCase())) return;
  const merged = mergeUnitsForDropdown(fromServer, [t]);
  await updateDoc(ref, { customUnits: merged });
  // Listener updates allCompanies; optional nudge if snapshot lags in edge cases.
  triggerSync?.();
}

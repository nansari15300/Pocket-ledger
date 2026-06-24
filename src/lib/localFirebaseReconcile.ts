"use client";

import type { LocalCompanyDoc } from "@/lib/localCompanyStore";

export const LOCAL_FIREBASE_RECONCILE_COLLECTION_OPTIONS = [
  { key: "parties", label: "Parties" },
  { key: "items", label: "Items & Services" },
  { key: "bank_accounts", label: "Bank/Cash" },
  { key: "staff", label: "Staff" },
  { key: "taxes", label: "Tax" },
  { key: "expense_accounts", label: "Income & Expense" },
  { key: "vouchers", label: "Vouchers" },
] as const;

export type LocalFirebaseReconcileCollection =
  (typeof LOCAL_FIREBASE_RECONCILE_COLLECTION_OPTIONS)[number]["key"];

const ALLOWED_COLLECTIONS = new Set<string>(
  LOCAL_FIREBASE_RECONCILE_COLLECTION_OPTIONS.map((row) => row.key)
);

type CompanyLike = LocalCompanyDoc | Record<string, unknown> | null | undefined;

function parseSelectedCollections(raw: unknown): LocalFirebaseReconcileCollection[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalFirebaseReconcileCollection[] = [];
  for (const row of raw) {
    const key = String(row ?? "").trim().toLowerCase();
    if (!ALLOWED_COLLECTIONS.has(key)) continue;
    out.push(key as LocalFirebaseReconcileCollection);
  }
  return Array.from(new Set(out));
}

function isExplicitLocalOnlyCompanyRow(company: CompanyLike): boolean {
  const c = (company ?? {}) as Record<string, unknown>;
  const soRaw = c.storageOption;
  const storageOption =
    typeof soRaw === "string" && soRaw.trim() !== "" ? soRaw.toLowerCase().trim() : "";
  const syncPolicy = String(c.syncPolicy || "").toLowerCase();
  const syncedFromCloud = c.syncedFromCloud === true;
  const hasAuthoritative = String(c.authoritativeCompanyId || "").trim().length > 0;
  return (
    storageOption === "local" &&
    !syncedFromCloud &&
    !hasAuthoritative &&
    syncPolicy !== "online"
  );
}

export type LocalFirebaseReconcileConfig = {
  enabled: boolean;
  selectedCollections: LocalFirebaseReconcileCollection[];
  blockedByDrive: boolean;
  active: boolean;
};

export function readLocalFirebaseReconcileConfig(company: CompanyLike): LocalFirebaseReconcileConfig {
  const c = (company ?? {}) as Record<string, unknown>;
  const selectedCollections = parseSelectedCollections(c.localFirebaseReconcileCollections);
  const enabled = c.localFirebaseReconcileEnabled === true;
  const driveConnected =
    c.cloudSyncEnabled === true && String(c.cloudSyncProvider || "").trim().length > 0;
  const active =
    isExplicitLocalOnlyCompanyRow(c) &&
    enabled &&
    !driveConnected &&
    selectedCollections.length > 0;
  return {
    enabled,
    selectedCollections,
    blockedByDrive: driveConnected,
    active,
  };
}

export function canReconcileLocalCollectionViaFirebase(
  company: CompanyLike,
  collectionName: string
): boolean {
  const cfg = readLocalFirebaseReconcileConfig(company);
  if (!cfg.active) return false;
  const key = String(collectionName || "").trim().toLowerCase();
  return cfg.selectedCollections.includes(key as LocalFirebaseReconcileCollection);
}


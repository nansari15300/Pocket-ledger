"use client";

import { isFirebaseLedgerDataSyncDisabled } from "@/lib/firebaseLedgerDataSyncDisabled";

export const FIREBASE_LEDGER_COMPANY_SYNC_PREFS_KEY = "pl_firebase_ledger_company_sync_prefs_v1";
export const FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT =
  "pl-firebase-ledger-company-sync-prefs-changed";
export const FIREBASE_LEDGER_COMPANY_REGISTRY_PULL_EVENT = "pl-firebase-ledger-company-registry-pull";

export type FirebaseLedgerCompanySyncEntry = {
  /** Company selected for cloud sync. */
  selected: boolean;
  /** Ledger / SQLite doc sync (no attachment files). */
  data: boolean;
  /** Attachment file upload/download — requires data. */
  attachments: boolean;
};

export type FirebaseLedgerCompanySyncPrefs = {
  companies: Record<string, FirebaseLedgerCompanySyncEntry>;
};

const EMPTY_ENTRY: FirebaseLedgerCompanySyncEntry = {
  selected: false,
  data: false,
  attachments: false,
};

function normalizeEntry(raw: unknown): FirebaseLedgerCompanySyncEntry {
  if (!raw || typeof raw !== "object") return { ...EMPTY_ENTRY };
  const row = raw as Partial<FirebaseLedgerCompanySyncEntry>;
  const selected = row.selected === true;
  const data = selected && row.data === true;
  const attachments = data && row.attachments === true;
  return { selected, data, attachments };
}

export function readFirebaseLedgerCompanySyncPrefs(): FirebaseLedgerCompanySyncPrefs {
  if (typeof window === "undefined") return { companies: {} };
  try {
    const raw = window.localStorage.getItem(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_KEY);
    if (!raw) return { companies: {} };
    const parsed = JSON.parse(raw) as { companies?: Record<string, unknown> };
    const companies: Record<string, FirebaseLedgerCompanySyncEntry> = {};
    for (const [id, entry] of Object.entries(parsed.companies || {})) {
      const cid = String(id || "").trim();
      if (!cid) continue;
      companies[cid] = normalizeEntry(entry);
    }
    return { companies };
  } catch {
    return { companies: {} };
  }
}

export function saveFirebaseLedgerCompanySyncPrefs(prefs: FirebaseLedgerCompanySyncPrefs): void {
  if (typeof window === "undefined") return;
  const companies: Record<string, FirebaseLedgerCompanySyncEntry> = {};
  for (const [id, entry] of Object.entries(prefs.companies || {})) {
    const cid = String(id || "").trim();
    if (!cid) continue;
    companies[cid] = normalizeEntry(entry);
  }
  try {
    window.localStorage.setItem(
      FIREBASE_LEDGER_COMPANY_SYNC_PREFS_KEY,
      JSON.stringify({ companies })
    );
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function getFirebaseLedgerCompanySyncEntry(companyId: string): FirebaseLedgerCompanySyncEntry {
  const id = String(companyId || "").trim();
  if (!id) return { ...EMPTY_ENTRY };
  return readFirebaseLedgerCompanySyncPrefs().companies[id] ?? { ...EMPTY_ENTRY };
}

export function patchFirebaseLedgerCompanySyncEntry(
  companyId: string,
  patch: Partial<FirebaseLedgerCompanySyncEntry>
): FirebaseLedgerCompanySyncPrefs {
  const id = String(companyId || "").trim();
  const prefs = readFirebaseLedgerCompanySyncPrefs();
  if (!id) return prefs;
  const prev = prefs.companies[id] ?? { ...EMPTY_ENTRY };
  let next: FirebaseLedgerCompanySyncEntry = normalizeEntry({ ...prev, ...patch });
  if (!next.selected) {
    next = { selected: false, data: false, attachments: false };
  } else if (!next.data) {
    next = { ...next, attachments: false };
  }
  const companies = { ...prefs.companies, [id]: next };
  const out = { companies };
  saveFirebaseLedgerCompanySyncPrefs(out);
  return out;
}

/** Global switch ON + company ticked + data ticked. */
export function isFirebaseLedgerCompanyDataSyncEnabled(companyId: string): boolean {
  if (isFirebaseLedgerDataSyncDisabled()) return false;
  const entry = getFirebaseLedgerCompanySyncEntry(companyId);
  return entry.selected && entry.data;
}

/** Requires data sync; attachment file sync only when this is true. */
export function isFirebaseLedgerCompanyAttachmentSyncEnabled(companyId: string): boolean {
  if (!isFirebaseLedgerCompanyDataSyncEnabled(companyId)) return false;
  return getFirebaseLedgerCompanySyncEntry(companyId).attachments;
}

"use client";

import type { Company } from "@/hooks/useCompany";
import { isDeviceLocalCompany, isPureLocalLedgerCompany, isServerGateCompany } from "@/lib/companyStorageKind";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import { resolveHostPlanFieldsForPlShare } from "@/lib/plServerHostPlanSync";
import { computePlServerCompanyLoginMeta } from "@/lib/plServerCompanyLoginMeta";
import { localCompanyAccessEmails } from "@/lib/localCompanyMembership";
import type { CompanyClientDataDeleteCommand } from "@/lib/companyClientDataDeleteCommands";

type ShareableCompanyRow = Company | LocalCompanyDoc | { storageOption?: string };

/**
 * Host PC par P2P server se share — sirf **pure local** company (SQLite-owned).
 * Online / Firestore mirror (`storageOption: firebase`, `syncedFromCloud`) yahan nahi — unka share Firebase se hota hai.
 */
export function isLocalServerShareableCompany(c: ShareableCompanyRow | null | undefined): boolean {
  if (!c) return false;
  if (isServerGateCompany(c as { plServerShared?: boolean })) return false;
  if (
    isCloudLinkedCompanyStorage(c as { storageOption?: string; syncedFromCloud?: boolean }) &&
    !isDeviceLocalCompany(c as Company)
  ) {
    return false;
  }
  const syncPolicy = String((c as { syncPolicy?: string }).syncPolicy ?? "")
    .toLowerCase()
    .trim();
  if (syncPolicy === "online") return false;
  if (String((c as { authoritativeCompanyId?: string }).authoritativeCompanyId ?? "").trim()) {
    return false;
  }
  return isPureLocalLedgerCompany(c as Company);
}

export type PlServerSharedCompanySummary = {
  id: string;
  name: string;
  storageOption: "local";
  ownerEmail?: string | null;
  /** Host owner plan — staff client SQLite me persist (PL offline pe drop na ho) */
  planId?: string | null;
  planExpiryMs?: number | null;
  offlineLicenseValidUntilMs?: number | null;
  /** Host se — client unlock dialog skip ya username prefill */
  requiresLogin?: boolean;
  usernameHint?: string | null;
  /** Server-side access filter only; stripped before sending company summaries to clients. */
  accessEmails?: string[];
  accessAccount?: string | null;
  /** Host local users — server email filter fallback when accessEmails incomplete. */
  localCompanyUsers?: unknown[];
  /** Delivered even after target user is no longer in accessEmails, so their client can wipe local SQLite. */
  clientDataDeleteCommands?: CompanyClientDataDeleteCommand[];
};

export function toPlServerSharedCompanySummary(row: {
  id: string;
  name?: string;
  ownerEmail?: string | null;
  ownerId?: unknown;
  planId?: unknown;
  planExpiryMs?: unknown;
  offlineLicenseValidUntilMs?: unknown;
  isOwned?: unknown;
  sharedWithEmails?: unknown;
  sharedWithEmailsLower?: unknown;
  localCompanyUsers?: unknown;
  clientDataDeleteCommands?: unknown;
}): PlServerSharedCompanySummary {
  const plan = resolveHostPlanFieldsForPlShare(row);
  const loginMeta = computePlServerCompanyLoginMeta(row);
  return {
    id: String(row.id),
    name: String(row.name || row.id),
    storageOption: "local",
    ownerEmail: row.ownerEmail ? String(row.ownerEmail) : null,
    planId: plan.planId,
    planExpiryMs: plan.planExpiryMs,
    offlineLicenseValidUntilMs: plan.offlineLicenseValidUntilMs,
    requiresLogin: loginMeta.requiresLogin,
    usernameHint: loginMeta.usernameHint,
    accessEmails: localCompanyAccessEmails(row as never),
    localCompanyUsers: Array.isArray(row.localCompanyUsers) ? row.localCompanyUsers : [],
    clientDataDeleteCommands: Array.isArray(row.clientDataDeleteCommands)
      ? (row.clientDataDeleteCommands as CompanyClientDataDeleteCommand[])
      : [],
  };
}

/** Host IPC: async — same-owner + device plan cache se Pro+ resolve. */
export async function toPlServerSharedCompanySummaryAsync(row: {
  id: string;
  name?: string;
  ownerEmail?: string | null;
  ownerId?: unknown;
  planId?: unknown;
  planExpiryMs?: unknown;
  offlineLicenseValidUntilMs?: unknown;
  isOwned?: unknown;
  sharedWithEmails?: unknown;
  sharedWithEmailsLower?: unknown;
  localCompanyUsers?: unknown;
  clientDataDeleteCommands?: unknown;
}): Promise<PlServerSharedCompanySummary> {
  const { resolveHostPlanFieldsForPlShareAsync } = await import("@/lib/plServerHostPlanSync");
  let freshRow = row;
  try {
    const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
    const fresh = await getLocalCompanyById(String(row.id), { includeDeleted: true });
    if (fresh) {
      freshRow = { ...row, ...fresh };
    }
  } catch {
    freshRow = row;
  }
  const plan = await resolveHostPlanFieldsForPlShareAsync(freshRow);
  const loginMeta = computePlServerCompanyLoginMeta(freshRow);
  return {
    id: String(freshRow.id),
    name: String(freshRow.name || freshRow.id),
    storageOption: "local",
    ownerEmail: freshRow.ownerEmail ? String(freshRow.ownerEmail) : null,
    planId: plan.planId,
    planExpiryMs: plan.planExpiryMs,
    offlineLicenseValidUntilMs: plan.offlineLicenseValidUntilMs,
    requiresLogin: loginMeta.requiresLogin,
    usernameHint: loginMeta.usernameHint,
    accessEmails: localCompanyAccessEmails(freshRow as never),
    localCompanyUsers: Array.isArray(freshRow.localCompanyUsers) ? freshRow.localCompanyUsers : [],
    clientDataDeleteCommands: Array.isArray(freshRow.clientDataDeleteCommands)
      ? (freshRow.clientDataDeleteCommands as CompanyClientDataDeleteCommand[])
      : [],
  };
}

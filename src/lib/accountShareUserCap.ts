import {
  isAtOrOverEntitlementCap,
  isUnlimitedEntitlementCap,
  type Plan,
} from "@/config/plans";
import type { Company } from "@/hooks/useCompany";
import { resolveLedgerMode } from "@/lib/ledgerModes/resolveLedgerMode";
import {
  parsePurchasedPlanAddOns,
  planUserCapWithAddOns,
} from "@/lib/planAddOns";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";

export type CompanyShareCapRow = {
  storageOption?: string | null;
  syncedFromCloud?: boolean;
  syncPolicy?: string | null;
  authoritativeCompanyId?: string | null;
  plServerShared?: boolean;
};

type OwnedCompanyShareRow = {
  sharedWithEmails?: unknown;
  ownerEmail?: unknown;
};

export type AccountUserCapBucket = "online" | "local";

export type LocalRegistryUserCapRow = CompanyShareCapRow & {
  ownerId?: string | null;
  localCompanyUsers?: unknown;
};

export function mergeCompanyShareCapRow(
  base: CompanyShareCapRow | null | undefined,
  firestore: CompanyShareCapRow | null | undefined
): CompanyShareCapRow {
  return { ...(base ?? {}), ...(firestore ?? {}) };
}

/** Online bucket → maxUsers; local / SQLite companies → maxUsersLocal. */
export function bucketForCompanyUserCap(
  company: CompanyShareCapRow | null | undefined
): AccountUserCapBucket {
  return companyUsesLocalMaxUsersCap(company) ? "local" : "online";
}

export function filterOwnedCompaniesForUserCapBucket<T extends CompanyShareCapRow>(
  rows: T[],
  bucket: AccountUserCapBucket
): T[] {
  return rows.filter((row) => bucketForCompanyUserCap(row) === bucket);
}

function localCompanyUserMemberKey(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shareEmail = String(o.shareEmail || "").trim().toLowerCase();
  const username = String(o.username || "").trim().toLowerCase();
  const key = shareEmail || username;
  return key || null;
}

/** Unique owner + local SQLite users across all owned local-bucket companies (one slot per person). */
export function collectLocalBucketShareMemberEmails(params: {
  ownerEmail?: string | null;
  ownerUid?: string | null;
  localRegistryRows: LocalRegistryUserCapRow[];
}): Set<string> {
  const superAdminEmails = new Set(getSuperAdminEmails().map((e) => e.toLowerCase().trim()));
  const memberEmails = new Set<string>();
  const ownerEmailNorm = String(params.ownerEmail || "").toLowerCase().trim();
  if (ownerEmailNorm) memberEmails.add(ownerEmailNorm);
  const ownerUid = String(params.ownerUid || "").trim();
  for (const row of params.localRegistryRows) {
    if (ownerUid && String(row.ownerId || "").trim() !== ownerUid) continue;
    if (!companyUsesLocalMaxUsersCap(row)) continue;
    for (const raw of Array.isArray(row.localCompanyUsers) ? row.localCompanyUsers : []) {
      const key = localCompanyUserMemberKey(raw);
      if (key && !superAdminEmails.has(key)) memberEmails.add(key);
    }
  }
  return memberEmails;
}

/**
 * Account-wide user count for the selected company's bucket (online Firebase vs local SQLite),
 * not per-company.
 */
export function collectAccountBucketShareMemberEmails(params: {
  ownerEmail?: string | null;
  ownerUid?: string | null;
  bucket: AccountUserCapBucket;
  firestoreOwnedCompanyRows: Array<OwnedCompanyShareRow & CompanyShareCapRow>;
  localRegistryRows?: LocalRegistryUserCapRow[];
}): Set<string> {
  if (params.bucket === "online") {
    const onlineRows = filterOwnedCompaniesForUserCapBucket(params.firestoreOwnedCompanyRows, "online");
    return collectAccountWideShareMemberEmails({
      ownerEmail: params.ownerEmail,
      ownedCompanyRows: onlineRows,
    });
  }
  return collectLocalBucketShareMemberEmails({
    ownerEmail: params.ownerEmail,
    ownerUid: params.ownerUid,
    localRegistryRows: params.localRegistryRows ?? [],
  });
}

/** Online ledger → maxUsers; local Drive / PL Server → maxUsersLocal (same rules as `resolveLedgerMode`). */
export function companyUsesLocalMaxUsersCap(
  company: CompanyShareCapRow | null | undefined
): boolean {
  if (!company) return true;
  return resolveLedgerMode(company as Company) !== "online";
}

/** Owner + shared invite emails on one company (per-company user cap). */
export function collectCompanyShareMemberEmails(params: {
  ownerEmail?: string | null;
  sharedWithEmails?: unknown;
  sharedWith?: Array<{ email?: string | null }>;
}): Set<string> {
  const superAdminEmails = new Set(getSuperAdminEmails().map((e) => e.toLowerCase().trim()));
  const memberEmails = new Set<string>();
  const ownerEmailNorm = String(params.ownerEmail || "").toLowerCase().trim();
  if (ownerEmailNorm) memberEmails.add(ownerEmailNorm);
  if (Array.isArray(params.sharedWith)) {
    for (const entry of params.sharedWith) {
      const normalized = String(entry?.email || "").toLowerCase().trim();
      if (normalized && !superAdminEmails.has(normalized)) memberEmails.add(normalized);
    }
  }
  for (const email of Array.isArray(params.sharedWithEmails) ? params.sharedWithEmails : []) {
    const normalized = String(email || "").toLowerCase().trim();
    if (normalized && !superAdminEmails.has(normalized)) memberEmails.add(normalized);
  }
  return memberEmails;
}

/** Unique owner + shared invite emails across every company owned by this account. */
export function collectAccountWideShareMemberEmails(params: {
  ownerEmail?: string | null;
  ownedCompanyRows: OwnedCompanyShareRow[];
}): Set<string> {
  const superAdminEmails = new Set(getSuperAdminEmails().map((e) => e.toLowerCase().trim()));
  const memberEmails = new Set<string>();
  const ownerEmailNorm = String(params.ownerEmail || "").toLowerCase().trim();
  if (ownerEmailNorm) memberEmails.add(ownerEmailNorm);
  for (const data of params.ownedCompanyRows) {
    const companyOwnerEmail = String(data.ownerEmail || ownerEmailNorm).toLowerCase().trim();
    if (companyOwnerEmail) memberEmails.add(companyOwnerEmail);
    for (const email of Array.isArray(data.sharedWithEmails) ? data.sharedWithEmails : []) {
      const normalized = String(email || "").toLowerCase().trim();
      if (normalized && !superAdminEmails.has(normalized)) memberEmails.add(normalized);
    }
  }
  return memberEmails;
}

/** Plan base maxUsers + purchased user add-ons for this company's online vs local bucket. */
export function resolveCompanyShareUserCap(
  plan: Plan,
  company: CompanyShareCapRow | null | undefined,
  ownerUserData: Record<string, unknown> | null | undefined
): number {
  const localCompany = companyUsesLocalMaxUsersCap(company);
  const addons = parsePurchasedPlanAddOns(ownerUserData);
  const raw = planUserCapWithAddOns(plan, localCompany, addons);
  return isUnlimitedEntitlementCap(raw) ? Number.POSITIVE_INFINITY : Math.max(0, raw);
}

/** @deprecated Prefer `resolveCompanyShareUserCap` with `syncedFromCloud` on the company row. */
export function resolveAccountShareUserCap(
  plan: Plan,
  storageOption: string | null | undefined,
  ownerUserData: Record<string, unknown> | null | undefined
): number {
  return resolveCompanyShareUserCap(plan, { storageOption }, ownerUserData);
}

/** Block only when a new unique invite email would exceed the effective cap. */
export function wouldBlockNewShareInvite(params: {
  memberEmails: Set<string>;
  inviteEmail: string;
  maxUsers: number;
}): boolean {
  const inviteNorm = String(params.inviteEmail || "").trim().toLowerCase();
  if (inviteNorm && params.memberEmails.has(inviteNorm)) {
    return false;
  }
  const nextCount = params.memberEmails.size + (inviteNorm ? 1 : 0);
  return isAtOrOverEntitlementCap(nextCount, params.maxUsers);
}

export function formatShareUserCapMessage(maxUsers: number): string {
  if (!Number.isFinite(maxUsers)) {
    return "Upgrade to add more users.";
  }
  return `Your plan allows up to ${maxUsers} user${maxUsers === 1 ? "" : "s"} (including add-ons). Buy more under Billing → Add-on service or upgrade your plan.`;
}

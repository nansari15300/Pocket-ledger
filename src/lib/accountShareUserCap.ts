import {
  companyStorageIsLocal,
  isAtOrOverEntitlementCap,
  isUnlimitedEntitlementCap,
  type Plan,
} from "@/config/plans";
import {
  parsePurchasedPlanAddOns,
  planUserCapWithAddOns,
} from "@/lib/planAddOns";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";

type OwnedCompanyShareRow = {
  sharedWithEmails?: unknown;
  ownerEmail?: unknown;
};

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

/** Plan base maxUsers + purchased user add-ons for online/local storage. */
export function resolveAccountShareUserCap(
  plan: Plan,
  storageOption: string | null | undefined,
  ownerUserData: Record<string, unknown> | null | undefined
): number {
  const localCompany = companyStorageIsLocal(storageOption);
  const addons = parsePurchasedPlanAddOns(ownerUserData);
  const raw = planUserCapWithAddOns(plan, localCompany, addons);
  return isUnlimitedEntitlementCap(raw) ? Number.POSITIVE_INFINITY : Math.max(0, raw);
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

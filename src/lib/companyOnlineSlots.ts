"use client";

import type { Entitlements, Plan, PlanId } from "@/config/plans";
import { getPlan, numericEntitlement } from "@/config/plans";
import { planAllowsFirebaseOnline } from "@/lib/planSyncEntitlements";

/**
 * Kitni cloud-linked (storage ≠ local) companies allow hain — upload/create ke liye.
 * - `maxOnlineCompanies` > 0: paid tiers (Advance+) — is cap aur `maxCompanies` (online) dono me se chhota.
 * - `maxOnlineCompanies` === 0: Basic / legacy — admin "Max companies (online)" = `maxCompanies` follow karo
 *   (admin sirf `maxCompanies` edit karta hai; purana code sirf `maxOnlineCompanies` padhta tha isliye 0 slot dikh raha tha).
 */
export function maxOnlineSlotsFromEntitlements(entitlements: Partial<Entitlements> | undefined): number {
  const e = entitlements ?? {};
  const dedicated =
    typeof e.maxOnlineCompanies === "number" && Number.isFinite(e.maxOnlineCompanies) ? e.maxOnlineCompanies : 0;
  const maxCompaniesOnline = numericEntitlement(e, "maxCompanies", false);
  if (dedicated > 0) {
    return maxCompaniesOnline > 0 ? Math.min(dedicated, maxCompaniesOnline) : dedicated;
  }
  return maxCompaniesOnline > 0 ? maxCompaniesOnline : 0;
}

/** "Online" slot = company root Firestore-linked (not pure offline row). */
export function isCompanyOnlineSlot(c: { storageOption?: string }): boolean {
  return String(c.storageOption || "local").toLowerCase() !== "local";
}

export function countOnlineCompanySlots(
  companies: ReadonlyArray<{ storageOption?: string; isDeleted?: boolean }>
): number {
  return companies.filter((c) => isCompanyOnlineSlot(c) && !c.isDeleted).length;
}

/** Online slots for subscription: only this owner's owned companies (shared online rows do not consume user's slots). */
export function countOnlineCompanySlotsForOwner(
  companies: ReadonlyArray<{
    storageOption?: string;
    isDeleted?: boolean;
    isOwned?: boolean;
    ownerId?: string;
  }>,
  ownerUid: string
): number {
  const uid = ownerUid.trim();
  if (!uid) return countOnlineCompanySlots(companies);
  return companies.filter(
    (c) =>
      isCompanyOnlineSlot(c) &&
      !c.isDeleted &&
      c.isOwned === true &&
      String(c.ownerId || "").trim() === uid
  ).length;
}

/** Local-only rows (`storageOption === "local"`) — owner account ke offline company slots vs `maxCompaniesLocal`. */
export function countLocalCompanySlotsForOwner(
  companies: ReadonlyArray<{
    storageOption?: string;
    isDeleted?: boolean;
    isOwned?: boolean;
    ownerId?: string;
  }>,
  ownerUid: string
): number {
  const uid = ownerUid.trim();
  if (!uid) return 0;
  return companies.filter(
    (c) =>
      !isCompanyOnlineSlot(c) &&
      !c.isDeleted &&
      c.isOwned === true &&
      String(c.ownerId || "").trim() === uid
  ).length;
}

export function maxOnlineCompaniesForPlan(
  planId: PlanId | string | null | undefined,
  /** `app_settings/plans` merge — pass karo taaki admin `maxCompanies` / `maxOnlineCompanies` sahi reflect ho */
  livePlan?: Plan | null
): number {
  const id = ((planId && String(planId)) as PlanId) || "basic";
  const plan = livePlan ?? getPlan(id);
  if (!planAllowsFirebaseOnline(id, plan)) return 0;
  return maxOnlineSlotsFromEntitlements(plan.entitlements);
}

/** Current company local hai aur upload ke baad online count limit ke andar aa sakta hai. */
export function canUploadOneMoreOnline(
  allCompanies: ReadonlyArray<{
    id: string;
    storageOption?: string;
    isDeleted?: boolean;
    isOwned?: boolean;
    ownerId?: string;
  }>,
  planId: PlanId | string | null | undefined,
  /** uploading this id — agar pehle se online tha to count me already hai */
  candidateId: string,
  /** Jab set ho: sirf is owner ki owned online rows ginti (account-level slots). */
  ownerUid?: string | null,
  livePlan?: Plan | null
): { ok: boolean; max: number; current: number } {
  const max = maxOnlineCompaniesForPlan(planId, livePlan);
  const currentOnline =
    ownerUid?.trim() != null && ownerUid.trim() !== ""
      ? countOnlineCompanySlotsForOwner(allCompanies, ownerUid.trim())
      : countOnlineCompanySlots(allCompanies);
  const candidate = allCompanies.find((c) => c.id === candidateId);
  const wasOnline = candidate ? isCompanyOnlineSlot(candidate) : false;
  const currentAfter = wasOnline ? currentOnline : currentOnline + 1;
  return { ok: currentAfter <= max, max, current: currentOnline };
}

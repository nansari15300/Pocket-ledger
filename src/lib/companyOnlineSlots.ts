"use client";

import type { PlanId } from "@/config/plans";
import { limitFor } from "@/config/plans";

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

export function maxOnlineCompaniesForPlan(planId: PlanId | string | null | undefined): number {
  const id = (planId && String(planId)) as PlanId;
  return limitFor(id || "basic", "maxOnlineCompanies");
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
  ownerUid?: string | null
): { ok: boolean; max: number; current: number } {
  const max = maxOnlineCompaniesForPlan(planId);
  const currentOnline =
    ownerUid?.trim() != null && ownerUid.trim() !== ""
      ? countOnlineCompanySlotsForOwner(allCompanies, ownerUid.trim())
      : countOnlineCompanySlots(allCompanies);
  const candidate = allCompanies.find((c) => c.id === candidateId);
  const wasOnline = candidate ? isCompanyOnlineSlot(candidate) : false;
  const currentAfter = wasOnline ? currentOnline : currentOnline + 1;
  return { ok: currentAfter <= max, max, current: currentOnline };
}

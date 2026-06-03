"use client";

import type { EntitlementKey, Entitlements, Plan, PlanId } from "@/config/plans";
import { getPlan } from "@/config/plans";

function entitlementBool(entitlements: Partial<Entitlements> | undefined, key: EntitlementKey): boolean {
  const v = entitlements?.[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  return true;
}

export function planAllowsFirebaseOnline(
  planId: PlanId | string | null | undefined,
  livePlan?: Plan | null
): boolean {
  const plan = livePlan ?? getPlan((planId as PlanId) || "basic");
  return entitlementBool(plan.entitlements, "allowFirebaseOnlineCompanies");
}

export function planAllowsGoogleDriveSync(
  planId: PlanId | string | null | undefined,
  livePlan?: Plan | null
): boolean {
  const plan = livePlan ?? getPlan((planId as PlanId) || "basic");
  return entitlementBool(plan.entitlements, "allowGoogleDriveCloudSync");
}

export function planAllowsDropboxSync(
  planId: PlanId | string | null | undefined,
  livePlan?: Plan | null
): boolean {
  const plan = livePlan ?? getPlan((planId as PlanId) || "basic");
  return entitlementBool(plan.entitlements, "allowDropboxCloudSync");
}

export function planAllowsAnyCloudFileSync(
  planId: PlanId | string | null | undefined,
  livePlan?: Plan | null
): boolean {
  return planAllowsGoogleDriveSync(planId, livePlan) || planAllowsDropboxSync(planId, livePlan);
}

/** Online Firestore company slots — plan Firebase off ho to 0. */
export function maxOnlineSlotsRespectingPlan(
  planId: PlanId | string | null | undefined,
  baseMaxOnline: number,
  livePlan?: Plan | null
): number {
  if (!planAllowsFirebaseOnline(planId, livePlan)) return 0;
  return baseMaxOnline;
}

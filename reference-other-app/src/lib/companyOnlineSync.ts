"use client";

import type { Company } from "@/hooks/useCompany";
import type { Plan, PlanId } from "@/config/plans";

export type CompanyOnlineSyncState = {
  planAllowsOnlineSync: boolean;
  companyWantsOnlineSync: boolean;
  effectiveOnlineSyncEnabled: boolean;
};

export function resolveCompanyOnlineSync(
  company: Company | null | undefined,
  plans: Record<PlanId, Plan>
): CompanyOnlineSyncState {
  const companyWithSync = company as (Company & {
    onlineSyncPreferenceSet?: boolean;
    onlineSyncEnabled?: boolean;
  }) | null | undefined;
  const planId = ((company?.planId as PlanId | undefined) || "basic");
  const activePlan = plans[planId];
  const planAllowsOnlineSync = ((activePlan?.entitlements as { hasOnlineSync?: boolean } | undefined)?.hasOnlineSync) === true;
  // Preserve legacy companies as online by default, but once a company has an explicit sync preference we must respect it even after plan changes.
  const hasExplicitSyncPreference =
    companyWithSync?.onlineSyncPreferenceSet === true || typeof companyWithSync?.onlineSyncEnabled === "boolean";
  const companyWantsOnlineSync = hasExplicitSyncPreference
    ? companyWithSync?.onlineSyncEnabled === true
    : true;

  return {
    planAllowsOnlineSync,
    companyWantsOnlineSync,
    effectiveOnlineSyncEnabled: planAllowsOnlineSync && companyWantsOnlineSync,
  };
}


'use client'

import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { getCompanyPlanExpiryMsFromDoc } from "@/lib/companyPlanExpiryMs";
import { normalizePlanIdForClient } from "@/config/plans";
import { useTemporaryFeatureUnlock } from "@/hooks/useTemporaryFeatureUnlock";

/** Plan / company-settings gate only — no rewarded-ad overlay. */
export function usePlanFeatureAllowed(featureKey: string) {
  const { company } = useCompany();
  const { customUser } = useAuth();

  if (customUser?.role === "SuperAdmin") return true;

  if (!company) return false;

  const planId = normalizePlanIdForClient((company as { planId?: string }).planId);
  if (planId !== "basic") {
    const expiryMs = getCompanyPlanExpiryMsFromDoc(company);
    if (expiryMs == null || Date.now() > expiryMs) return false;
  }

  const settings = (company as { settings?: Record<string, unknown> }).settings || {};

  return settings[featureKey] !== false;
}

export function useFeatureAccess(featureKey: string) {
  const planAllowed = usePlanFeatureAllowed(featureKey);
  const temporarilyUnlocked = useTemporaryFeatureUnlock(featureKey);
  return planAllowed || temporarilyUnlocked;
}

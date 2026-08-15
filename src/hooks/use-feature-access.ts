
'use client'

import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { getCompanyPlanExpiryMsFromDoc } from "@/lib/companyPlanExpiryMs";
import { normalizePlanIdForClient } from "@/config/plans";

export function useFeatureAccess(featureKey: string) {
  const { company } = useCompany();
  const { customUser } = useAuth();
  
  if (customUser?.role === 'SuperAdmin') return true;

  if (!company) return false;

  const planId = normalizePlanIdForClient((company as { planId?: string }).planId);
  // Basic has no paid window. Paid / online-demo rows may carry `planExpiry`
  // and/or `planExpiryMs` — use the shared parser so demo users are not treated
  // as expired just because only the millis field is present.
  if (planId !== "basic") {
    const expiryMs = getCompanyPlanExpiryMsFromDoc(company);
    if (expiryMs == null || Date.now() > expiryMs) return false;
  }

  const settings = (company as any).settings || {};
  
  // Default to true if the feature key is not explicitly set to false
  return settings[featureKey] !== false;
}

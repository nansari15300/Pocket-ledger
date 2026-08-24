"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { resolvePlanIdForActiveCompany } from "@/lib/accountPlanForOwner";
import type { EntitlementKey } from "@/config/plans";

const FREEZE_ENTITLEMENT_KEY: EntitlementKey = "masterAccountFreezeEnabled";

/** Plan + company override + role — master account freeze feature gate. */
export function useMasterAccountFreezeFeature() {
  const { customUser } = useAuth();
  const { company, allCompanies } = useCompany();
  const { can } = usePermissions();
  const livePlans = useLivePlans();

  const planEnabled = useMemo(() => {
    const planId = resolvePlanIdForActiveCompany(
      company,
      allCompanies,
      customUser?.uid,
      customUser?.email
    );
    const plan = getPlanFromPlans(livePlans, planId);
    const companyOverride = (company as { settings?: Record<string, unknown> } | null)?.settings?.[
      FREEZE_ENTITLEMENT_KEY
    ];
    if (typeof companyOverride === "boolean") return companyOverride;
    return plan.entitlements[FREEZE_ENTITLEMENT_KEY] === true;
  }, [company, allCompanies, customUser?.uid, customUser?.email, livePlans]);

  const canToggle = planEnabled && can("freeze_master_account");

  return {
    planEnabled,
    enabled: planEnabled,
    canToggle,
    canEditMessage: canToggle,
  };
}

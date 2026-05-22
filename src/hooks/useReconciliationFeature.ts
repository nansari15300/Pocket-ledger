"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { resolvePlanIdForActiveCompany } from "@/lib/accountPlanForOwner";

/** Plan + company setting + role — Share for Reconciliation feature gate. */
export function useReconciliationFeature() {
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
    return plan.entitlements.shareForReconciliationEnabled === true;
  }, [company, allCompanies, customUser?.uid, customUser?.email, livePlans]);

  const companyEnabled = company?.enableShareForReconciliation === true;

  return {
    planEnabled,
    companyEnabled,
    enabled: planEnabled && companyEnabled,
    canShare: planEnabled && companyEnabled && can("share_for_reconciliation"),
    canLink: planEnabled && companyEnabled && can("link_reconciliation_accounts"),
    canView: planEnabled && companyEnabled && can("view_reconciliation"),
  };
}

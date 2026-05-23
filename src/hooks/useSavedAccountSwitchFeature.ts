"use client";

import { useMemo } from "react";
import { isFeatureEnabled, type PlanId } from "@/config/plans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { isEmbeddedLoginAccountSwitchShell } from "@/lib/embeddedLoginAccountSwitchShell";
import { hasSavedAccountsForLoginPanel } from "@/components/auth/SavedAccountsLoginPanel";

/** Plan entitlement + APK/EXE shell — saved account save/switch UI gate. */
export function useSavedAccountSwitchFeature() {
  const { user } = useAuth();
  const { company, allCompanies } = useCompany();
  const livePlans = useLivePlans();

  const accountPlanId: PlanId = useMemo(
    () => resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId),
    [allCompanies, user?.uid, company?.planId]
  );

  const planEnabled = useMemo(() => {
    const plan = getPlanFromPlans(livePlans, accountPlanId);
    return isFeatureEnabled(plan.id, "savedAccountSwitchEnabled");
  }, [livePlans, accountPlanId]);

  const shellEligible = isEmbeddedLoginAccountSwitchShell();

  return {
    shellEligible,
    planEnabled,
    /** Save on logout + change-account login panel — dono ke liye. */
    enabled: shellEligible && planEnabled,
    accountPlanId,
  };
}

/** Login page (no auth): saved rows list — plan entitlement save-time par check. */
export function useSavedAccountsLoginPanelVisible(): boolean {
  const livePlans = useLivePlans();
  if (!isEmbeddedLoginAccountSwitchShell()) return false;
  return hasSavedAccountsForLoginPanel(livePlans);
}

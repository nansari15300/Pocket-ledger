"use client";
/** Plan gate: entitlement `ocrVoucherAutofillEnabled` — missing value = enabled; company override wins. */
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { resolvePlanIdForActiveCompany } from "@/lib/accountPlanForOwner";

export const OCR_ENTITLEMENT_KEY = "ocrVoucherAutofillEnabled" as const;

export function useOcrPlanAllowed(): boolean {
  const { customUser } = useAuth();
  const { company, allCompanies } = useCompany();
  const livePlans = useLivePlans();
  return useMemo(() => {
    if (!company) return false;
    const override = (company as { settings?: Record<string, unknown> }).settings?.[OCR_ENTITLEMENT_KEY];
    if (typeof override === "boolean") return override;
    const planId = resolvePlanIdForActiveCompany(company, allCompanies, customUser?.uid, customUser?.email);
    const plan = getPlanFromPlans(livePlans, planId);
    return (plan?.entitlements as Record<string, unknown> | undefined)?.[OCR_ENTITLEMENT_KEY] !== false;
  }, [company, allCompanies, customUser?.uid, customUser?.email, livePlans]);
}

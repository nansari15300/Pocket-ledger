"use client";

import { useMemo } from "react";
import { useCompany } from "./useCompany";
import { getPlanFromPlans, useLivePlans } from "./useLivePlans";
import { resolveCompanyOnlineSync } from "@/lib/companyOnlineSync";

export function useCompanyOnlineSync() {
  const { company } = useCompany();
  const livePlans = useLivePlans();

  return useMemo(() => {
    // Reuse the shared resolver so form UIs and sync engine read the same effective state.
    return resolveCompanyOnlineSync(company, {
      basic: getPlanFromPlans(livePlans, "basic"),
      advance: getPlanFromPlans(livePlans, "advance"),
      pro: getPlanFromPlans(livePlans, "pro"),
      "pro-plus": getPlanFromPlans(livePlans, "pro-plus"),
    });
  }, [company, livePlans]);
}

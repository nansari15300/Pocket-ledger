"use client";

import { useMemo } from "react";
import { resolveDisplayCurrency } from "@/lib/displayCurrency";
import { useCompany } from "@/hooks/useCompany";

/** Active company se billing + voucher display symbol — country default + manual override. */
export function useDisplayCurrency() {
  const { company } = useCompany();
  return useMemo(
    () =>
      resolveDisplayCurrency({
        country: company?.country,
        currencyCode: company?.currencyCode,
        currencySymbol: company?.currencySymbol,
      }),
    [company?.country, company?.currencyCode, company?.currencySymbol]
  );
}

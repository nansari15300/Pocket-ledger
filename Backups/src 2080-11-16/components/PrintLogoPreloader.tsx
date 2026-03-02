"use client";

import { useEffect } from "react";
import { useCompany } from "@/hooks/useCompany";
import { preloadCompanyLogo } from "@/lib/printDirect";

/**
 * Preloads the company logo when a company with logo is selected,
 * so print opens instantly instead of waiting for logo fetch.
 */
export function PrintLogoPreloader() {
  const { company } = useCompany();

  useEffect(() => {
    if (company?.logoUrl) {
      preloadCompanyLogo(company.logoUrl);
    }
  }, [company?.logoUrl]);

  return null;
}

"use client";

import { useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import {
  collectAccessibleCompanyIdsForAttachmentPolicy,
  syncCrossCompanyAttachmentAccessPolicy,
} from "@/lib/crossCompanyAttachmentAccess";

/**
 * Same-login company list (owned + shared) → attachment visibility policy.
 * Company A ka file link Company B me tabhi dikhe jab A bhi is user ki list me ho.
 */
export function CrossCompanyAttachmentAccessBridge() {
  const { companyId, allCompaniesRegistry, company } = useCompany();
  const accessibleIds = useMemo(
    () => [
      ...collectAccessibleCompanyIdsForAttachmentPolicy(allCompaniesRegistry, [
        companyId,
        company?.id,
        company?.authoritativeCompanyId,
      ]),
    ],
    [allCompaniesRegistry, companyId, company?.id, company?.authoritativeCompanyId]
  );

  useEffect(() => {
    syncCrossCompanyAttachmentAccessPolicy(companyId, accessibleIds);
  }, [companyId, accessibleIds]);

  return null;
}

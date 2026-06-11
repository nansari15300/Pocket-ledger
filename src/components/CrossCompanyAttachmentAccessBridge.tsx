"use client";

import { useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import {
  collectAccessibleCompanyIdsForAttachmentPolicy,
  syncCrossCompanyAttachmentAccessPolicy,
} from "@/lib/crossCompanyAttachmentAccess";

/**
 * Same-login company list → attachment policy registry (local/drive hints).
 * Firebase Storage HTTPS links: link on voucher = preview/download (see crossCompanyAttachmentAccess).
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

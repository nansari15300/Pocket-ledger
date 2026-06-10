"use client";

import { useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import type { AttachmentHoldPayloadV1 } from "@/lib/attachmentHoldClipboard";
import {
  collectAccessibleCompanyIdsForAttachmentPolicy,
  filterAttachmentsForCompanyContext,
  filterVoucherAttachmentsForCompanyContext,
  isAttachmentHoldPayloadVisibleInCompanyContext,
  isCrossCompanyAttachmentVisibleToUser,
} from "@/lib/crossCompanyAttachmentAccess";

export function useCrossCompanyAttachmentAccess() {
  const { companyId, allCompaniesRegistry, company } = useCompany();
  const accessibleCompanyIds = useMemo(
    () =>
      collectAccessibleCompanyIdsForAttachmentPolicy(allCompaniesRegistry, [
        companyId,
        company?.authoritativeCompanyId,
      ]),
    [allCompaniesRegistry, companyId, company?.authoritativeCompanyId]
  );

  return useMemo(
    () => ({
      activeCompanyId: companyId,
      accessibleCompanyIds,
      isAttachmentVisible: (ref: string) =>
        isCrossCompanyAttachmentVisibleToUser(ref, companyId, accessibleCompanyIds),
      filterUrls: (urls: readonly string[]) =>
        filterAttachmentsForCompanyContext(urls, companyId, accessibleCompanyIds),
      filterVoucher: <T extends Record<string, unknown>>(voucher: T) =>
        filterVoucherAttachmentsForCompanyContext(voucher, companyId, accessibleCompanyIds),
      isHoldPayloadVisible: (payload: AttachmentHoldPayloadV1) =>
        isAttachmentHoldPayloadVisibleInCompanyContext(payload, companyId, accessibleCompanyIds),
    }),
    [companyId, accessibleCompanyIds]
  );
}

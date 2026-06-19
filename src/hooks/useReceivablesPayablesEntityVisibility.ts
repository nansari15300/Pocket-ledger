"use client";

import { useCallback, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { updateCompanyRootFirestore } from "@/lib/writeGateway/companyRootFirestore";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import {
  filterReceivablesPayablesSummaryByVisibility,
  resolveRpHiddenCategories,
  type RpVisibilityCategory,
} from "@/lib/receivablesPayablesEntityKeys";
import type { ReceivablesPayablesFinancialSummary } from "@/lib/receivablesPayablesFinancialSummary";

export function useReceivablesPayablesEntityVisibility() {
  const { company, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const canEdit = company?.isOwned === true;

  const hiddenCategories = useMemo(
    () => resolveRpHiddenCategories(company?.receivablesPayablesHiddenCategories),
    [company?.receivablesPayablesHiddenCategories]
  );

  const filterSummary = useCallback(
    (summary: ReceivablesPayablesFinancialSummary) =>
      filterReceivablesPayablesSummaryByVisibility(summary, hiddenCategories),
    [hiddenCategories]
  );

  const saveHiddenCategories = useCallback(
    async (categories: RpVisibilityCategory[]) => {
      if (!company?.id) throw new Error("No company selected");
      if (!canEdit) throw new Error("Only company owner can change outstanding visibility");
      const patch = { receivablesPayablesHiddenCategories: categories };
      await updateCompanyRootFirestore(company.id, patch);
      try {
        const localRow = await getLocalCompanyById(company.id);
        if (localRow) {
          await upsertLocalCompany({
            ...(localRow as Record<string, unknown>),
            ...patch,
            id: company.id,
          } as unknown as Parameters<typeof upsertLocalCompany>[0]);
        }
      } catch {
        /* online-only */
      }
      reloadLocalCompanyRegistry();
      triggerSync();
    },
    [company?.id, canEdit, reloadLocalCompanyRegistry, triggerSync]
  );

  return {
    hiddenCategories,
    canEdit,
    filterSummary,
    saveHiddenCategories,
  };
}

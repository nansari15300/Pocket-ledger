"use client";

import { useEffect } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import { hydrateLedgerOpeningBalances } from "@/lib/fyPagination/openingSnapshotHydrate";
import {
  MASTER_OPENING_BALANCE_CHANGED_EVENT,
  type MasterOpeningBalanceChangedDetail,
} from "@/lib/fyPagination/masterOpeningSaveHooks";

/** Active ledger FY opening re-hydrate after master book opening edit. */
export function FyMasterOpeningSaveBootstrap() {
  const { company } = useCompany();
  const fy = useFyVoucherScope();

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<MasterOpeningBalanceChangedDetail>).detail;
      const companyId = String(detail?.companyId || "").trim();
      if (!companyId || !company?.id || companyId !== company.id) return;
      if (!fy.enabled || !fy.activeScope?.openingSnapshotId) return;

      fy.setOpeningBalancesLoading();
      void hydrateLedgerOpeningBalances({
        company,
        companyId,
        scope: fy.activeScope,
      })
        .then((opening) => {
          fy.applyOpeningHydrateResult(opening);
        })
        .catch((err) => {
          console.warn("[FyMasterOpeningSaveBootstrap] opening re-hydrate", err);
        });
    };

    window.addEventListener(MASTER_OPENING_BALANCE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(MASTER_OPENING_BALANCE_CHANGED_EVENT, handler);
  }, [company, fy]);

  return null;
}

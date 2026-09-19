"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import {
  isDefaultLedgerDateRange,
  widenFyScopeUntilEntityMinTxns,
  type MasterLedgerEntityKind,
} from "@/lib/fyPagination/entityMinTxnScope";
import { companyUsesFiscalMergeDividers } from "@/lib/fyPagination/fiscalMergeFullVoucherScope";
import { MASTER_LEDGER_DEFAULT_TXN_COUNT } from "@/lib/ledgerMasterDefaultView";
import type { LedgerDateRangeInput } from "@/lib/fyPagination/ledgerDateRangeLoad";

/** Default master view: load enough history so this entity shows up to 10 recent txns (cross-FY). */
export function useEnsureEntityMinTxnsInScope(params: {
  dateRange?: LedgerDateRangeInput;
  entityId?: string;
  entityKind: MasterLedgerEntityKind;
  entityTxnCount: number;
  minTxn?: number;
  enabled?: boolean;
}): void {
  const { company } = useCompany();
  const fiscalMergeFullLoad = companyUsesFiscalMergeDividers(company);
  const fy = useFyVoucherScope();
  const wideningRef = useRef(false);
  const lastEntityRef = useRef("");

  const {
    dateRange,
    entityId = "",
    entityKind,
    entityTxnCount,
    minTxn = MASTER_LEDGER_DEFAULT_TXN_COUNT,
    enabled = true,
  } = params;

  useEffect(() => {
    if (!enabled || !entityId || entityId === "all") return;
    if (fiscalMergeFullLoad) return;
    if (!isDefaultLedgerDateRange(dateRange)) return;
    if (!fy.enabled) return;
    if (entityTxnCount >= minTxn) return;
    if (wideningRef.current) return;

    const widenKey = `${company?.id}:${entityId}:${entityKind}`;
    if (lastEntityRef.current === widenKey && entityTxnCount === 0) {
      // Allow one retry per entity when still empty after prior widen attempt.
    }

    wideningRef.current = true;
    lastEntityRef.current = widenKey;

    void widenFyScopeUntilEntityMinTxns({
      company,
      fy,
      entityId,
      entityKind,
      minTxn,
    })
      .catch((err) => {
        console.warn("[useEnsureEntityMinTxnsInScope]", err);
      })
      .finally(() => {
        wideningRef.current = false;
      });
  }, [
    enabled,
    company?.id,
    company?.country,
    dateRange?.from,
    dateRange?.to,
    entityId,
    entityKind,
    entityTxnCount,
    minTxn,
    fy.enabled,
    fiscalMergeFullLoad,
  ]);
}

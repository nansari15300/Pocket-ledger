"use client";

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import {
  countEntityVouchersInSqliteFull,
  isDefaultLedgerDateRange,
  widenFyScopeUntilEntityMinTxns,
  type MasterLedgerEntityKind,
} from "@/lib/fyPagination/entityMinTxnScope";
import { companyUsesFiscalMergeDividers } from "@/lib/fyPagination/fiscalMergeFullVoucherScope";
import { MASTER_LEDGER_DEFAULT_TXN_COUNT } from "@/lib/ledgerMasterDefaultView";
import type { LedgerDateRangeInput } from "@/lib/fyPagination/ledgerDateRangeLoad";

/** Default master view: load enough history so this entity shows all SQLite txns (min 10 tail). */
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
  const [fullEntityTxnCount, setFullEntityTxnCount] = useState<number | null>(null);

  const {
    dateRange,
    entityId = "",
    entityKind,
    entityTxnCount,
    minTxn = MASTER_LEDGER_DEFAULT_TXN_COUNT,
    enabled = true,
  } = params;

  const companyId = String(company?.id || "").trim();

  useEffect(() => {
    setFullEntityTxnCount(null);
    if (!enabled || !entityId || entityId === "all" || !companyId || fiscalMergeFullLoad) return;
    if (!isDefaultLedgerDateRange(dateRange)) return;

    let cancelled = false;
    void countEntityVouchersInSqliteFull(companyId, entityId, entityKind)
      .then((count) => {
        if (!cancelled) setFullEntityTxnCount(count);
      })
      .catch(() => {
        if (!cancelled) setFullEntityTxnCount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    companyId,
    entityId,
    entityKind,
    dateRange?.from,
    dateRange?.to,
    fiscalMergeFullLoad,
  ]);

  const targetTxnCount = Math.max(minTxn, fullEntityTxnCount ?? minTxn);
  const needsWiden = entityTxnCount < targetTxnCount;

  useEffect(() => {
    if (!enabled || !entityId || entityId === "all") return;
    if (fiscalMergeFullLoad) return;
    if (!isDefaultLedgerDateRange(dateRange)) return;
    if (!fy.enabled) return;
    if (!needsWiden) return;
    if (fullEntityTxnCount == null && entityTxnCount >= minTxn) return;
    if (wideningRef.current) return;

    const widenKey = `${companyId}:${entityId}:${entityKind}`;
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
      targetTxnCount: fullEntityTxnCount ?? undefined,
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
    needsWiden,
    fullEntityTxnCount,
    company,
    fy,
  ]);
}

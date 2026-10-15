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
  /** Cap auto FY widen (default: full SQLite count). Tax TDS: use minTxn so default “Last N” does not load entire history. */
  maxAutoWidenTarget?: number;
  enabled?: boolean;
}): void {
  const { company } = useCompany();
  const fiscalMergeFullLoad = companyUsesFiscalMergeDividers(company);
  const fy = useFyVoucherScope();
  const wideningRef = useRef(false);
  const lastEntityRef = useRef("");
  /** One widen pass per entity+target — avoid repeat FY walks when scope stalls below SQLite count. */
  const widenFinishedKeyRef = useRef<string | null>(null);
  const fyRef = useRef(fy);
  fyRef.current = fy;
  const [fullEntityTxnCount, setFullEntityTxnCount] = useState<number | null>(null);

  const {
    dateRange,
    entityId = "",
    entityKind,
    entityTxnCount,
    minTxn = MASTER_LEDGER_DEFAULT_TXN_COUNT,
    maxAutoWidenTarget,
    enabled = true,
  } = params;

  const companyId = String(company?.id || "").trim();

  useEffect(() => {
    setFullEntityTxnCount(null);
    widenFinishedKeyRef.current = null;
    if (!enabled || !entityId || entityId === "all" || !companyId || fiscalMergeFullLoad) return;
    if (!isDefaultLedgerDateRange(dateRange)) return;

    // Capped default (e.g. tax Last N): do NOT load/parse entire SQLite vouchers just to count.
    if (typeof maxAutoWidenTarget === "number" && maxAutoWidenTarget > 0) {
      setFullEntityTxnCount(maxAutoWidenTarget);
      return;
    }

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
    maxAutoWidenTarget,
  ]);

  const sqliteTarget = fullEntityTxnCount ?? minTxn;
  const cappedTarget =
    maxAutoWidenTarget != null
      ? Math.min(sqliteTarget, Math.max(minTxn, maxAutoWidenTarget))
      : sqliteTarget;
  const targetTxnCount = Math.max(minTxn, cappedTarget);
  const needsWiden = entityTxnCount < targetTxnCount;

  useEffect(() => {
    if (!enabled || !entityId || entityId === "all") return;
    if (fiscalMergeFullLoad) return;
    if (!isDefaultLedgerDateRange(dateRange)) return;
    if (!fy.enabled) return;
    if (!needsWiden) return;
    if (fullEntityTxnCount == null && entityTxnCount >= minTxn) return;
    if (wideningRef.current) return;

    const widenKey = `${companyId}:${entityId}:${entityKind}:${targetTxnCount}`;
    if (widenFinishedKeyRef.current === widenKey) return;

    wideningRef.current = true;
    lastEntityRef.current = widenKey;

    void widenFyScopeUntilEntityMinTxns({
      company,
      fy: fyRef.current,
      entityId,
      entityKind,
      minTxn,
      targetTxnCount,
    })
      .catch((err) => {
        console.warn("[useEnsureEntityMinTxnsInScope]", err);
      })
      .finally(() => {
        wideningRef.current = false;
        widenFinishedKeyRef.current = widenKey;
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
    targetTxnCount,
    company,
  ]);
}

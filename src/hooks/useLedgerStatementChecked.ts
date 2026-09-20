"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  BROWSER_DB_COLLECTION_BUMP,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import {
  LEDGER_STATEMENT_CHECKS_COLLECTION,
  persistLedgerStatementCheckedIds,
  readLedgerStatementCheckedIdsFromDb,
} from "@/lib/ledgerStatementCheckPersist";
import {
  statementCheckTxnId,
  type StatementCheckLedgerScope,
} from "@/lib/statementCheckModeStorage";

type Args = {
  companyId: string | undefined;
  context: string;
  contextId: string | undefined;
  enabled?: boolean;
};

function sameCheckedIdSet(prev: Set<string>, ids: readonly string[]): boolean {
  if (prev.size !== ids.length) return false;
  for (const id of ids) {
    if (!prev.has(id)) return false;
  }
  return true;
}

/** 3-dot → Mark as checked — SQLite + online sync; check mode se alag tool. */
export function useLedgerStatementChecked({
  companyId,
  context,
  contextId,
  enabled = true,
}: Args) {
  const { user } = useAuth();
  const { company } = useCompany();
  const userId = user?.uid ?? "anon";

  const scope: StatementCheckLedgerScope | null = useMemo(() => {
    if (!enabled || !companyId || !contextId) return null;
    return { userId, companyId, context, contextId };
  }, [enabled, userId, companyId, context, contextId]);

  const scopeKey = scope
    ? `${scope.userId}:${scope.companyId}:${scope.context}:${scope.contextId}`
    : null;

  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const hydratedScopeRef = useRef<string | null>(null);
  const marksHydratedRef = useRef(false);
  const userTouchedRef = useRef(false);

  useEffect(() => {
    if (!scope || !scopeKey) {
      setCheckedIds(new Set());
      hydratedScopeRef.current = null;
      marksHydratedRef.current = false;
      userTouchedRef.current = false;
      return;
    }
    if (hydratedScopeRef.current === scopeKey) return;
    hydratedScopeRef.current = scopeKey;
    marksHydratedRef.current = false;
    userTouchedRef.current = false;
    setCheckedIds(new Set());

    let cancelled = false;
    void readLedgerStatementCheckedIdsFromDb(scope.companyId, scope).then((ids) => {
      if (cancelled || hydratedScopeRef.current !== scopeKey || userTouchedRef.current) return;
      setCheckedIds(new Set(ids));
      marksHydratedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [scope, scopeKey]);

  useEffect(() => {
    if (!scope || !companyId) return;
    const onBump = (e: Event) => {
      const detail = (e as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!detail || detail.companyId !== companyId) return;
      if (detail.collection !== LEDGER_STATEMENT_CHECKS_COLLECTION) return;
      // Apna save → bump → reload → persist loop (page hang) mat chalao.
      if (detail.source === "local_write") return;
      void readLedgerStatementCheckedIdsFromDb(companyId, scope).then((ids) => {
        if (hydratedScopeRef.current !== scopeKey) return;
        setCheckedIds((prev) => (sameCheckedIdSet(prev, ids) ? prev : new Set(ids)));
        marksHydratedRef.current = true;
      });
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
  }, [scope, companyId, scopeKey]);

  const isChecked = useCallback(
    (tx: { id?: string; _rowKey?: string }) => {
      const id = statementCheckTxnId(tx);
      return Boolean(id && checkedIds.has(id));
    },
    [checkedIds]
  );

  const toggleChecked = useCallback(
    (tx: { id?: string; _rowKey?: string }) => {
      if (!scope) return;
      const id = statementCheckTxnId(tx);
      if (!id) return;
      userTouchedRef.current = true;
      marksHydratedRef.current = true;
      const next = new Set(checkedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setCheckedIds(next);
      void persistLedgerStatementCheckedIds(company, scope, [...next]);
    },
    [scope, company, checkedIds]
  );

  const canMark = Boolean(scope);

  return {
    checkedIds,
    canMark,
    isChecked,
    toggleChecked,
  };
}

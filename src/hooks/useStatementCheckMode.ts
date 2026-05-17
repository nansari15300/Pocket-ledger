"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  clearStatementCheckModeLedgerState,
  loadStatementCheckModeEnabled,
  loadStatementCheckModeFocusId,
  loadStatementCheckModeHiddenIds,
  loadStatementCheckModeMarkedIds,
  saveStatementCheckModeEnabled,
  saveStatementCheckModeFocusId,
  saveStatementCheckModeHiddenIds,
  saveStatementCheckModeMarkedIds,
  statementCheckTxnId,
  type StatementCheckLedgerScope,
} from "@/lib/statementCheckModeStorage";
import {
  filterTransactionsForStatementCheckMode,
  sumDrCrExcludingHidden,
} from "@/lib/statementCheckModeLedger";
import { toast } from "sonner";

export type StatementCheckViewMode = "statement" | "bill_wise";

type UseStatementCheckModeArgs = {
  companyId: string | undefined;
  context: string;
  contextId: string | undefined;
  viewMode: StatementCheckViewMode;
  /** Full list (filter/totals) — hidden rows exclude. */
  orderedTransactions: ReadonlyArray<{ id?: string; _rowKey?: string }>;
  /** Current page / on-screen rows — ↑↓ + Space isi order par (paging mismatch fix). */
  keyboardNavTransactions?: ReadonlyArray<{ id?: string; _rowKey?: string }>;
};

export function useStatementCheckMode({
  companyId,
  context,
  contextId,
  viewMode,
  orderedTransactions,
  keyboardNavTransactions,
}: UseStatementCheckModeArgs) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const userId = user?.uid ?? "anon";

  const scope: StatementCheckLedgerScope | null = useMemo(() => {
    if (!companyId || !contextId) return null;
    return { userId, companyId, context, contextId };
  }, [userId, companyId, context, contextId]);

  const [enabledRaw, setEnabledRaw] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [markedIds, setMarkedIds] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const hydratedScopeRef = useRef<string | null>(null);

  // Scope / user change: ledger state localStorage se load
  useEffect(() => {
    if (!scope) {
      setHiddenIds(new Set());
      setMarkedIds(new Set());
      setFocusId(null);
      hydratedScopeRef.current = null;
      return;
    }
    const sk = `${scope.userId}:${scope.companyId}:${scope.context}:${scope.contextId}`;
    if (hydratedScopeRef.current === sk) return;
    hydratedScopeRef.current = sk;
    setEnabledRaw(loadStatementCheckModeEnabled(userId));
    setHiddenIds(new Set(loadStatementCheckModeHiddenIds(scope)));
    setMarkedIds(new Set(loadStatementCheckModeMarkedIds(scope)));
    setFocusId(loadStatementCheckModeFocusId(scope));
  }, [scope, userId]);

  const checkModeActive =
    !isMobile && viewMode === "statement" && enabledRaw && Boolean(scope);

  const navSource =
    keyboardNavTransactions && keyboardNavTransactions.length > 0
      ? keyboardNavTransactions
      : orderedTransactions;

  const visibleOrderedIds = useMemo(() => {
    return navSource
      .map((t) => statementCheckTxnId(t))
      .filter((id): id is string => Boolean(id && !hiddenIds.has(id)));
  }, [navSource, hiddenIds]);

  // Primitive key — navSource naya array ref par bhi ids same ho to focus effect loop na chale.
  const visibleOrderedIdsKey = useMemo(() => visibleOrderedIds.join("\0"), [visibleOrderedIds]);

  // Focus invalid ho to pehli visible row par set
  useEffect(() => {
    if (!checkModeActive) return;
    if (visibleOrderedIds.length === 0) {
      if (focusId !== null) setFocusId(null);
      return;
    }
    if (!focusId || !visibleOrderedIds.includes(focusId)) {
      setFocusId(visibleOrderedIds[0]!);
    }
  }, [checkModeActive, visibleOrderedIdsKey, focusId]);

  useEffect(() => {
    if (!scope || !checkModeActive) return;
    saveStatementCheckModeFocusId(scope, focusId);
  }, [scope, checkModeActive, focusId]);

  useEffect(() => {
    if (!scope || !checkModeActive) return;
    saveStatementCheckModeHiddenIds(scope, [...hiddenIds]);
  }, [scope, checkModeActive, hiddenIds]);

  useEffect(() => {
    if (!scope || !checkModeActive) return;
    saveStatementCheckModeMarkedIds(scope, [...markedIds]);
  }, [scope, checkModeActive, markedIds]);

  const setCheckModeEnabled = useCallback(
    (next: boolean) => {
      setEnabledRaw(next);
      saveStatementCheckModeEnabled(userId, next);
      if (!next && scope) {
        clearStatementCheckModeLedgerState(scope);
        setHiddenIds(new Set());
        setMarkedIds(new Set());
        setFocusId(null);
      }
    },
    [userId, scope]
  );

  const filterTransactions = useCallback(
    <T extends { id?: string; _rowKey?: string }>(transactions: T[]): T[] => {
      if (!checkModeActive) return transactions;
      return filterTransactionsForStatementCheckMode(transactions, hiddenIds);
    },
    [checkModeActive, hiddenIds]
  );

  const adjustPeriodTotals = useCallback(
    (
      pageTransactions: ReadonlyArray<{ id?: string; _rowKey?: string; debit?: unknown; credit?: unknown }>,
      openingForPage: number
    ) => {
      if (!checkModeActive) return null;
      const { dr, cr } = sumDrCrExcludingHidden([...pageTransactions], hiddenIds);
      return {
        periodDrForPage: dr,
        periodCrForPage: cr,
        closingForPage: openingForPage + dr - cr,
      };
    },
    [checkModeActive, hiddenIds]
  );

  const moveFocus = useCallback(
    (delta: -1 | 1) => {
      if (!checkModeActive || visibleOrderedIds.length === 0) return;
      const idx = focusId ? visibleOrderedIds.indexOf(focusId) : -1;
      const base = idx < 0 ? 0 : idx;
      const next = Math.min(visibleOrderedIds.length - 1, Math.max(0, base + delta));
      setFocusId(visibleOrderedIds[next]!);
    },
    [checkModeActive, visibleOrderedIds, focusId]
  );

  const toggleMarkFocused = useCallback(() => {
    if (!checkModeActive || !focusId) return;
    setMarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(focusId)) next.delete(focusId);
      else next.add(focusId);
      return next;
    });
  }, [checkModeActive, focusId]);

  const hideFocused = useCallback(() => {
    if (!checkModeActive || !focusId) return;
    const idx = visibleOrderedIds.indexOf(focusId);
    setHiddenIds((prev) => new Set(prev).add(focusId));
    const remaining = visibleOrderedIds.filter((id) => id !== focusId);
    if (remaining.length === 0) setFocusId(null);
    else setFocusId(remaining[Math.min(idx, remaining.length - 1)]!);
    toast.message("Transaction hidden (Ctrl+U = unhide one, Ctrl+Alt+U = unhide all)");
  }, [checkModeActive, focusId, visibleOrderedIds]);

  /** Ctrl+Alt+H — Space se marked (green border) sab rows hide; marks rehte hain taaki Ctrl+Alt+U par green wapas dikhe. */
  const hideAllMarked = useCallback(() => {
    if (!checkModeActive) return;
    const toHide = [...markedIds].filter((id) => !hiddenIds.has(id));
    if (toHide.length === 0) {
      toast.message("No marked rows — use Space to mark rows first");
      return;
    }
    const hideSet = new Set(toHide);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of toHide) next.add(id);
      return next;
    });
    const remaining = visibleOrderedIds.filter((id) => !hideSet.has(id));
    if (remaining.length === 0) setFocusId(null);
    else if (!focusId || hideSet.has(focusId)) {
      const idx = focusId ? visibleOrderedIds.indexOf(focusId) : 0;
      const pick = remaining.find((id) => visibleOrderedIds.indexOf(id) >= idx) ?? remaining[0]!;
      setFocusId(pick);
    }
    toast.message(`${toHide.length} marked row${toHide.length === 1 ? "" : "s"} hidden`);
  }, [checkModeActive, markedIds, hiddenIds, visibleOrderedIds, focusId]);

  /** Ctrl+U — last hidden row restore (Set insertion order = LIFO). */
  const unhideOne = useCallback(() => {
    if (!checkModeActive) return;
    if (hiddenIds.size === 0) {
      toast.message("No hidden transactions");
      return;
    }
    let lastHidden: string | null = null;
    for (const id of hiddenIds) lastHidden = id;
    if (!lastHidden) return;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(lastHidden!);
      return next;
    });
    setFocusId(lastHidden);
    toast.message(
      markedIds.has(lastHidden!)
        ? "One row restored (still marked — green border)"
        : "One hidden transaction restored"
    );
  }, [checkModeActive, hiddenIds, markedIds]);

  const unhideAll = useCallback(() => {
    if (!checkModeActive) return;
    if (hiddenIds.size === 0) {
      toast.message("No hidden transactions");
      return;
    }
    const wasHidden = [...hiddenIds];
    setHiddenIds(new Set());
    // Pehli restored marked row par focus — green highlight turant dikhe
    const firstMarkedRestored = wasHidden.find((id) => markedIds.has(id));
    if (firstMarkedRestored) setFocusId(firstMarkedRestored);
    else if (wasHidden[0]) setFocusId(wasHidden[0]);
    const markedRestoredCount = wasHidden.filter((id) => markedIds.has(id)).length;
    toast.message(
      markedRestoredCount > 0
        ? `Restored ${wasHidden.length} row(s); ${markedRestoredCount} still marked (green)`
        : "All hidden transactions restored"
    );
  }, [checkModeActive, hiddenIds, markedIds]);

  const onRowFocus = useCallback(
    (tx: { id?: string; _rowKey?: string }) => {
      if (!checkModeActive) return;
      const id = statementCheckTxnId(tx);
      if (id && !hiddenIds.has(id)) setFocusId(id);
    },
    [checkModeActive, hiddenIds]
  );

  // PC keyboard — sirf check mode ON + statement view
  useEffect(() => {
    if (!checkModeActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
        return;
      }
      if (e.key === " " || e.code === "Space") {
        // Capture phase: Check mode checkbox / buttons Space na khayein
        e.preventDefault();
        e.stopPropagation();
        toggleMarkFocused();
        return;
      }
      if (e.ctrlKey && e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        hideAllMarked();
        return;
      }
      if (e.ctrlKey && !e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        hideFocused();
        return;
      }
      if (e.ctrlKey && e.altKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        unhideAll();
        return;
      }
      if (e.ctrlKey && !e.altKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        unhideOne();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [checkModeActive, moveFocus, toggleMarkFocused, hideFocused, hideAllMarked, unhideOne, unhideAll]);

  const tableProps = useMemo(
    () =>
      checkModeActive
        ? {
            statementCheckModeActive: true as const,
            statementCheckFocusId: focusId,
            statementCheckMarkedIds: markedIds,
            onStatementCheckRowFocus: onRowFocus,
          }
        : {
            statementCheckModeActive: false as const,
            statementCheckFocusId: null as string | null,
            statementCheckMarkedIds: undefined as Set<string> | undefined,
            onStatementCheckRowFocus: undefined as ((tx: { id?: string; _rowKey?: string }) => void) | undefined,
          },
    [checkModeActive, focusId, markedIds, onRowFocus]
  );

  return {
    checkModeActive,
    checkModeEnabled: enabledRaw,
    setCheckModeEnabled,
    filterTransactions,
    adjustPeriodTotals,
    hiddenCount: hiddenIds.size,
    tableProps,
    focusId,
    markedIds,
  };
}

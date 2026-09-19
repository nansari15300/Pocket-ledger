"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import type { FiscalYearMergeRow } from "@/lib/fiscalMergeFySelection";
import {
  loadFiscalSplitFyRows,
  type FiscalSplitFyLoadSource,
} from "@/lib/fiscalSplit/loadFiscalSplitFyRows";

export function useFiscalSplitFyRows() {
  const { company, companyId } = useCompany();
  const [fyRows, setFyRows] = useState<FiscalYearMergeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<FiscalSplitFyLoadSource | null>(null);
  const [firestoreScanned, setFirestoreScanned] = useState(0);

  const reload = useCallback(async () => {
    const cid = String(companyId || "").trim();
    if (!cid || !company) {
      setFyRows([]);
      setSource(null);
      return;
    }
    setLoading(true);
    setError(null);
    setFirestoreScanned(0);
    try {
      const result = await loadFiscalSplitFyRows({
        companyId: cid,
        company,
        onFirestoreProgress: (n) => setFirestoreScanned(n),
      });
      setFyRows(result.rows);
      setSource(result.source);
    } catch (err) {
      console.warn("[useFiscalSplitFyRows] load failed", err);
      setError(err instanceof Error ? err.message : "Could not load fiscal years.");
      setFyRows([]);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, company]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    fyRows,
    loading,
    error,
    source,
    firestoreScanned,
    reload,
  };
}

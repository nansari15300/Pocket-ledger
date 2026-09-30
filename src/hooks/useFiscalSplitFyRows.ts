"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const companyRef = useRef(company);
  companyRef.current = company;
  const loadGenRef = useRef(0);

  const reload = useCallback(async () => {
    const cid = String(companyId || "").trim();
    const row = companyRef.current;
    if (!cid || !row) {
      setFyRows([]);
      setSource(null);
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    setFirestoreScanned(0);
    try {
      const result = await loadFiscalSplitFyRows({
        companyId: cid,
        company: row,
        onFirestoreProgress: (n) => {
          if (gen === loadGenRef.current) setFirestoreScanned(n);
        },
      });
      if (gen !== loadGenRef.current) return;
      setFyRows(result.rows);
      setSource(result.source);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      console.warn("[useFiscalSplitFyRows] load failed", err);
      setError(err instanceof Error ? err.message : "Could not load fiscal years.");
      setFyRows([]);
      setSource(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [companyId]);

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

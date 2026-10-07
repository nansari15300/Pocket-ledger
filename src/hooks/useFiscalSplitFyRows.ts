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
  const [voucherDateFrom, setVoucherDateFrom] = useState<Date | null>(null);
  const [voucherDateTo, setVoucherDateTo] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<FiscalSplitFyLoadSource | null>(null);
  const [firestoreScanned, setFirestoreScanned] = useState(0);
  const [sqliteScanned, setSqliteScanned] = useState(0);
  const [sqliteTotal, setSqliteTotal] = useState(0);
  const companyRef = useRef(company);
  companyRef.current = company;
  const loadGenRef = useRef(0);

  const reload = useCallback(async () => {
    const cid = String(companyId || "").trim();
    const row = companyRef.current;
    if (!cid || !row) {
      setFyRows([]);
      setVoucherDateFrom(null);
      setVoucherDateTo(null);
      setSource(null);
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    setFirestoreScanned(0);
    setSqliteScanned(0);
    setSqliteTotal(0);
    const applyResult = (result: Awaited<ReturnType<typeof loadFiscalSplitFyRows>>) => {
      setFyRows(result.rows);
      setVoucherDateFrom(result.voucherDateFrom);
      setVoucherDateTo(result.voucherDateTo);
      setSource(result.source);
    };
    try {
      const result = await loadFiscalSplitFyRows({
        companyId: cid,
        company: row,
        onLateUpdate: (lateResult) => {
          if (gen !== loadGenRef.current) return;
          console.info("[FY-SCAN] late index update applied", {
            companyId: cid,
            source: lateResult.source,
            rowCount: lateResult.rows.length,
            fyKeys: lateResult.rows.map((fyRow) => fyRow.fyKey).slice(0, 32),
            minDateMs: lateResult.voucherDateFrom?.getTime() ?? null,
            maxDateMs: lateResult.voucherDateTo?.getTime() ?? null,
          });
          applyResult(lateResult);
        },
        onFirestoreProgress: (n) => {
          if (gen === loadGenRef.current) setFirestoreScanned(n);
        },
        onSqliteProgress: (scanned, total) => {
          if (gen !== loadGenRef.current) return;
          setSqliteScanned(scanned);
          setSqliteTotal(total);
        },
      });
      if (gen !== loadGenRef.current) return;
      console.info("[FY-SCAN] loadFiscalSplitFyRows done", {
        companyId: cid,
        source: result.source,
        rowCount: result.rows.length,
        vouchersScanned: result.vouchersScanned,
        fyKeys: result.rows.map((fyRow) => fyRow.fyKey).slice(0, 32),
        minDateMs: result.voucherDateFrom?.getTime() ?? null,
        maxDateMs: result.voucherDateTo?.getTime() ?? null,
      });
      applyResult(result);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      console.warn("[useFiscalSplitFyRows] load failed", err);
      setError(err instanceof Error ? err.message : "Could not load fiscal years.");
      setFyRows([]);
      setVoucherDateFrom(null);
      setVoucherDateTo(null);
      setSource(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    // Paint spinner first, then start scan (keeps click responsive).
    let cancelled = false;
    const start = () => {
      if (!cancelled) void reload();
    };
    const raf =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(() => {
            window.setTimeout(start, 0);
          })
        : null;
    const t = raf == null ? window.setTimeout(start, 0) : null;
    return () => {
      cancelled = true;
      loadGenRef.current += 1;
      if (raf != null) window.cancelAnimationFrame(raf);
      if (t != null) window.clearTimeout(t);
    };
  }, [reload]);

  return {
    fyRows,
    voucherDateFrom,
    voucherDateTo,
    loading,
    error,
    source,
    firestoreScanned,
    sqliteScanned,
    sqliteTotal,
    reload,
  };
}

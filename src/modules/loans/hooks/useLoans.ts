"use client";

import { useCallback, useEffect, useState } from "react";
import { BROWSER_DB_COLLECTION_BUMP } from "@/lib/localCompanyDocMirror";
import { listLoans, listSchedules } from "../db/loanRepository";
import { buildDashboardStats, filterLoans } from "../db/loanQueries";
import type { Loan, LoanDashboardStats } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { LOAN_COLLECTIONS } from "../constants/loanConstants";

const LOAN_BUMP_COLLECTIONS = new Set(Object.values(LOAN_COLLECTIONS));

export function useLoans(companyId: string | null | undefined, filters?: { search?: string; status?: string; lender?: string }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [schedulesByLoan, setSchedulesByLoan] = useState<Record<string, LoanScheduleRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const cid = String(companyId || "").trim();
    if (!cid) {
      setLoans([]);
      setSchedulesByLoan({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listLoans(cid);
      const map: Record<string, LoanScheduleRow[]> = {};
      for (const loan of list) {
        map[loan.id] = await listSchedules(cid, loan.id);
      }
      setLoans(list);
      setSchedulesByLoan(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loans");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    const cid = String(companyId || "").trim();
    if (!cid || typeof window === "undefined") return;
    const onBump = (ev: Event) => {
      const detail = (ev as CustomEvent<{ companyId?: string; collection?: string }>).detail;
      if (detail?.companyId && detail.companyId !== cid) return;
      if (detail?.collection && !LOAN_BUMP_COLLECTIONS.has(detail.collection as never) && detail.collection !== "vouchers") {
        return;
      }
      void reload();
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump as EventListener);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump as EventListener);
  }, [companyId, reload]);

  const filtered = filterLoans(loans, filters || {});
  const stats: LoanDashboardStats = buildDashboardStats(filtered, schedulesByLoan);

  return { loans: filtered, allLoans: loans, schedulesByLoan, stats, loading, error, reload };
}

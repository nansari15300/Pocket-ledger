"use client";

import { useCallback, useEffect, useState } from "react";
import { BROWSER_DB_COLLECTION_BUMP } from "@/lib/localCompanyDocMirror";
import {
  getLoan,
  listAudit,
  listCharges,
  listDocuments,
  listRateHistory,
  listSchedules,
  listTransactions,
} from "../db/loanRepository";
import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanAuditLog, LoanCharge, LoanDocument, LoanRateHistory, LoanTransaction } from "../types/loanTransactionTypes";
import { refreshScheduleStatuses } from "../services/loanScheduleService";
import { currentSchedule } from "../db/loanQueries";

export function useLoan(companyId: string | null | undefined, loanId: string | null | undefined) {
  const [loan, setLoan] = useState<Loan | null>(null);
  const [schedule, setSchedule] = useState<LoanScheduleRow[]>([]);
  const [allSchedule, setAllSchedule] = useState<LoanScheduleRow[]>([]);
  const [transactions, setTransactions] = useState<LoanTransaction[]>([]);
  const [charges, setCharges] = useState<LoanCharge[]>([]);
  const [rateHistory, setRateHistory] = useState<LoanRateHistory[]>([]);
  const [audit, setAudit] = useState<LoanAuditLog[]>([]);
  const [documents, setDocuments] = useState<LoanDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const cid = String(companyId || "").trim();
    const lid = String(loanId || "").trim();
    if (!cid || !lid) {
      setLoan(null);
      setSchedule([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await getLoan(cid, lid);
      setLoan(row);
      if (!row) {
        setSchedule([]);
        return;
      }
      const rows = await listSchedules(cid, lid);
      setAllSchedule(rows);
      setSchedule(refreshScheduleStatuses(row, currentSchedule(rows)));
      setTransactions(await listTransactions(cid, lid));
      setCharges(await listCharges(cid, lid));
      setRateHistory(await listRateHistory(cid, lid));
      setAudit(await listAudit(cid, lid));
      setDocuments(await listDocuments(cid, lid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loan");
    } finally {
      setLoading(false);
    }
  }, [companyId, loanId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    if (!companyId || typeof window === "undefined") return;
    const onBump = () => {
      void reload();
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
  }, [companyId, reload]);

  return { loan, schedule, allSchedule, transactions, charges, rateHistory, audit, documents, loading, error, reload };
}

export function useLoanSchedule(companyId: string | null | undefined, loanId: string | null | undefined) {
  const data = useLoan(companyId, loanId);
  return { schedule: data.schedule, loading: data.loading, reload: data.reload };
}

export function useLoanPayments(companyId: string | null | undefined, loanId: string | null | undefined) {
  const data = useLoan(companyId, loanId);
  return { transactions: data.transactions, loading: data.loading, reload: data.reload };
}

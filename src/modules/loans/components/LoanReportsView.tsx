"use client";

import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildLoanReport, type LoanReportKind } from "../services/loanReportService";
import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanTransaction } from "../types/loanTransactionTypes";
import { listTransactions } from "../db/loanRepository";
import { LoanSystemDateField, expandLoanReportForBothColumns } from "./LoanSystemDateField";
import { useDate } from "@/hooks/useDate";

const KINDS: { id: LoanReportKind; label: string }[] = [
  { id: "summary", label: "Loan Summary" },
  { id: "outstanding", label: "Outstanding Loan Report" },
  { id: "schedule", label: "Repayment Schedule" },
  { id: "interest_paid", label: "Interest Paid Report" },
  { id: "principal_paid", label: "Principal Paid Report" },
  { id: "upcoming", label: "Upcoming EMI Report" },
  { id: "overdue", label: "Overdue Loan Report" },
  { id: "transactions", label: "Loan Transaction Report" },
  { id: "account_ledger", label: "Loan Account Ledger" },
  { id: "interest_expense", label: "Interest Expense Report" },
  { id: "maturity", label: "Loan Maturity Report" },
];

export function LoanReportsView({
  loans,
  schedules,
  transactions,
}: {
  loans: Loan[];
  schedules: Record<string, LoanScheduleRow[]>;
  transactions: Record<string, LoanTransaction[]>;
}) {
  const [kind, setKind] = useState<LoanReportKind>("summary");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadedTx, setLoadedTx] = useState<Record<string, LoanTransaction[]>>(transactions);
  const { dateSystem, formatDate, formatDateBS } = useDate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, LoanTransaction[]> = { ...transactions };
      for (const loan of loans) {
        if (next[loan.id]?.length) continue;
        next[loan.id] = await listTransactions(loan.companyId, loan.id);
      }
      if (!cancelled) setLoadedTx(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [loans, transactions]);

  const report = useMemo(
    () => buildLoanReport({ kind, loans, schedules, transactions: loadedTx, filters: { status, fromDate, toDate } }),
    [kind, loans, schedules, loadedTx, status, fromDate, toDate]
  );

  const display = useMemo(
    () =>
      expandLoanReportForBothColumns(report.columns, report.rows, formatDate, formatDateBS, dateSystem),
    [report.columns, report.rows, formatDate, formatDateBS, dateSystem]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as LoanReportKind)}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <LoanSystemDateField
          value={fromDate}
          onChange={setFromDate}
          allowEmpty
          placeholder="From"
          className="min-w-[11rem] w-auto flex-none"
        />
        <LoanSystemDateField
          value={toDate}
          onChange={setToDate}
          allowEmpty
          placeholder="To"
          className="min-w-[11rem] w-auto flex-none"
        />
        <Button type="button" variant="outline" onClick={() => window.print()}>Print</Button>
      </div>
      <h2 className="text-lg font-semibold">{report.title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            {display.columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {display.rows.map((row, i) => (
            <TableRow key={i}>
              {display.columns.map((c) => (
                <TableCell key={c} className="tabular-nums">
                  {String(row[c] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

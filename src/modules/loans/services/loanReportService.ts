import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import type { LoanTransaction } from "../types/loanTransactionTypes";
import { remainingDue } from "../utils/loanStatus";
import { compareIsoDates } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";
import { currentSchedule } from "../db/loanQueries";

export type LoanReportKind =
  | "summary"
  | "outstanding"
  | "schedule"
  | "interest_paid"
  | "principal_paid"
  | "upcoming"
  | "overdue"
  | "transactions"
  | "account_ledger"
  | "interest_expense"
  | "maturity";

export type LoanReportFilters = {
  loanId?: string;
  lender?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
};

export type LoanReportRow = Record<string, string | number>;

function inRange(date: string, from?: string, to?: string): boolean {
  if (from && compareIsoDates(date, from) < 0) return false;
  if (to && compareIsoDates(date, to) > 0) return false;
  return true;
}

export function buildLoanReport(params: {
  kind: LoanReportKind;
  loans: Loan[];
  schedules: Record<string, LoanScheduleRow[]>;
  transactions: Record<string, LoanTransaction[]>;
  filters: LoanReportFilters;
}): { title: string; columns: string[]; rows: LoanReportRow[] } {
  const loans = params.loans.filter((l) => {
    if (params.filters.loanId && l.id !== params.filters.loanId) return false;
    if (params.filters.lender && l.lenderName !== params.filters.lender) return false;
    if (params.filters.status && params.filters.status !== "all" && l.status !== params.filters.status) return false;
    return true;
  });

  const kind = params.kind;
  if (kind === "summary" || kind === "outstanding") {
    return {
      title: kind === "summary" ? "Loan Summary" : "Outstanding Loan Report",
      columns: ["Loan", "Number", "Lender", "Principal", "Outstanding", "Interest Paid", "Status"],
      rows: loans.map((l) => ({
        Loan: l.loanName,
        Number: l.loanNumber,
        Lender: l.lenderName,
        Principal: l.principalAmount,
        Outstanding: l.outstandingPrincipal,
        "Interest Paid": l.paidInterest,
        Status: l.status,
      })),
    };
  }
  if (kind === "schedule") {
    const rows: LoanReportRow[] = [];
    for (const loan of loans) {
      for (const s of currentSchedule(params.schedules[loan.id] || [])) {
        if (!inRange(s.dueDate, params.filters.fromDate, params.filters.toDate)) continue;
        rows.push({
          Loan: loan.loanName,
          "#": s.installmentNumber,
          "Due Date": s.dueDate,
          Principal: s.principalDue,
          Interest: s.interestDue,
          EMI: s.totalDue,
          Paid: s.totalPaid,
          Status: s.status,
        });
      }
    }
    return { title: "Repayment Schedule", columns: ["Loan", "#", "Due Date", "Principal", "Interest", "EMI", "Paid", "Status"], rows };
  }
  if (kind === "upcoming" || kind === "overdue") {
    const rows: LoanReportRow[] = [];
    for (const loan of loans) {
      for (const s of currentSchedule(params.schedules[loan.id] || [])) {
        if (kind === "upcoming" && s.status !== "upcoming" && s.status !== "due") continue;
        if (kind === "overdue" && s.status !== "overdue") continue;
        rows.push({
          Loan: loan.loanName,
          "#": s.installmentNumber,
          "Due Date": s.dueDate,
          Remaining: remainingDue(s),
          Status: s.status,
        });
      }
    }
    return {
      title: kind === "upcoming" ? "Upcoming EMI Report" : "Overdue Loan Report",
      columns: ["Loan", "#", "Due Date", "Remaining", "Status"],
      rows,
    };
  }
  if (kind === "transactions" || kind === "account_ledger") {
    const rows: LoanReportRow[] = [];
    for (const loan of loans) {
      for (const t of params.transactions[loan.id] || []) {
        if (!inRange(t.paymentDate, params.filters.fromDate, params.filters.toDate)) continue;
        rows.push({
          Loan: loan.loanName,
          Date: t.paymentDate,
          Kind: t.kind,
          Principal: t.principalAmount,
          Interest: t.interestAmount,
          Charges: roundMoney(t.chargeAmount + t.lateFeeAmount),
          Total: t.amount,
          Journal: t.journalEntryId || "",
          Reference: t.referenceNumber,
        });
      }
    }
    return {
      title: kind === "account_ledger" ? "Loan Account Ledger" : "Loan Transaction Report",
      columns: ["Loan", "Date", "Kind", "Principal", "Interest", "Charges", "Total", "Journal", "Reference"],
      rows,
    };
  }
  if (kind === "interest_paid" || kind === "interest_expense") {
    return {
      title: "Interest Paid / Expense Report",
      columns: ["Loan", "Interest Paid", "Rate", "Method"],
      rows: loans.map((l) => ({
        Loan: l.loanName,
        "Interest Paid": l.paidInterest,
        Rate: l.interestRate,
        Method: l.interestMethod,
      })),
    };
  }
  if (kind === "principal_paid") {
    return {
      title: "Principal Paid Report",
      columns: ["Loan", "Principal", "Paid", "Outstanding"],
      rows: loans.map((l) => ({
        Loan: l.loanName,
        Principal: l.principalAmount,
        Paid: l.paidPrincipal,
        Outstanding: l.outstandingPrincipal,
      })),
    };
  }
  return {
    title: "Loan Maturity Report",
    columns: ["Loan", "Maturity", "Outstanding", "Status"],
    rows: loans.map((l) => ({
      Loan: l.loanName,
      Maturity: l.maturityDate,
      Outstanding: l.outstandingPrincipal,
      Status: l.status,
    })),
  };
}

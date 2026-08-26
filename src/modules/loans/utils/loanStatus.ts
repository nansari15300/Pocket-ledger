import type { Loan } from "../types/loanTypes";
import type { LoanScheduleRow, ScheduleStatus } from "../types/loanScheduleTypes";
import { addCalendarDays, compareIsoDates, daysBetween, todayIso } from "./loanDateUtils";
import { roundMoney } from "./loanRounding";

export function remainingDue(row: Pick<LoanScheduleRow, "totalDue" | "totalPaid">): number {
  return roundMoney(Math.max(0, (row.totalDue || 0) - (row.totalPaid || 0)));
}

export function computeScheduleStatus(
  row: Pick<LoanScheduleRow, "totalDue" | "totalPaid" | "dueDate" | "status" | "isHistorical">,
  gracePeriodDays: number,
  asOf = todayIso()
): ScheduleStatus {
  if (row.isHistorical) return "cancelled";
  if (row.status === "waived" || row.status === "cancelled") return row.status;
  const remaining = remainingDue(row);
  if (remaining <= 0 && (row.totalPaid || 0) > 0) return "paid";
  if ((row.totalPaid || 0) > 0 && remaining > 0) return "partially_paid";
  const overdueFrom = addCalendarDays(row.dueDate, Math.max(0, gracePeriodDays));
  if (compareIsoDates(asOf, overdueFrom) > 0) return "overdue";
  if (compareIsoDates(asOf, row.dueDate) >= 0) return "due";
  return "upcoming";
}

export function daysOverdue(dueDate: string, gracePeriodDays: number, asOf = todayIso()): number {
  const overdueFrom = addCalendarDays(dueDate, Math.max(0, gracePeriodDays));
  if (compareIsoDates(asOf, overdueFrom) <= 0) return 0;
  return daysBetween(overdueFrom, asOf);
}

export function deriveLoanStatus(loan: Pick<Loan, "status" | "outstandingPrincipal" | "outstandingInterest">, hasOverdue: boolean): Loan["status"] {
  if (loan.status === "closed" || loan.status === "cancelled") return loan.status;
  if (loan.status === "restructured") return hasOverdue ? "overdue" : "restructured";
  if (roundMoney(loan.outstandingPrincipal) <= 0 && roundMoney(loan.outstandingInterest) <= 0) {
    return loan.status === "draft" ? "draft" : loan.status;
  }
  if (hasOverdue) return "overdue";
  if (loan.status === "draft") return "draft";
  return "active";
}

export function scheduleLabel(status: ScheduleStatus): string {
  switch (status) {
    case "upcoming":
      return "Upcoming";
    case "due":
      return "Due";
    case "partially_paid":
      return "Partially Paid";
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    case "waived":
      return "Waived";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function loanStatusLabel(status: Loan["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "overdue":
      return "Overdue";
    case "restructured":
      return "Restructured";
    case "closed":
      return "Closed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

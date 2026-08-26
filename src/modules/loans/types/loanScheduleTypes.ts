import type { SCHEDULE_STATUSES } from "../constants/loanConstants";

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export type LoanScheduleRow = {
  id: string;
  companyId: string;
  loanId: string;
  scheduleVersion: number;
  installmentNumber: number;
  dueDate: string;
  openingPrincipal: number;
  principalDue: number;
  openingInterest: number;
  interestDue: number;
  totalDue: number;
  principalPaid: number;
  interestPaid: number;
  lateFee: number;
  otherCharges: number;
  totalPaid: number;
  closingPrincipal: number;
  status: ScheduleStatus;
  paymentDate: string | null;
  journalEntryId: string | null;
  isHistorical: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedScheduleRow = Omit<
  LoanScheduleRow,
  "id" | "companyId" | "loanId" | "journalEntryId" | "createdAt" | "updatedAt" | "paymentDate"
> & {
  paymentDate?: string | null;
};

import { generateLoanSchedule, previewFromSchedule, resolveEmi, type ScheduleGenerateInput } from "../calculations/scheduleGenerator";
import type { LoanPreview } from "../types/loanTypes";
import type { GeneratedScheduleRow } from "../types/loanScheduleTypes";

export function buildScheduleAndPreview(input: ScheduleGenerateInput): {
  schedule: GeneratedScheduleRow[];
  preview: LoanPreview;
  emiAmount: number;
} {
  const emiAmount = resolveEmi(input);
  const schedule = generateLoanSchedule({ ...input, emiAmount });
  return { schedule, preview: previewFromSchedule(schedule, emiAmount), emiAmount };
}

export function remainingInstallments(schedule: { status: string; isHistorical?: boolean }[]): number {
  return schedule.filter((r) => !r.isHistorical && r.status !== "paid" && r.status !== "cancelled" && r.status !== "waived").length;
}

"use client";

import { Badge } from "@/components/ui/badge";
import { loanStatusLabel, scheduleLabel } from "../utils/loanStatus";
import type { LoanStatus } from "../types/loanTypes";
import type { ScheduleStatus } from "../types/loanScheduleTypes";
import { SCHEDULE_STATUSES } from "../constants/loanConstants";
import { cn } from "@/lib/utils";

export function LoanStatusBadge({ status }: { status: LoanStatus | ScheduleStatus }) {
  const isSchedule = (SCHEDULE_STATUSES as readonly string[]).includes(status);
  const label = isSchedule ? scheduleLabel(status as ScheduleStatus) : loanStatusLabel(status as LoanStatus);
  const tone =
    status === "overdue"
      ? "bg-red-100 text-red-800 border-red-200"
      : status === "closed" || status === "paid"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : status === "draft" || status === "upcoming"
          ? "bg-slate-100 text-slate-700 border-slate-200"
          : status === "partially_paid" || status === "due"
            ? "bg-amber-100 text-amber-800 border-amber-200"
            : "bg-sky-100 text-sky-800 border-sky-200";
  return (
    <Badge variant="outline" className={cn("font-medium", tone)}>
      {label}
    </Badge>
  );
}

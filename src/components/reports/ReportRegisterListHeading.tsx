"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReportShowListButton } from "@/components/reports/ReportShowListButton";

type ReportRegisterListHeadingProps = {
  children: ReactNode;
  className?: string;
};

/** Register / legacy report list column title + show-report-list icon. */
export function ReportRegisterListHeading({ children, className }: ReportRegisterListHeadingProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <ReportShowListButton />
      <h2 className="min-w-0 truncate text-lg font-bold font-headline">{children}</h2>
    </div>
  );
}

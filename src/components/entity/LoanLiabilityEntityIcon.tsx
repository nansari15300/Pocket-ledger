"use client";

import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

/** Loan account fallback — Lucide briefcase (same as Loan & Staff nav). */
export function LoanLiabilityEntityIcon({
  className,
  size = "md",
}: {
  className?: string;
  size?: "md" | "nav" | "avatar" | "detail";
}) {
  return (
    <Briefcase
      aria-hidden
      className={cn(
        "shrink-0 text-muted-foreground",
        size === "nav"
          ? "h-5 w-5"
          : size === "detail"
            ? "h-6 w-6"
            : "h-4 w-4",
        className
      )}
    />
  );
}

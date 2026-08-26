"use client";

import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { isLoanLiabilityStaff } from "@/modules/loans/utils/loanLiabilityStaff";
import { LoanLiabilityEntityIcon } from "./LoanLiabilityEntityIcon";

/** Sidebar / nav / section headers — Loan & Staff entity gold icon. */
export function StaffEntityNavIcon({ className }: { className?: string }) {
  return <LoanLiabilityEntityIcon size="nav" className={className} />;
}

/** Account avatar fallback when no profile file — loan liability = gold; salary staff = briefcase. */
export function StaffAccountFallbackIcon({
  staff,
  className,
  variant = "list",
}: {
  staff?: { groupId?: string | null; isLoanAccount?: boolean | null } | null;
  className?: string;
  variant?: "list" | "detail";
}) {
  if (isLoanLiabilityStaff(staff)) {
    return (
      <LoanLiabilityEntityIcon
        size={variant === "detail" ? "detail" : "avatar"}
        className={className}
      />
    );
  }
  return <Briefcase className={cn("h-4 w-4 text-muted-foreground", className)} />;
}

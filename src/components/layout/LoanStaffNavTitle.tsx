"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";

export type LoanStaffNavActive = "staff" | "loans";

/** Master list header — Loan & Staff ↔ Loan Overview cross-links (active bold, other dim). */
export function LoanStaffNavTitle({ active }: { active: LoanStaffNavActive }) {
  const linkClass = (isActive: boolean) =>
    cn(
      "text-xs leading-snug transition-colors hover:underline",
      isActive ? "font-bold text-foreground" : "font-normal text-muted-foreground/65"
    );

  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <Link href="/staff" className={linkClass(active === "staff")}>
        {STAFF_ENTITY_LABEL}
      </Link>
      <Link href="/loans" className={cn("pl-3", linkClass(active === "loans"))}>
        Loan Overview
      </Link>
    </span>
  );
}

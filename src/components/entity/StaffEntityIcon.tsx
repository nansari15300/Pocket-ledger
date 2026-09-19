"use client";

import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sidebar / nav / section headers — same Lucide line icon as other entity menus. */
export function StaffEntityNavIcon({ className }: { className?: string }) {
  return <Briefcase className={className} />;
}

/** Account avatar fallback when no profile file — briefcase for staff and loan liability. */
export function StaffAccountFallbackIcon({
  className,
}: {
  staff?: { groupId?: string | null; isLoanAccount?: boolean | null } | null;
  className?: string;
  variant?: "list" | "detail";
}) {
  return <Briefcase className={cn("h-4 w-4 text-muted-foreground", className)} />;
}

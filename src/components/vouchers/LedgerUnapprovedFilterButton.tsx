"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** PC ledger header: date picker ke left — click = all-time unapproved-only filter. */
export function LedgerUnapprovedFilterButton({
  active,
  onClick,
  className,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn(
        "h-10 flex-shrink-0 whitespace-nowrap",
        active && "bg-pink-600 text-white hover:bg-pink-700 hover:text-white",
        className
      )}
      onClick={onClick}
      data-theme-detail="unapproved-filter"
    >
      Unapproved
    </Button>
  );
}

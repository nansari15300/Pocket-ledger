"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Account list row: pending-approval vouchers wale accounts dikhane ke liye toggle (Groups list me nahi) */
export function UnapprovedOnlyToggle({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn(
        "shrink-0 text-xs",
        active && "bg-amber-600 text-white hover:bg-amber-700 hover:text-white",
        className
      )}
      onClick={onToggle}
    >
      Unapproved
    </Button>
  );
}

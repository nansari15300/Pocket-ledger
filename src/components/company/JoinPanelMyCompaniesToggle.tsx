"use client";

import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
};

/** Mobile join panel header — nowrap "My companies" chip. */
export function JoinPanelMyCompaniesToggle({ label, open, onToggle, className }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-8 shrink-0 gap-0.5 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        className
      )}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span>{label}</span>
      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </Button>
  );
}

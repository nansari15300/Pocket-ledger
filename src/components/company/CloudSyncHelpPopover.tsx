"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** (i) icon — cloud sync settings help (English). */
export function CloudSyncHelpPopover({
  label,
  description,
  hasError,
}: {
  label: string;
  description: ReactNode;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/50",
            open && "bg-emerald-100 dark:bg-emerald-900/40",
            hasError && "text-destructive ring-1 ring-destructive/40"
          )}
          aria-label={label}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={12}
        className="z-[10050] max-w-[min(22rem,calc(100vw-2rem))] p-3 text-xs leading-relaxed text-foreground"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="font-semibold text-sm mb-1.5">{label}</p>
        <div className="text-muted-foreground space-y-2">{description}</div>
      </PopoverContent>
    </Popover>
  );
}

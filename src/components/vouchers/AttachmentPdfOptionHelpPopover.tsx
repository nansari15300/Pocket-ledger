"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** (i) icon — attachment PDF save options help. */
export function AttachmentPdfOptionHelpPopover({
  label,
  description,
  side = "top",
  className,
}: {
  label: string;
  description: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            open && "bg-muted text-foreground",
            className
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
        side={side}
        align="start"
        collisionPadding={12}
        className="z-[10050] max-w-[min(22rem,calc(100vw-2rem))] p-3 text-xs leading-relaxed text-foreground"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-1.5 text-sm font-semibold">{label}</p>
        <div className="space-y-2 text-muted-foreground">{description}</div>
      </PopoverContent>
    </Popover>
  );
}

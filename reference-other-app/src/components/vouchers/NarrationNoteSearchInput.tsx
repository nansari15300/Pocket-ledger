"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Compact search next to "Show Narration"; filters narration + note title in TransactionsTable. */
export function NarrationNoteSearchInput({
  value,
  onChange,
  className,
  id = "narration-note-search",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative w-[min(220px,40vw)] min-w-[140px] flex-shrink-0", className)}>
      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search narration / note title"
        className="h-8 pl-8 text-sm"
        autoComplete="off"
      />
    </div>
  );
}

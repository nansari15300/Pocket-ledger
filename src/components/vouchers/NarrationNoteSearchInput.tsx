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
  toolbarChrome = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  /** Dashboard Daybook toolbar — Recent search jaisa h-9, blue border, white fill */
  toolbarChrome?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative w-[min(220px,40vw)] min-w-[140px] flex-shrink-0",
        toolbarChrome && "h-9 min-h-9 max-h-9",
        className,
      )}
    >
      <Search
        className={cn(
          "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground z-10",
          toolbarChrome ? "h-4 w-4" : "h-3.5 w-3.5",
        )}
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        enterKeyHint="search"
        listChrome={toolbarChrome}
        listChromeSearch={toolbarChrome}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search narration / note title"
        className={cn(
          toolbarChrome
            ? "h-9 min-h-9 max-h-9 w-full bg-white py-1 pl-8 pr-2 text-sm dark:bg-white"
            : "h-8 pl-8 text-sm",
        )}
        autoComplete="off"
        aria-label="Search narration or note title"
      />
    </div>
  );
}

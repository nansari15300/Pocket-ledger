"use client";

import * as React from "react";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FY_OPENING_PILL_FORMAT_OPTIONS,
  type FyOpeningPillFormat,
} from "@/lib/fyOpeningPillFormat";
import { useFyOpeningPillFormat } from "@/hooks/useFyOpeningPillFormat";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  title?: string;
};

/** FY opening row pill — click to pick label format (device localStorage). */
export function FyOpeningPillFormatPill({
  children,
  className,
  title = "Change FY opening label format",
}: Props) {
  const { format, setFormat } = useFyOpeningPillFormat();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          className={cn("inline-flex max-w-full cursor-pointer rounded-xl border-0 bg-transparent p-0", className)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[16rem]"
        onClick={(e) => e.stopPropagation()}
      >
        {FY_OPENING_PILL_FORMAT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            className="flex flex-col items-start gap-0.5 py-2"
            onSelect={() => setFormat(opt.value as FyOpeningPillFormat)}
          >
            <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
              {opt.label}
              {format === opt.value ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {opt.sampleBs} · {opt.sampleAd}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

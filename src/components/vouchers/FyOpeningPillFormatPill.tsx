"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FY_OPENING_PILL_FORMAT_OPTIONS,
  type FyOpeningPillFormat,
} from "@/lib/fyOpeningPillFormat";
import { useFyOpeningPillFormat } from "@/hooks/useFyOpeningPillFormat";
import { useFyPartitionRowColor } from "@/hooks/useFyPartitionRowColor";
import {
  FY_PARTITION_ROW_COLOR_OPTIONS,
  type FyPartitionRowColor,
  type FyPartitionRowColorTarget,
} from "@/lib/fyPartitionRowColor";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  /** FY merge divider: left chevron = format dropdown hint */
  showLeadingChevron?: boolean;
};

/** FY opening row pill — click to pick label format (device localStorage). */
export function FyOpeningPillFormatPill({
  children,
  className,
  title = "Change FY opening label format",
  showLeadingChevron = false,
}: Props) {
  const { format, setFormat } = useFyOpeningPillFormat();
  const [colorTarget, setColorTarget] = React.useState<FyPartitionRowColorTarget>("end");
  const startRowColor = useFyPartitionRowColor("start");
  const endRowColor = useFyPartitionRowColor("end");
  const activeRowColor = colorTarget === "start" ? startRowColor : endRowColor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          className={cn(
            "inline-flex max-w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0",
            showLeadingChevron ? "rounded-none" : "rounded-xl",
            className
          )}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {showLeadingChevron ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />
          ) : null}
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="pb-1 text-xs">FY row color</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 px-2 pb-2">
          {([
            ["start", "FY Start Row"],
            ["end", "FY End Row"],
          ] as const).map(([target, label]) => (
            <button
              key={target}
              type="button"
              className={cn(
                "h-7 rounded-md border px-2 text-xs font-semibold",
                colorTarget === target
                  ? "border-blue-500 bg-blue-100 text-blue-900"
                  : "border-border bg-background text-foreground"
              )}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setColorTarget(target);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 px-2 pb-2">
          {FY_PARTITION_ROW_COLOR_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              title={option.label}
              aria-label={`${option.label} FY row color`}
              className={cn(
                "relative h-7 w-7 cursor-pointer rounded-md border p-0 focus:ring-2 focus:ring-blue-500",
                option.value === "default" && "bg-background"
              )}
              style={
                option.color
                  ? { backgroundColor: option.color, borderColor: option.borderColor }
                  : undefined
              }
              onSelect={() => activeRowColor.setColor(option.value as FyPartitionRowColor)}
            >
              {option.value === "default" ? (
                <span className="absolute inset-[3px] rounded-sm border border-dashed border-muted-foreground/60" />
              ) : null}
              {activeRowColor.color === option.value ? (
                <Check className="relative z-10 m-auto h-4 w-4 text-black" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

/**
 * Year picker: pehle ±5 saal (11 rows) — "Show more" se range badhe; selected row green border + tick.
 * Reference app / BS+AD date panels ke saath same trigger size as month wheel.
 */
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calendarSelectContentClassName } from "@/lib/calendarChrome";
import { ChevronDown, Check } from "lucide-react";

const STEP = 5;
const INITIAL_PAST = 5;
const INITIAL_FUTURE = 5;

function initialYearRange(value: number, minYear: number, maxYear: number) {
  return {
    start: Math.max(minYear, value - INITIAL_PAST),
    end: Math.min(maxYear, value + INITIAL_FUTURE),
  };
}

export type YearSelectShowMoreProps = {
  value: number;
  onChange: (y: number) => void;
  minYear: number;
  maxYear: number;
  className?: string;
  disabled?: boolean;
};

export function YearSelectShowMore({
  value,
  onChange,
  minYear,
  maxYear,
  className,
  disabled,
}: YearSelectShowMoreProps) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState(() => initialYearRange(value, minYear, maxYear).start);
  const [end, setEnd] = React.useState(() => initialYearRange(value, minYear, maxYear).end);
  const listRef = React.useRef<HTMLDivElement>(null);
  const centerFollowUpRafRef = React.useRef(0);

  const scrollSelectedRowToCenter = React.useCallback(() => {
    const container = listRef.current;
    if (!container) return;
    const row = container.querySelector(`[data-year-row="${value}"]`) as HTMLElement | null;
    if (!row || container.clientHeight < 8) return;
    const rowRect = row.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const rowMid = rowRect.top + rowRect.height / 2;
    const contMid = contRect.top + container.clientHeight / 2;
    container.scrollTop += rowMid - contMid;
  }, [value]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        const r = initialYearRange(value, minYear, maxYear);
        setStart(r.start);
        setEnd(r.end);
      }
      setOpen(next);
    },
    [value, minYear, maxYear]
  );

  React.useLayoutEffect(() => {
    if (!open) return;
    scrollSelectedRowToCenter();
    const outer = requestAnimationFrame(() => {
      scrollSelectedRowToCenter();
      centerFollowUpRafRef.current = requestAnimationFrame(() => scrollSelectedRowToCenter());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(centerFollowUpRafRef.current);
    };
  }, [open, value, start, end, scrollSelectedRowToCenter]);

  const years = React.useMemo(() => {
    const arr: number[] = [];
    for (let y = start; y <= end; y++) arr.push(y);
    return arr;
  }, [start, end]);

  const canOlder = start > minYear;
  const canNewer = end < maxYear;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-[120px] h-8 text-sm justify-between px-3 font-normal", className)}
        >
          <span>{value}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[120px] p-0 z-[120]", calendarSelectContentClassName)}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col max-h-[min(320px,55vh)]">
          {canOlder ? (
            <button
              type="button"
              className="text-center text-xs py-2 px-2 border-b border-border bg-muted/40 hover:bg-muted text-primary font-medium shrink-0"
              onClick={() => setStart((s) => Math.max(minYear, s - STEP))}
            >
              Show more · older years
            </button>
          ) : null}
          <div
            ref={listRef}
            className={cn(
              "overflow-y-auto py-1.5 flex-1 min-h-0 px-1",
              "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            )}
          >
            {years.map((y) => (
              <button
                key={y}
                type="button"
                data-year-row={y}
                className={cn(
                  "w-full max-w-[calc(100%-2px)] mx-auto flex items-center justify-start gap-2 pl-2.5 pr-2 py-1.5 text-sm rounded-full transition-colors border-2 border-transparent bg-background",
                  y === value
                    ? "border-green-600 font-semibold text-foreground hover:border-green-600"
                    : "text-foreground hover:border-green-600 hover:bg-transparent"
                )}
                onClick={() => {
                  onChange(y);
                  setOpen(false);
                }}
              >
                {y === value ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : (
                  <span className="w-3.5 shrink-0 inline-block" aria-hidden />
                )}
                {y}
              </button>
            ))}
          </div>
          {canNewer ? (
            <button
              type="button"
              className="text-center text-xs py-2 px-2 border-t border-border bg-muted/40 hover:bg-muted text-primary font-medium shrink-0"
              onClick={() => setEnd((e) => Math.min(maxYear, e + STEP))}
            >
              Show more · newer years
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

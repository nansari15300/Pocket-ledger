"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { LedgerFooterChromePill, LEDGER_FOOTER_PILL_H } from "@/components/vouchers/ledgerFooterChrome";
import { cn } from "@/lib/utils";

type Props = {
  idPrefix: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  viewMode: "statement" | "bill_wise";
  hiddenCount?: number;
};

export function StatementCheckModeFooterControls({
  idPrefix,
  enabled,
  onEnabledChange,
  viewMode,
  hiddenCount = 0,
}: Props) {
  const isMobile = useIsMobile();
  if (isMobile || viewMode !== "statement") return null;

  const checkId = `check-mode-${idPrefix}`;

  return (
    <LedgerFooterChromePill className="gap-1 pr-1">
      <Checkbox
        id={checkId}
        checked={enabled}
        onCheckedChange={(c) => onEnabledChange(Boolean(c))}
        className="shrink-0"
      />
      <label
        htmlFor={checkId}
        className="cursor-pointer whitespace-nowrap text-sm font-medium leading-none"
      >
        Check mode
        {enabled && hiddenCount > 0 ? (
          <span className="font-normal text-muted-foreground"> ({hiddenCount} hidden)</span>
        ) : null}
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(LEDGER_FOOTER_PILL_H, "w-8 shrink-0 rounded-full px-0")}
            aria-label="Check mode shortcuts"
          >
            <Info className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 text-sm">
          <p className="mb-2 font-semibold">Check mode</p>
          <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
            <li><kbd className="rounded border bg-muted px-1 text-foreground">↑</kbd> / <kbd className="rounded border bg-muted px-1 text-foreground">↓</kbd> — move between transactions</li>
            <li><kbd className="rounded border bg-muted px-1 text-foreground">Space</kbd> — mark / unmark row (soft green highlight)</li>
            <li><kbd className="rounded border bg-muted px-1 text-foreground">Ctrl</kbd>+<kbd className="rounded border bg-muted px-1 text-foreground">H</kbd> — hide focused row (excluded from totals)</li>
            <li><kbd className="rounded border bg-muted px-1 text-foreground">Ctrl</kbd>+<kbd className="rounded border bg-muted px-1 text-foreground">Alt</kbd>+<kbd className="rounded border bg-muted px-1 text-foreground">H</kbd> — hide all marked rows</li>
            <li><kbd className="rounded border bg-muted px-1 text-foreground">Ctrl</kbd>+<kbd className="rounded border bg-muted px-1 text-foreground">U</kbd> — unhide one row</li>
            <li><kbd className="rounded border bg-muted px-1 text-foreground">Ctrl</kbd>+<kbd className="rounded border bg-muted px-1 text-foreground">Alt</kbd>+<kbd className="rounded border bg-muted px-1 text-foreground">U</kbd> — unhide all hidden rows</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Check mode stays on when you leave and return. Turn it off to reset hidden rows and marks.
          </p>
        </PopoverContent>
      </Popover>
    </LedgerFooterChromePill>
  );
}

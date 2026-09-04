"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BalanceSheetCheckEngineInput } from "@/lib/reports/balanceSheetCheckEngine";
import {
  CLOSING_ENTITY_FILTER_LABELS,
  CLOSING_ENTITY_FILTER_ORDER,
  buildBalanceSheetClosingAccountRows,
  countClosingAccountRowsByEntity,
  type ClosingEntityFilter,
} from "@/lib/reports/balanceSheetClosingAccountRows";
import { OtherDifferentClosingAccountsTable } from "@/components/reports/otherDifferentClosingAccountsTable";

const ENTITY_TAB_ACTIVE =
  "border-green-700 bg-green-50 text-green-900 dark:border-green-600 dark:bg-green-950/40 dark:text-green-100";
const ENTITY_TAB_INACTIVE =
  "border-black/20 bg-background text-muted-foreground hover:bg-muted/40";

export type OtherDifferentClosingAccountsPanelProps = {
  checkEngineInput: BalanceSheetCheckEngineInput;
  formatAmount: (n: number) => string;
  onClose: () => void;
  liveRevision: number;
  reportRunAtMs: number;
};

export function OtherDifferentClosingAccountsPanel({
  checkEngineInput,
  formatAmount,
  onClose,
  liveRevision,
  reportRunAtMs,
}: OtherDifferentClosingAccountsPanelProps) {
  const [entityFilter, setEntityFilter] = useState<ClosingEntityFilter>("all");

  const entityCounts = useMemo(() => {
    const rows = buildBalanceSheetClosingAccountRows(checkEngineInput);
    return countClosingAccountRowsByEntity(rows);
  }, [checkEngineInput, liveRevision]);

  return (
    <div
      data-bs-diff-closing-accounts-panel=""
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div className="shrink-0 border-b-[1px] border-black px-3 py-2.5 bg-[var(--bs-diff-trace-header-blue)] flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">All closing accounts</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Every non-zero closing balance — Dr / Cr columns and cumulative running balance.
            <span className="ml-1.5 text-green-700 font-medium">Live from SQLite</span>
            {reportRunAtMs > 0 ? (
              <span className="ml-1 tabular-nums">
                · updated {new Date(reportRunAtMs).toLocaleTimeString()}
              </span>
            ) : null}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={onClose}>
          Back to trace tables
        </Button>
      </div>

      <div
        data-bs-diff-closing-entity-tabs=""
        className="shrink-0 flex flex-wrap gap-1 border-b-[1px] border-black bg-background px-3 py-2"
      >
        {CLOSING_ENTITY_FILTER_ORDER.map((id) => {
          const count = entityCounts[id];
          const disabled = id !== "all" && count === 0;
          const isActive = entityFilter === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-medium sm:text-xs whitespace-nowrap",
                isActive ? ENTITY_TAB_ACTIVE : ENTITY_TAB_INACTIVE,
                disabled && "opacity-40 cursor-not-allowed"
              )}
              onClick={() => setEntityFilter(id)}
            >
              {CLOSING_ENTITY_FILTER_LABELS[id]}
              {id === "all" ? ` (${count})` : ` · ${count}`}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-slim-dim p-3">
        <OtherDifferentClosingAccountsTable
          checkEngineInput={checkEngineInput}
          formatAmount={formatAmount}
          liveRevision={liveRevision}
          entityFilter={entityFilter}
          fullPage
        />
      </div>
    </div>
  );
}

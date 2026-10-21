"use client";

import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { masterDetailBalanceToneClass } from "@/lib/utils";

type ReportEntityMobileHeaderProps = {
  title: string;
  entityName?: string | null;
  closingBalance: number;
  dateRangeLabel: string;
  hasDateFilter: boolean;
  onBack: () => void;
  onClearDate: () => void;
  avatar?: ReactNode;
  action?: ReactNode;
};

/** Party ledger chrome: title + period share the profile tile's 56px band. */
export function ReportEntityMobileHeader({
  title,
  entityName,
  closingBalance,
  dateRangeLabel,
  hasDateFilter,
  onBack,
  onClearDate,
  avatar,
  action,
}: ReportEntityMobileHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex flex-shrink-0 flex-col bg-white dark:bg-card">
      <div
        data-pl-mobile-entity-detail-header=""
        className="flex h-14 min-w-0 flex-shrink-0 items-center gap-1.5 border-b border-blue-300/80 bg-slate-200 px-2 py-0.5"
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center self-stretch">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <h1 className="shrink-0 text-sm font-bold text-muted-foreground">{title}</h1>
            {entityName ? (
              <span
                className={`min-w-0 truncate text-xs font-medium ${masterDetailBalanceToneClass(closingBalance)}`}
                title={entityName}
              >
                · {entityName}
              </span>
            ) : null}
            {action}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 pl-[2.125rem]">
            <span className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
              {dateRangeLabel}
            </span>
            {hasDateFilter ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 flex-shrink-0"
                onClick={onClearDate}
                title="Clear date filter"
                aria-label="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        {avatar ? <div className="flex-shrink-0" aria-hidden>{avatar}</div> : null}
      </div>
    </header>
  );
}

"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import type { ReconciliationShare } from "@/lib/reconciliation/types";
import {
  buildReconShareSearchIndex,
  reconShareCompanyOptions,
  reconShareEntityOptions,
  reconShareOtherAccountOptions,
  reconShareEntryByAccountKey,
  reconShareFiltersFromAccountEntry,
  EMPTY_RECON_SHARE_LIST_FILTERS,
  type ReconShareLinkStatusFilter,
  type ReconShareListFilters,
} from "@/lib/reconciliation/shareListSearch";
import {
  reconShareListCardCn,
  reconShareListCardToneCn,
} from "@/lib/reconciliation/reconShareListChrome";

/** Filter row pills — text-height; Button default h-10 override. */
const filterPillCn = cn(
  chromeProPillCn,
  "inline-flex !h-auto !min-h-0 shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none shadow-none",
);
const linkStatusPillActiveCn =
  "border-blue-600 !bg-blue-50/90 !text-blue-900 ring-2 ring-blue-600/40 odd:border-blue-600 even:border-blue-600 hover:!bg-blue-100/90";

/** Filter card — All / Linked / Unlinked pill options. */
const LINK_STATUS_OPTIONS: { value: ReconShareLinkStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "linked", label: "Linked" },
  { value: "unlinked", label: "Unlinked" },
];

/** Dialog/list Combobox pass-through — Combobox props se align; literal `true`/`false` TS2322 avoid. */
type ReconShareListComboboxPassThrough = Pick<
  React.ComponentProps<typeof Combobox>,
  "popoverModal" | "autoFocusSearchOnOpen" | "contentWidthMode" | "searchPlaceholder"
>;

type ReconShareListSearchBarProps = {
  shares: ReconciliationShare[];
  userId: string | undefined;
  filters: ReconShareListFilters;
  onFiltersChange: (next: ReconShareListFilters) => void;
  comboboxProps: ReconShareListComboboxPassThrough;
  /** Filter ke baad kitni shares bachi — footer hint. */
  filteredCount: number;
  totalCount: number;
};

/** Shared list + Unlinked — company → entity → other-side account cascade search. */
export function ReconShareListSearchBar({
  shares,
  userId,
  filters,
  onFiltersChange,
  comboboxProps,
  filteredCount,
  totalCount,
}: ReconShareListSearchBarProps) {
  const searchIndex = React.useMemo(
    () => buildReconShareSearchIndex(shares, userId),
    [shares, userId],
  );

  const companyOptions = React.useMemo(
    () => reconShareCompanyOptions(searchIndex),
    [searchIndex],
  );
  const entityOptions = React.useMemo(
    () => reconShareEntityOptions(searchIndex, filters),
    [searchIndex, filters],
  );
  const accountOptions = React.useMemo(
    () => reconShareOtherAccountOptions(searchIndex, filters),
    [searchIndex, filters],
  );

  // Purane state me linkStatus missing ho to All default selected dikhe
  const linkStatus = filters.linkStatus ?? "all";
  const hasFilters = !!(
    filters.companyKey ||
    filters.entityKey ||
    filters.accountKey ||
    linkStatus !== "all"
  );

  // Search card — tone cycle ka pehla (green); list cards blue/pink…
  return (
    <div className={cn(reconShareListCardCn, reconShareListCardToneCn(0), "mt-3 shrink-0")}>
      {/* All | Linked | Unlinked — blue pills; All default selected; Clear Unlinked ke right */}
      <div className="flex flex-wrap items-center gap-2">
        {LINK_STATUS_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant="outline"
            aria-pressed={linkStatus === opt.value}
            className={cn(filterPillCn, linkStatus === opt.value && linkStatusPillActiveCn)}
            onClick={() => onFiltersChange({ ...filters, linkStatus: opt.value })}
          >
            {opt.label}
          </Button>
        ))}
        {hasFilters ? (
          <Button
            type="button"
            variant="outline"
            className={filterPillCn}
            onClick={() => onFiltersChange(EMPTY_RECON_SHARE_LIST_FILTERS)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Company</Label>
          <Combobox
            {...comboboxProps}
            options={companyOptions}
            value={filters.companyKey}
            onChange={(v) => {
              onFiltersChange({
                companyKey: v,
                entityKey: "",
                accountKey: "",
                linkStatus: filters.linkStatus,
              });
            }}
            placeholder="Search company…"
            searchPlaceholder="Company name…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Entity</Label>
          <Combobox
            {...comboboxProps}
            options={entityOptions}
            value={filters.entityKey}
            onChange={(v) => {
              onFiltersChange({
                ...filters,
                entityKey: v,
                accountKey: "",
              });
            }}
            placeholder={filters.companyKey ? "Search entity…" : "All entities…"}
            searchPlaceholder="Parties, Bank…"
            disabled={entityOptions.length === 0}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Account (other side)
          </Label>
          <Combobox
            {...comboboxProps}
            options={accountOptions}
            value={filters.accountKey}
            onChange={(v) => {
              const entry = reconShareEntryByAccountKey(searchIndex, v);
              if (entry) {
                onFiltersChange(reconShareFiltersFromAccountEntry(entry, filters));
                return;
              }
              onFiltersChange({ ...filters, accountKey: v });
            }}
            placeholder="Search account no., code…"
            searchPlaceholder="Account name, no., code…"
          />
        </div>
      </div>
      {hasFilters ? (
        <p className="text-[10px] text-muted-foreground">
          Showing {filteredCount} of {totalCount} share(s)
        </p>
      ) : null}
    </div>
  );
}

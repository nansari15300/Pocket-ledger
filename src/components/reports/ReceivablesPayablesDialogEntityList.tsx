"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MasterListRow } from "@/components/ui/master-list-row";
import { masterListRowUnselectedCn } from "@/lib/masterListChrome";
import {
  masterListOrderKey,
  useMasterListDisplayRows,
  useMasterListRowMotion,
} from "@/hooks/useMasterListRowMotion";
import { GROUP_LIST_CHILD_INDENT_CLASS } from "@/lib/groupListExpand";
import type { RpDialogRow, RpDialogSection } from "@/lib/receivablesPayablesDialogUi";
import { DIALOG_DIM_GREEN_BORDER } from "@/lib/dialogShellChrome";

export type RpDialogListMotion = ReturnType<typeof useMasterListRowMotion>;

/** R/P dialog inner boxes — same dim green as popup shell. */
export const RP_DIALOG_DIM_GREEN_BORDER = DIALOG_DIM_GREEN_BORDER;

export function rpDialogListScrollHandlers(motion: RpDialogListMotion) {
  return {
    onScroll: motion.markListScrolling,
    onTouchMove: motion.markListScrolling,
  } as const;
}

type ReceivablesPayablesDialogEntityListProps = {
  sections: RpDialogSection[];
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  isMobile?: boolean;
  listMotion?: RpDialogListMotion;
};

const icCompanyRowProps = { "data-pl-ic-company-row": "" } as const;

function RpDialogEntityRow({
  row,
  side,
  formatAmount,
  isMobile,
  amountClass,
  rowMotionProps,
  displayOrderKey,
  indent = false,
  icAccountRow = false,
}: {
  row: RpDialogRow;
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  isMobile?: boolean;
  amountClass: string;
  rowMotionProps: Record<string, unknown>;
  displayOrderKey: string;
  indent?: boolean;
  /** IC company ke andar wale account — party list jaisa blue pill. */
  icAccountRow?: boolean;
}) {
  return (
    <motion.li
      layoutDependency={displayOrderKey}
      className={cn("min-w-0", indent && GROUP_LIST_CHILD_INDENT_CLASS)}
      {...rowMotionProps}
    >
      <MasterListRow
        className={masterListRowUnselectedCn(false)}
        {...(icAccountRow ? icCompanyRowProps : {})}
      >
        <div className="pl-master-list-row">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            <p className="pl-master-list-row-name" title={isMobile ? row.party : undefined}>
              {row.party}
            </p>
            {row.secondaryLabel ? (
              <p className="text-[11px] font-normal leading-tight text-muted-foreground">{row.secondaryLabel}</p>
            ) : null}
          </div>
          <p
            data-pl-list-balance={side === "receivables" ? "dr" : "cr"}
            className={cn("pl-master-list-row-amount", amountClass)}
          >
            {formatAmount(row.balance, side === "payables")}
          </p>
        </div>
      </MasterListRow>
    </motion.li>
  );
}

function RpIcCompanyExpandChevron({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse IC company accounts" : "Expand IC company accounts"}
      className="mt-0.5 shrink-0 self-start rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} />
    </button>
  );
}

function RpIcCompanyHeaderRow({
  row,
  side,
  formatAmount,
  isMobile,
  amountClass,
  expanded,
  onToggle,
}: {
  row: RpDialogRow;
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  isMobile?: boolean;
  amountClass: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <MasterListRow className={masterListRowUnselectedCn(false)} {...icCompanyRowProps}>
      <div className="pl-master-list-row">
        <div className="flex min-w-0 flex-1 items-start gap-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            <p className="pl-master-list-row-name" title={isMobile ? row.party : undefined}>
              {row.party}
            </p>
            {row.secondaryLabel ? (
              <p className="text-[11px] font-normal leading-tight text-muted-foreground">{row.secondaryLabel}</p>
            ) : null}
          </div>
          <RpIcCompanyExpandChevron expanded={expanded} onToggle={onToggle} />
        </div>
        <p
          data-pl-list-balance={side === "receivables" ? "dr" : "cr"}
          className={cn(
            "pl-master-list-row-amount tabular-nums transition-opacity",
            amountClass,
            expanded && "opacity-40 text-muted-foreground font-normal saturate-50"
          )}
        >
          {formatAmount(row.balance, side === "payables")}
        </p>
      </div>
    </MasterListRow>
  );
}

function RpIcCompanyGroupRow({
  row,
  side,
  formatAmount,
  isMobile,
  amountClass,
  rowMotionProps,
  displayOrderKey,
  animatePresenceMode,
  expanded,
  onToggle,
}: {
  row: RpDialogRow;
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  isMobile?: boolean;
  amountClass: string;
  rowMotionProps: Record<string, unknown>;
  displayOrderKey: string;
  animatePresenceMode: "sync" | "wait" | "popLayout";
  expanded: boolean;
  onToggle: () => void;
}) {
  const children = row.icChildren ?? [];
  const childOrderKey = useMemo(
    () => masterListOrderKey(children.map((child) => child.entityId || child.party)),
    [children]
  );

  const header = (
    <RpIcCompanyHeaderRow
      row={row}
      side={side}
      formatAmount={formatAmount}
      isMobile={isMobile}
      amountClass={amountClass}
      expanded={expanded}
      onToggle={onToggle}
    />
  );

  return (
    <motion.li layoutDependency={displayOrderKey} className="min-w-0 list-none" {...rowMotionProps}>
      {expanded && children.length > 0 ? (
        <div data-pl-ic-company-group="">
          {header}
          <ul className="min-w-0 space-y-[3px]">
            <AnimatePresence mode={animatePresenceMode}>
              {children.map((child) => {
                const childKey = `${row.entityId}-${child.entityId || child.party}`;
                return (
                  <RpDialogEntityRow
                    key={childKey}
                    row={child}
                    side={side}
                    formatAmount={formatAmount}
                    isMobile={isMobile}
                    amountClass={amountClass}
                    rowMotionProps={rowMotionProps}
                    displayOrderKey={childOrderKey}
                    indent
                    icAccountRow
                  />
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      ) : (
        header
      )}
    </motion.li>
  );
}

/** R/P dialog entity rows — masters list jaisa card tone + IC company blue tree. */
export function ReceivablesPayablesDialogEntityList({
  sections,
  side,
  formatAmount,
  isMobile,
  listMotion: listMotionProp,
}: ReceivablesPayablesDialogEntityListProps) {
  const internalMotion = useMasterListRowMotion();
  const listMotion = listMotionProp ?? internalMotion;
  const { animatePresenceMode, rowMotionProps, isRowAnimationEnabled, layoutHoldMs } = listMotion;
  const amountClass = side === "receivables" ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500";
  const [expandedIcCompanyIds, setExpandedIcCompanyIds] = useState<Set<string>>(() => new Set());

  const listOrderKey = useMemo(
    () =>
      masterListOrderKey(
        sections.flatMap((section) =>
          section.rows.flatMap((row) =>
            row.isIcPeerCompanyGroup
              ? [row.entityId, ...(row.icChildren?.map((c) => c.entityId || c.party) ?? [])]
              : [row.entityId || row.party]
          )
        )
      ),
    [sections]
  );
  const { displayRows: displaySections, displayOrderKey } = useMasterListDisplayRows(
    sections,
    listOrderKey,
    { enabled: isRowAnimationEnabled, holdMs: layoutHoldMs }
  );

  const isIcExpanded = (entityId: string) => expandedIcCompanyIds.has(entityId);

  const toggleIcExpanded = (entityId: string) => {
    setExpandedIcCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  return (
    <div
      data-pl-master-list-chrome
      data-pl-rp-dialog=""
      data-theme-list="account-list"
      className="min-w-0 space-y-3 px-0.5 pb-1"
    >
      {displaySections.map((section) =>
        section.rows.length > 0 ? (
          <div
            key={section.kind}
            data-pl-rp-category=""
            className={cn(
              "min-w-0 overflow-hidden rounded-lg border bg-emerald-50/25 shadow-sm dark:bg-emerald-950/10",
              RP_DIALOG_DIM_GREEN_BORDER
            )}
          >
            <div
              data-pl-rp-category-header=""
              className={cn(
                "border-b bg-gradient-to-r from-emerald-600/75 via-emerald-600/70 to-emerald-700/65 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90",
                "border-emerald-400/35 dark:border-emerald-800/40 dark:from-emerald-900/70 dark:via-emerald-900/60 dark:to-emerald-950/55 dark:text-emerald-50/90"
              )}
            >
              {section.label} ({section.rowCount ?? section.rows.length})
            </div>
            <ul className="pl-master-list-ul min-w-0 space-y-[3px] p-1.5">
              <AnimatePresence mode={animatePresenceMode}>
                {section.rows.map((row) => {
                  const rowKey = `${section.kind}-${row.entityId || row.party}`;
                  if (row.isIcPeerCompanyGroup && row.icChildren?.length) {
                    return (
                      <RpIcCompanyGroupRow
                        key={rowKey}
                        row={row}
                        side={side}
                        formatAmount={formatAmount}
                        isMobile={isMobile}
                        amountClass={amountClass}
                        rowMotionProps={rowMotionProps}
                        displayOrderKey={displayOrderKey}
                        animatePresenceMode={animatePresenceMode}
                        expanded={isIcExpanded(row.entityId)}
                        onToggle={() => toggleIcExpanded(row.entityId)}
                      />
                    );
                  }
                  return (
                    <RpDialogEntityRow
                      key={rowKey}
                      row={row}
                      side={side}
                      formatAmount={formatAmount}
                      isMobile={isMobile}
                      amountClass={amountClass}
                      rowMotionProps={rowMotionProps}
                      displayOrderKey={displayOrderKey}
                    />
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        ) : null
      )}
    </div>
  );
}

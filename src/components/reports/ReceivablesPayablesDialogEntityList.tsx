"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { useDate } from "@/hooks/useDate";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { MasterListRow } from "@/components/ui/master-list-row";
import { masterListRowUnselectedCn } from "@/lib/masterListChrome";
import {
  masterListOrderKey,
  useMasterListDisplayRows,
  useMasterListRowMotion,
} from "@/hooks/useMasterListRowMotion";
import { GROUP_LIST_CHILD_INDENT_CLASS } from "@/lib/groupListExpand";
import type { RpDialogRow, RpDialogSection } from "@/lib/receivablesPayablesDialogUi";
import { rpDialogRowSelectionKey } from "@/lib/receivablesPayablesDialogUi";
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

function normalizeRpAmountQuery(q: string): string {
  return q.replace(/[,\s]/g, "").toLowerCase();
}

function rpRowMatchesName(row: RpDialogRow, nameQ: string): boolean {
  if (!nameQ) return false;
  const q = nameQ.toLowerCase();
  if (row.party.toLowerCase().includes(q)) return true;
  if (row.secondaryLabel?.toLowerCase().includes(q)) return true;
  return row.icChildren?.some((child) => rpRowMatchesName(child, nameQ)) ?? false;
}

/** Amount filter — displayed string + digit run (highlight jaisa; false `.661` boundary match nahi). */
function rpRowMatchesAmountText(formatted: string, amountQ: string): boolean {
  if (!amountQ) return false;
  const q = amountQ.trim();
  if (!q) return false;
  if (formatted.toLowerCase().includes(q.toLowerCase())) return true;
  const digitQ = normalizeRpAmountQuery(q);
  if (!digitQ || !/\d/.test(digitQ)) return false;
  const digitsOnly = formatted.replace(/[^\d]/g, "");
  return digitsOnly.includes(digitQ);
}

/** Single search box — name ya amount, jo match ho. */
function rpRowMatchesQuery(
  row: RpDialogRow,
  query: string,
  formatAmountText: (balance: number) => string
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (rpRowMatchesName(row, q)) return true;
  if (rpRowMatchesAmountText(formatAmountText(row.balance), q)) return true;
  return (
    row.icChildren?.some(
      (child) => rpRowMatchesName(child, q) || rpRowMatchesAmountText(formatAmountText(child.balance), q)
    ) ?? false
  );
}

function rpIcGroupParentMatchesDirectly(
  row: RpDialogRow,
  query: string,
  formatAmountText: (balance: number) => string
): boolean {
  const q = query.trim();
  if (!q) return false;
  if (row.party.toLowerCase().includes(q.toLowerCase())) return true;
  if (row.secondaryLabel?.toLowerCase().includes(q.toLowerCase())) return true;
  return rpRowMatchesAmountText(formatAmountText(row.balance), q);
}

function rpIcChildMatchesQuery(
  child: RpDialogRow,
  query: string,
  formatAmountText: (balance: number) => string
): boolean {
  const q = query.trim();
  if (!q) return true;
  return (
    rpRowMatchesName({ ...child, icChildren: undefined }, q) ||
    rpRowMatchesAmountText(formatAmountText(child.balance), q)
  );
}

/** Filter ke baad matching child ho to auto-expand — sirf un accounts dikhane ke liye. */
function rpIcGroupShouldAutoExpandFromFilter(row: RpDialogRow, query: string): boolean {
  if (!query.trim() || !row.isIcPeerCompanyGroup) return false;
  return (row.icChildren?.length ?? 0) > 0;
}

function filterRpDialogRows(
  rows: RpDialogRow[],
  query: string,
  formatAmountText: (balance: number) => string
): RpDialogRow[] {
  const q = query.trim();
  if (!q) return rows;

  return rows.flatMap((row) => {
    if (row.isIcPeerCompanyGroup && row.icChildren?.length) {
      const filteredChildren = row.icChildren.filter((child) => rpIcChildMatchesQuery(child, q, formatAmountText));
      const parentMatches = rpIcGroupParentMatchesDirectly(row, q, formatAmountText);
      if (parentMatches || filteredChildren.length > 0) {
        return [{ ...row, icChildren: filteredChildren }];
      }
      return [];
    }
    if (rpRowMatchesQuery(row, q, formatAmountText)) return [row];
    return [];
  });
}

function countRpDialogLeafRows(rows: RpDialogRow[]): number {
  return rows.reduce((count, row) => {
    if (row.isIcPeerCompanyGroup && row.icChildren?.length) return count + row.icChildren.length;
    return count + 1;
  }, 0);
}

const RP_HIGHLIGHT_MARK_CN =
  "rounded-sm bg-fuchsia-200 px-px text-inherit dark:bg-fuchsia-500/40";

/** Dashboard R/P dialog — same options as `formatRpDialogAmount`. */
function formatRpRowAmountText(
  formatCurrencyForPrint: (amount: number, options?: { noSuffix?: boolean; showDrCr?: boolean; context?: string }) => string,
  balance: number,
  listSide: "receivables" | "payables"
): string {
  const amount = listSide === "payables" ? Math.abs(balance) : balance;
  return formatCurrencyForPrint(amount, {
    noSuffix: true,
    showDrCr: true,
    context: "transaction",
  });
}

function highlightDigitsInFormattedAmount(formatted: string, digitQuery: string): ReactNode {
  const digitsOnly = formatted.replace(/[^\d]/g, "");
  const idx = digitsOnly.indexOf(digitQuery);
  if (idx < 0) return formatted;

  let digitCount = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < formatted.length; i++) {
    if (!/\d/.test(formatted[i])) continue;
    if (digitCount >= idx && digitCount < idx + digitQuery.length) {
      if (start < 0) start = i;
      end = i + 1;
    }
    digitCount++;
  }
  if (start < 0 || end <= start) return formatted;

  return (
    <>
      {formatted.slice(0, start)}
      <mark className={RP_HIGHLIGHT_MARK_CN}>{formatted.slice(start, end)}</mark>
      {formatted.slice(end)}
    </>
  );
}

function renderRpHighlightedText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  return highlightQueryInText(text, q);
}

function renderRpHighlightedAmountText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const literal = highlightQueryInText(text, q);
  if (literal !== text) return literal;
  const digitQ = normalizeRpAmountQuery(q);
  if (!digitQ || !/\d/.test(digitQ)) return text;
  const highlighted = highlightDigitsInFormattedAmount(text, digitQ);
  return highlighted === text ? text : highlighted;
}

type ReceivablesPayablesDialogEntityListProps = {
  sections: RpDialogSection[];
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  isMobile?: boolean;
  listMotion?: RpDialogListMotion;
  selectedKey?: string | null;
  onSelectRow?: (side: "receivables" | "payables", row: RpDialogRow) => void;
  onOpenRow?: (side: "receivables" | "payables", row: RpDialogRow) => void;
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
  selected = false,
  onSelect,
  onOpen,
  highlightQuery = "",
  formatAmountText,
}: {
  row: RpDialogRow;
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  formatAmountText: (balance: number) => string;
  isMobile?: boolean;
  amountClass: string;
  rowMotionProps: Record<string, unknown>;
  displayOrderKey: string;
  indent?: boolean;
  /** IC company ke andar wale account — party list jaisa blue pill. */
  icAccountRow?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onOpen?: () => void;
  highlightQuery?: string;
}) {
  const amountText = formatAmountText(row.balance);
  const amountDisplay = highlightQuery
    ? renderRpHighlightedAmountText(amountText, highlightQuery)
    : formatAmount(row.balance, side === "payables");
  return (
    <motion.li
      layoutDependency={displayOrderKey}
      className={cn("min-w-0", indent && GROUP_LIST_CHILD_INDENT_CLASS)}
      {...rowMotionProps}
    >
      <MasterListRow
        selected={selected}
        className={cn(masterListRowUnselectedCn(selected), "cursor-pointer select-none")}
        {...(icAccountRow ? icCompanyRowProps : {})}
        onClick={onSelect}
        onDoubleClick={onOpen}
      >
        <div className="pl-master-list-row">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            <p className="pl-master-list-row-name" title={isMobile ? row.party : undefined}>
              {renderRpHighlightedText(row.party, highlightQuery)}
            </p>
            {row.secondaryLabel ? (
              <p className="text-[11px] font-normal leading-tight text-muted-foreground">
                {renderRpHighlightedText(row.secondaryLabel, highlightQuery)}
              </p>
            ) : null}
          </div>
          <p
            data-pl-list-balance={side === "receivables" ? "dr" : "cr"}
            className={cn("pl-master-list-row-amount", amountClass)}
          >
            {amountDisplay}
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
  selected = false,
  onSelect,
  highlightQuery = "",
  formatAmountText,
}: {
  row: RpDialogRow;
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  formatAmountText: (balance: number) => string;
  isMobile?: boolean;
  amountClass: string;
  expanded: boolean;
  onToggle: () => void;
  selected?: boolean;
  onSelect?: () => void;
  highlightQuery?: string;
}) {
  const amountText = formatAmountText(row.balance);
  const amountDisplay = highlightQuery
    ? renderRpHighlightedAmountText(amountText, highlightQuery)
    : formatAmount(row.balance, side === "payables");
  return (
    <MasterListRow
      selected={selected}
      className={cn(masterListRowUnselectedCn(selected), "cursor-pointer select-none")}
      {...icCompanyRowProps}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
    >
      <div className="pl-master-list-row">
        <div className="flex min-w-0 flex-1 items-start gap-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            <p className="pl-master-list-row-name" title={isMobile ? row.party : undefined}>
              {renderRpHighlightedText(row.party, highlightQuery)}
            </p>
            {row.secondaryLabel ? (
              <p className="text-[11px] font-normal leading-tight text-muted-foreground">
                {renderRpHighlightedText(row.secondaryLabel, highlightQuery)}
              </p>
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
          {amountDisplay}
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
  selectedKey,
  onSelectRow,
  onOpenRow,
  highlightQuery = "",
  formatAmountText,
}: {
  row: RpDialogRow;
  side: "receivables" | "payables";
  formatAmount: (amount: number, abs?: boolean) => ReactNode;
  formatAmountText: (balance: number) => string;
  isMobile?: boolean;
  amountClass: string;
  rowMotionProps: Record<string, unknown>;
  displayOrderKey: string;
  animatePresenceMode: "sync" | "wait" | "popLayout";
  expanded: boolean;
  onToggle: () => void;
  selectedKey?: string | null;
  onSelectRow?: (side: "receivables" | "payables", row: RpDialogRow) => void;
  onOpenRow?: (side: "receivables" | "payables", row: RpDialogRow) => void;
  highlightQuery?: string;
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
      formatAmountText={formatAmountText}
      isMobile={isMobile}
      amountClass={amountClass}
      expanded={expanded}
      onToggle={onToggle}
      selected={selectedKey === rpDialogRowSelectionKey(side, row)}
      onSelect={() => onSelectRow?.(side, row)}
      highlightQuery={highlightQuery}
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
                    formatAmountText={formatAmountText}
                    isMobile={isMobile}
                    amountClass={amountClass}
                    rowMotionProps={rowMotionProps}
                    displayOrderKey={childOrderKey}
                    indent
                    icAccountRow
                    selected={selectedKey === rpDialogRowSelectionKey(side, child)}
                    onSelect={() => onSelectRow?.(side, child)}
                    onOpen={() => onOpenRow?.(side, child)}
                    highlightQuery={highlightQuery}
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
  selectedKey,
  onSelectRow,
  onOpenRow,
}: ReceivablesPayablesDialogEntityListProps) {
  const internalMotion = useMasterListRowMotion();
  const listMotion = listMotionProp ?? internalMotion;
  const { animatePresenceMode, rowMotionProps, isRowAnimationEnabled, layoutHoldMs } = listMotion;
  const amountClass = side === "receivables" ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500";
  const [expandedIcCompanyIds, setExpandedIcCompanyIds] = useState<Set<string>>(() => new Set());
  const [listFilter, setListFilter] = useState("");
  const { formatCurrencyForPrint } = useDate();
  const formatAmountText = useCallback(
    (balance: number) => formatRpRowAmountText(formatCurrencyForPrint, balance, side),
    [formatCurrencyForPrint, side]
  );

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

  const filteredSections = useMemo(() => {
    if (!listFilter.trim()) return displaySections;
    return displaySections
      .map((section) => {
        const rows = filterRpDialogRows(section.rows, listFilter, formatAmountText);
        return {
          ...section,
          rows,
          rowCount: countRpDialogLeafRows(rows),
        };
      })
      .filter((section) => section.rows.length > 0);
  }, [displaySections, listFilter, formatAmountText]);

  const highlightQuery = listFilter.trim();

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
      {filteredSections.map((section) =>
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
                "flex min-w-0 items-center gap-2 border-b bg-gradient-to-r from-emerald-600/75 via-emerald-600/70 to-emerald-700/65 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90",
                "border-emerald-400/35 dark:border-emerald-800/40 dark:from-emerald-900/70 dark:via-emerald-900/60 dark:to-emerald-950/55 dark:text-emerald-50/90"
              )}
            >
              <span className="shrink-0 whitespace-nowrap">
                {section.label} ({section.rowCount ?? section.rows.length})
              </span>
              <div className="relative min-w-0 flex-1">
                <Input
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  placeholder="Name or amount"
                  className={cn(
                    "h-7 min-w-0 w-full border-white/35 bg-white/95 text-xs font-normal normal-case tracking-normal text-foreground shadow-sm placeholder:text-muted-foreground dark:bg-white/90",
                    listFilter && "pr-8"
                  )}
                  onClick={(e) => e.stopPropagation()}
                />
                {listFilter ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full text-muted-foreground hover:bg-white/80 hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setListFilter("");
                    }}
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
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
                        expanded={
                          isIcExpanded(row.entityId) ||
                          rpIcGroupShouldAutoExpandFromFilter(row, highlightQuery)
                        }
                        onToggle={() => toggleIcExpanded(row.entityId)}
                        selectedKey={selectedKey}
                        onSelectRow={onSelectRow}
                        onOpenRow={onOpenRow}
                        highlightQuery={highlightQuery}
                        formatAmountText={formatAmountText}
                      />
                    );
                  }
                  return (
                    <RpDialogEntityRow
                      key={rowKey}
                      row={row}
                      side={side}
                      formatAmount={formatAmount}
                      formatAmountText={formatAmountText}
                      isMobile={isMobile}
                      amountClass={amountClass}
                      rowMotionProps={rowMotionProps}
                      displayOrderKey={displayOrderKey}
                      selected={selectedKey === rpDialogRowSelectionKey(side, row)}
                      onSelect={() => onSelectRow?.(side, row)}
                      onOpen={() => onOpenRow?.(side, row)}
                      highlightQuery={highlightQuery}
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

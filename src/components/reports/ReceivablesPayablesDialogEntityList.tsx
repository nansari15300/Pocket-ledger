"use client";

import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MasterListRow } from "@/components/ui/master-list-row";
import { masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import type { RpDialogSection } from "@/lib/receivablesPayablesDialogUi";

export type RpDialogListMotion = ReturnType<typeof useMasterListRowMotion>;

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
  /** Parent scroll container se share — AccountList jaisa scroll par layout pause. */
  listMotion?: RpDialogListMotion;
};

/** R/P dialog entity rows — masters list jaisa card tone + row/number animation. */
export function ReceivablesPayablesDialogEntityList({
  sections,
  side,
  formatAmount,
  isMobile,
  listMotion: listMotionProp,
}: ReceivablesPayablesDialogEntityListProps) {
  const internalMotion = useMasterListRowMotion();
  const { animatePresenceMode, rowMotionProps } = listMotionProp ?? internalMotion;
  const amountClass = side === "receivables" ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500";

  return (
    <div
      data-pl-master-list-chrome
      data-theme-list="account-list"
      className="min-w-0 space-y-3 px-0.5 pb-1"
    >
      {sections.map((section) =>
        section.rows.length > 0 ? (
          <div
            key={section.kind}
            data-pl-rp-category=""
            className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-muted/10 shadow-sm dark:bg-muted/5"
          >
            <div
              data-pl-rp-category-header=""
              className="border-b border-sky-400/30 bg-gradient-to-r from-sky-500/70 via-sky-600/65 to-sky-600/60 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90 dark:border-sky-700/35 dark:from-sky-800/65 dark:via-sky-900/50 dark:to-sky-900/45 dark:text-sky-100/85"
            >
              {section.label} ({section.rows.length})
            </div>
            <ul className="pl-master-list-ul min-w-0 space-y-[3px] p-1.5">
              <AnimatePresence mode={animatePresenceMode}>
                {section.rows.map((row) => {
                  const rowKey = `${section.kind}-${row.entityId || row.party}`;
                  return (
                    <motion.li key={rowKey} className="min-w-0" {...rowMotionProps}>
                      <MasterListRow className={masterListRowUnselectedCn(false)}>
                        <div className="pl-master-list-row">
                          <p
                            className="pl-master-list-row-name"
                            title={isMobile ? row.party : undefined}
                          >
                            {row.party}
                          </p>
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
                })}
              </AnimatePresence>
            </ul>
          </div>
        ) : null
      )}
    </div>
  );
}

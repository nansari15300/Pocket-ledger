"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { masterListOrderKey, useMasterListDisplayRows } from "@/hooks/useMasterListRowMotion";
import { cn } from "@/lib/utils";

type GroupListTreeNodeMotionListProps<T> = {
  items: readonly T[];
  quickFilter: EntityListQuickFilter;
  animatePresenceMode: "sync" | "wait" | "popLayout";
  rowMotionProps: Record<string, unknown>;
  isRowAnimationEnabled: boolean;
  layoutHoldMs: number;
  getItemKey: (item: T, index: number) => string;
  getItemId: (item: T) => string | undefined;
  getItemClassName?: (item: T, index: number) => string | undefined;
  renderItem: (item: T, index: number) => React.ReactNode;
};

/** Sibling group rows inside one card — same FLIP/sort animation as nested account rows. */
export function GroupListTreeNodeMotionList<T>({
  items,
  quickFilter,
  animatePresenceMode,
  rowMotionProps,
  isRowAnimationEnabled,
  layoutHoldMs,
  getItemKey,
  getItemId,
  getItemClassName,
  renderItem,
}: GroupListTreeNodeMotionListProps<T>) {
  const listOrderKey = useMemo(
    () => `${quickFilter}|${masterListOrderKey(items.map((item) => getItemId(item)))}`,
    [items, quickFilter, getItemId]
  );

  const { displayRows, displayOrderKey } = useMasterListDisplayRows(items as T[], listOrderKey, {
    enabled: isRowAnimationEnabled,
    holdMs: layoutHoldMs,
  });

  return (
    <AnimatePresence mode={animatePresenceMode}>
      {displayRows.map((item, index) => (
        <motion.li
          key={getItemKey(item, index)}
          layoutDependency={displayOrderKey}
          className={cn(getItemClassName?.(item, index))}
          {...rowMotionProps}
        >
          {renderItem(item, index)}
        </motion.li>
      ))}
    </AnimatePresence>
  );
}

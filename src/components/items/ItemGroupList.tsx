
"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { ItemGroup } from "@/components/items/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { masterListOrderKey, useMasterListDisplayRows, useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo, useState } from "react";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortEntityGroups } from "@/lib/entityGroupListQuickFilter";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import AnimatedNumber from "../ui/AnimatedNumber";
import { isSystemParentGroup } from "@/lib/system-groups"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerStrongCn } from "@/lib/listSelectionChrome";

export function ItemGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
}: {
  groups: ItemGroup[];
  searchTerm: string;
  selectedGroup: ItemGroup | null;
  onSelectGroup: (group: ItemGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (group: ItemGroup) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } = useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;

  const filteredAndSortedGroups = useMemo(() => {
    const base = (groups || []).filter((group) => {
      const isReportOnly = (group as any).isReportOnly === true;
      const isSystemParent =
        (group as any).isSystemReserved === true ||
        isSystemParentGroup("item_groups", (group as any).id);
      if (isReportOnly || isSystemParent) return false;
      return !!group.name;
    });
    let list = filterAndSortEntityGroups(base, searchTerm, quickFilter);
    if (quickFilter === "default") {
      list = [...list].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    }
    return list;
  }, [groups, searchTerm, quickFilter]);

  const listOrderKey = useMemo(
    () => masterListOrderKey(filteredAndSortedGroups.map((g) => g.id)),
    [filteredAndSortedGroups]
  );

  const { displayRows: displayListRows, displayOrderKey } = useMasterListDisplayRows(
    filteredAndSortedGroups,
    listOrderKey,
    { enabled: isRowAnimationEnabled, holdMs: layoutHoldMs }
  );

  return (
    <div className={masterListShellCn}>
      <ScrollArea
        listChrome
        className="min-h-0 min-w-0 flex-1"
        onViewportScroll={markListScrolling}
        onViewportTouchMove={markListScrolling}
      >
        <ul className="pl-master-list-ul">
          <AnimatePresence mode={animatePresenceMode}>
            {displayListRows.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              const href = getItemHref?.(group);
              const cardClassName = masterListRowUnselectedCn(isSelected);
              const cardContent = (
                    <div className="pl-master-list-row">
                      <div className="pl-master-list-row-leading">
                        <div className="relative flex-shrink-0">
                          <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-lg text-muted-foreground">
                            <Users className="h-5 w-5" />
                          </div>
                          {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                            <span
                              className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                              style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                              aria-label={`${pendingApprovalByGroupId[group.id]} pending approval`}
                            >
                              <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByGroupId[group.id]}</span>
                            </span>
                          )}
                        </div>
                        <Tooltip>
                          {/* asChild hata — motion layout + span ref merge par Radix/ScrollArea setRef loop */}
                          <TooltipTrigger
                            type="button"
                            data-pl-list-name=""
                            onPointerDown={(e) => e.stopPropagation()}
                            className={masterListNameTriggerStrongCn}
                          >
                            {group.name}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{group.name}</p>
                            {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">{pendingApprovalByGroupId[group.id]} pending approval</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div
                        className={cn(
                          "pl-master-list-row-amount font-semibold ml-2",
                          group.balance >= 0 ? "text-green-600" : "text-red-600",
                          isSelected &&
                            (group.balance >= 0
                              ? "text-green-800"
                              : "text-red-800")
                        )}
                      >
                         {/* ✅ FIX: Render formatCurrency directly instead of via AnimatedNumber */}
                        {formatCurrency(group.balance, { showDrCr: true })}
                    </div>
                  </div>
              );
              return (
                <motion.li key={group.id} layoutDependency={displayOrderKey} {...rowMotionProps}>
                  {href ? (
                    // Master list navigation: per-row auto-prefetch off rakho to avoid repeat background bursts on revisit.
                    <Link prefetch={false} href={href} className="block min-w-0 max-w-full overflow-hidden">
                      <MasterListRow selected={isSelected} className={cardClassName}>{cardContent}</MasterListRow>
                    </Link>
                  ) : (
                    <MasterListRow selected={isSelected} className={cardClassName} onClick={() => onSelectGroup(group)}>
                      {cardContent}
                    </MasterListRow>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
          {displayListRows.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No groups found.
            </div>
          )}
        </ul>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
    </div>
  );
}

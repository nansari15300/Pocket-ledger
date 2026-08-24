
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Users, Lock } from "lucide-react";
import type { ExpenseGroup, ExpenseAccount } from "@/components/expenses/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { masterListOrderKey, useMasterListDisplayRows, useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { TooltipProvider } from "../ui/tooltip";
import { useMemo, useState } from "react";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortEntityGroups } from "@/lib/entityGroupListQuickFilter";
import { motion } from "framer-motion";
import { isSystemParentGroup } from "@/lib/system-groups";
import { masterListShellCn } from "@/lib/masterListChrome";
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import { MasterGroupExpandableListBody } from "@/components/entity/MasterGroupExpandableListBody";
import { MasterListGroupIcon } from "@/components/entity/MasterListGroupIcon";

export function ExpenseGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  collapsible = true,
  disabled = false,
  pendingApprovalByGroupId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
  groupMembersByGroupId = {},
  selectedGroupMemberFilterId = null,
  pendingApprovalByMemberId = {},
}: {
  groups: ExpenseGroup[];
  searchTerm: string;
  selectedGroup: ExpenseGroup | null;
  onSelectGroup: (group: ExpenseGroup, options?: GroupListSelectOptions) => void;
  collapsible?: boolean;
  disabled?: boolean;
  pendingApprovalByGroupId?: Record<string, number>;
  getItemHref?: (group: ExpenseGroup) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
  groupMembersByGroupId?: Record<string, ExpenseAccount[]>;
  selectedGroupMemberFilterId?: string | null;
  pendingApprovalByMemberId?: Record<string, number>;
}) {
  void collapsible;
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling, isRowAnimationEnabled, layoutHoldMs } =
    useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const quickFilterFooter = !hideQuickFilterBar ? (
    <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
  ) : null;

  const filteredAndSortedGroups = useMemo(() => {
    const base = (groups || []).filter((group) => {
      const isReportOnly = (group as any).isReportOnly === true;
      const isSystem =
        (group as any).isSystemReserved === true ||
        isSystemParentGroup("expense_groups", (group as any).id);
      if (isReportOnly || isSystem) return false;
      return !!group.name;
    });
    let list = filterAndSortEntityGroups(base, searchTerm, quickFilter);
    if (quickFilter === "default") {
      list = [...list].sort((a, b) => {
        const aIsSystem = (a as any).isSystemReserved;
        const bIsSystem = (b as any).isSystemReserved;
        if (aIsSystem && !bIsSystem) return -1;
        if (!aIsSystem && bIsSystem) return 1;
        return Math.abs((b as any).balance || 0) - Math.abs((a as any).balance || 0);
      });
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

  const renderLeading = (isSystem: boolean) => (
    <MasterListGroupIcon>
      {isSystem ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
    </MasterListGroupIcon>
  );

  if (displayListRows.length === 0) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className={cn(masterListShellCn, disabled && "pointer-events-none opacity-60")}>
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            No groups found.
          </div>
          {quickFilterFooter}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div className={cn(masterListShellCn, disabled && "pointer-events-none opacity-60")}>
        <ScrollArea
          listChrome
          className="min-h-0 min-w-0 w-full flex-1"
          onViewportScroll={markListScrolling}
          onViewportTouchMove={markListScrolling}
        >
          <ul className="pl-master-list-ul w-full">
            <MasterGroupExpandableListBody
              displayListRows={displayListRows}
              displayOrderKey={displayOrderKey}
              selectedGroup={selectedGroup}
              selectedGroupMemberFilterId={selectedGroupMemberFilterId}
              groupMembersByGroupId={groupMembersByGroupId}
              onSelectGroup={onSelectGroup}
              pendingApprovalByGroupId={pendingApprovalByGroupId}
              pendingApprovalByMemberId={pendingApprovalByMemberId}
              getItemHref={getItemHref}
              quickFilter={quickFilter}
              animatePresenceMode={animatePresenceMode}
              rowMotionProps={rowMotionProps}
              isRowAnimationEnabled={isRowAnimationEnabled}
              layoutHoldMs={layoutHoldMs}
              expandAriaLabel="accounts"
              formatCurrency={(amount, options) =>
                formatCurrency(amount, { ...options, noAnimation: true }) as React.ReactNode
              }
              renderGroupLeading={(group) => renderLeading(Boolean((group as any).isSystemReserved))}
            />
          </ul>
        </ScrollArea>
        {quickFilterFooter}
      </motion.div>
    </TooltipProvider>
  );
}


"use client";

import { cn } from "@/lib/utils";
import { Users, Lock } from "lucide-react";
import type { ExpenseGroup } from "@/components/expenses/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo, useState } from "react";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortEntityGroups } from "@/lib/entityGroupListQuickFilter";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { isSystemParentGroup } from "@/lib/system-groups"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerStrongCn } from "@/lib/listSelectionChrome";

export function ExpenseGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  collapsible = true,
  disabled = false,
  pendingApprovalByGroupId = {},
  getItemHref,
}: {
  groups: ExpenseGroup[];
  searchTerm: string;
  selectedGroup: ExpenseGroup | null;
  onSelectGroup: (group: ExpenseGroup) => void;
  /** When false (e.g. incomes page), list is always expanded. When true, expand/collapse is shown. */
  collapsible?: boolean;
  disabled?: boolean;
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (group: ExpenseGroup) => string | undefined;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
  const [quickFilter, setQuickFilter] = useState<EntityListQuickFilter>("default");

  // System groups sirf Reports me – list pages pe hide (Direct Income, Direct Expenses etc. bhi)
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

  if (filteredAndSortedGroups.length === 0) {
    return (
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(masterListShellCn, disabled && "pointer-events-none opacity-60")}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            No groups found.
          </div>
          <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
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
            <AnimatePresence mode={animatePresenceMode}>
              {filteredAndSortedGroups.map((group) => {
                const isSelected = selectedGroup?.id === group.id;
                const isSystem = (group as any).isSystemReserved;
                const href = getItemHref?.(group);
                const cardClassName = masterListRowUnselectedCn(isSelected);
                const cardContent = (
                      <div className="pl-master-list-row">
                        <div className="pl-master-list-row-leading">
                          <div className="relative flex-shrink-0">
                            <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                              {isSystem ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
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
                            {/* asChild hata — Radix ref + motion layout par setRef loop */}
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
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className={cn(
                              "pl-master-list-row-amount-xs ml-1 rounded border-0 bg-transparent px-1 text-left shadow-none",
                              group.balance >= 0 ? "text-green-600" : "text-red-600"
                            )}
                          >
                            {formatCurrency(group.balance, {
                              showDrCr: true,
                              noAnimation: true,
                            })}
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="font-medium">{formatCurrency(group.balance, { showDrCr: true })}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                );
                return (
                  <motion.li key={group.id} className="w-full" {...rowMotionProps}>
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
          </ul>
        </ScrollArea>
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      </motion.div>
    </TooltipProvider>
  );
}

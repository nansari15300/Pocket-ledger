
"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { StaffGroup } from "@/components/staff/types";
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
import { isSystemParentGroup } from "@/lib/system-groups";
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerStrongCn } from "@/lib/listSelectionChrome";

export function StaffGroupList({
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
  groups: StaffGroup[];
  searchTerm: string;
  selectedGroup: StaffGroup | null;
  onSelectGroup: (group: StaffGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (group: StaffGroup) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;

  const filteredAndSortedGroups = useMemo(() => {
    const base = groups.filter((group) => {
      const isReportOnly = (group as any).isReportOnly === true;
      const isSystemParent =
        (group as any).isSystemReserved === true ||
        isSystemParentGroup("staff_groups", (group as any).id);
      if (isReportOnly || isSystemParent) return false;
      return !!group.name;
    });
    return filterAndSortEntityGroups(base, searchTerm, quickFilter);
  }, [groups, searchTerm, quickFilter]);

  return (
    <TooltipProvider delayDuration={200}>
    <motion.div className={masterListShellCn}>
      <ScrollArea
        listChrome
        className="min-h-0 min-w-0 flex-1"
        onViewportScroll={markListScrolling}
        onViewportTouchMove={markListScrolling}
      >
        <ul className="pl-master-list-ul">
          <AnimatePresence mode={animatePresenceMode}>
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              const href = getItemHref?.(group);
              const cardClassName = masterListRowUnselectedCn(isSelected);
              const cardContent = (
                      <div className="pl-master-list-row">
                        <div className="pl-master-list-row-leading">
                          <div className="relative flex-shrink-0">
                            <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
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
                            {/* asChild hata — motion layout + span ref merge par Radix setRef loop */}
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
                          {/* asChild hata — amount cell par ref loop avoid */}
                          <TooltipTrigger
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className={cn(
                              "pl-master-list-row-amount-xs ml-1 rounded border-0 bg-transparent px-1 text-left shadow-none",
                              group.balance >= 0 ? "text-green-600" : "text-red-600"
                            )}
                          >
                            {formatCurrency(group.balance, { showDrCr: true })}
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="font-medium">{formatCurrency(group.balance, { showDrCr: true })}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
              );
              return (
                <motion.li key={group.id} {...rowMotionProps}>
                    {href ? (
                    // Master list navigation: per-row auto-prefetch off rakho to avoid repeat background bursts on revisit.
                    <Link
                      prefetch={false}
                      href={href}
                      onClick={() => onSelectGroup(group)}
                      className="block min-w-0 max-w-full overflow-hidden"
                    >
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
          {filteredAndSortedGroups.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No staff groups found.
            </div>
          )}
        </ul>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
    </motion.div>
    </TooltipProvider>
  );
}

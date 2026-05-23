
"use client";

import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { Users, Crown } from "lucide-react";
import type { AccountGroup } from "@/components/bank-cash/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import AnimatedNumber from "../ui/AnimatedNumber";
import { useMemo, useState } from "react";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { filterAndSortEntityGroups } from "@/lib/entityGroupListQuickFilter";
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';
import { isSystemParentGroup } from "@/lib/system-groups"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerStrongCn } from "@/lib/listSelectionChrome";

export function AccountGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
  getItemHref,
}: {
  groups: AccountGroup[];
  searchTerm: string;
  selectedGroup: AccountGroup | null;
  onSelectGroup: (group: AccountGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – static export ke liye query params */
  getItemHref?: (group: AccountGroup) => string | undefined;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;
  const [quickFilter, setQuickFilter] = useState<EntityListQuickFilter>("default");

  const filteredAndSortedGroups = useMemo(() => {
    const base = groups.filter((group) => {
      const isReportOnly = (group as any).isReportOnly === true;
      const isSystemParent =
        (group as any).isSystemReserved === true ||
        isSystemParentGroup("account_groups", (group as any).id);
      if (isReportOnly || isSystemParent) return false;
      return !!group.name;
    });
    return filterAndSortEntityGroups(base, searchTerm, quickFilter);
  }, [groups, searchTerm, quickFilter]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className={masterListShellCn}>
      <ScrollArea listChrome className="min-h-0 min-w-0 flex-1">
        <ul className="pl-master-list-ul">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              const hasSpecial = (group as any).hasSpecial;
              const isBalanceMasked = typeof group.balance !== 'number';
              const href = getItemHref?.(group);
              const cardClassName = masterListRowUnselectedCn(isSelected);
              const cardContent = (
                    <div className="pl-master-list-row">
                      <div className="pl-master-list-row-leading">
                        <div className="relative flex-shrink-0">
                          <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                             {hasSpecial ? <Crown className="h-5 w-5 text-amber-500" /> : <Users className="h-5 w-5" />}
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
                          {/* asChild hata — Framer layout + span ref = setRef infinite loop */}
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
                      {/* `<p>` — amount par TooltipTrigger button theme/button CSS se red tint avoid (PartyGroupList jaisa) */}
                      <p
                        data-pl-list-balance={
                          isBalanceMasked
                            ? undefined
                            : typeof group.balance === "number" && group.balance >= 0
                              ? "dr"
                              : "cr"
                        }
                        className={cn(
                          "pl-master-list-row-amount-xs ml-1",
                          !isBalanceMasked && masterDetailBalanceToneClass(group.balance)
                        )}
                      >
                        {isBalanceMasked ? "*****" : formatCurrency(group.balance, { showDrCr: true })}
                      </p>
                    </div>
              );
              return (
                <motion.li
                  key={group.id}
                  layout
                  initial={false}
                  exit={{ transition: { duration: 0 } }}
                  transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                >
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
          {filteredAndSortedGroups.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No groups found.
            </div>
          )}
        </ul>
      </ScrollArea>
      <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
    </div>
    </TooltipProvider>
  );
}

    
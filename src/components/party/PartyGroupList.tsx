
"use client";

import { cn } from "@/lib/utils";
import { Users, Lock, Building2, CreditCard, Receipt, Package, FileText, ChevronRight, ChevronDown } from "lucide-react";
import type { Group } from "@/components/party/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
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
import { masterListShellCn, masterListRowUnselectedCn, masterListScrollBodyCn, masterListCategoryLabelCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { getAllSystemGroupNames } from "@/lib/system-group-names";

type GroupWithType = Group & { groupType?: 'party' | 'tax' | 'staff' | 'account' | 'expense' | 'item' };

interface CategorySection {
  name: string;
  icon: React.ReactNode;
  groups: GroupWithType[];
}

export function PartyGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  collapsible = true,
  pendingApprovalByGroupId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
  /** Mobile party page: category headers footer me — scroll me sirf cards */
  hideCategoryHeaders = false,
}: {
  groups: Group[];
  searchTerm: string;
  selectedGroup: Group | null;
  onSelectGroup: (group: Group) => void;
  /** When false (e.g. party page), categories are always expanded with no chevron. When true (e.g. report), expand/collapse is shown. */
  collapsible?: boolean;
  /** Pending approval count per group id (only passed when approve notifications on list). */
  pendingApprovalByGroupId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) – ensures details page opens reliably */
  getItemHref?: (group: Group) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
  hideCategoryHeaders?: boolean;
}) {
  const { formatCurrency } = useDate();
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['party group']));
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;

  const categories: CategorySection[] = useMemo(() => {
    const sortedFlat = filterAndSortEntityGroups(groups || [], searchTerm, quickFilter);

    const partyGroups: GroupWithType[] = [];
    const taxGroups: GroupWithType[] = [];
    const staffGroups: GroupWithType[] = [];
    const accountGroups: GroupWithType[] = [];
    const expenseGroups: GroupWithType[] = [];
    const itemGroups: GroupWithType[] = [];

    sortedFlat.forEach((group) => {
      const groupType = (group as GroupWithType).groupType || "party";
      switch (groupType) {
        case "tax":
          taxGroups.push(group as GroupWithType);
          break;
        case "staff":
          staffGroups.push(group as GroupWithType);
          break;
        case "account":
          accountGroups.push(group as GroupWithType);
          break;
        case "expense":
          expenseGroups.push(group as GroupWithType);
          break;
        case "item":
          itemGroups.push(group as GroupWithType);
          break;
        default:
          partyGroups.push(group as GroupWithType);
      }
    });

    return [
      { name: "Party group", icon: <Users className="h-4 w-4" />, groups: partyGroups },
      { name: "Tax", icon: <Receipt className="h-4 w-4" />, groups: taxGroups },
      { name: "Staff", icon: <Building2 className="h-4 w-4" />, groups: staffGroups },
      { name: "Bank & Cash", icon: <CreditCard className="h-4 w-4" />, groups: accountGroups },
      { name: "Income & Expense", icon: <FileText className="h-4 w-4" />, groups: expenseGroups },
      { name: "Item", icon: <Package className="h-4 w-4" />, groups: itemGroups },
    ].filter((cat) => cat.groups.length > 0);
  }, [groups, searchTerm, quickFilter]);

  const toggleCategory = (categoryName: string) => {
    const key = categoryName.toLowerCase();
    setExpandedCategories(prev => {
      if (prev.has(key)) {
        const next = new Set(prev);
        next.delete(key);
        return next;
      }
      return new Set([key]);
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className={masterListShellCn} data-theme-list="account-list" data-pl-party-group-list="">
        <ScrollArea
          listChrome
          className="min-h-0 min-w-0 w-full flex-1"
          onViewportScroll={markListScrolling}
          onViewportTouchMove={markListScrolling}
        >
          <div className={masterListScrollBodyCn}>
          {categories.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No groups found.</div>
          ) : null}
          {categories.map((category) => {
              const categoryKey = category.name.toLowerCase();
              const isExpanded = collapsible ? expandedCategories.has(categoryKey) : true;
              const hasGroups = category.groups.length > 0;
              
              return (
                <div key={categoryKey}>
                  {!hideCategoryHeaders ? (
                  <div
                    className={cn(
                      masterListCategoryLabelCn,
                      collapsible && "cursor-pointer hover:bg-muted/50 rounded-none"
                    )}
                    onClick={() => collapsible && toggleCategory(categoryKey)}
                  >
                    {collapsible ? (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )
                    ) : null}
                    <div className="h-4 w-4 flex items-center justify-center text-muted-foreground shrink-0">
                      {category.icon}
                    </div>
                    <span>{category.name} ({category.groups.length})</span>
                  </div>
                  ) : null}

                  {/* Groups under category - full width like party list */}
                  {(hideCategoryHeaders || isExpanded) && hasGroups && (
                    <ul className="pl-master-list-ul w-full">
                      <AnimatePresence mode={animatePresenceMode}>
                      {category.groups.map((group) => {
                        const isSelected = selectedGroup?.id === group.id;
                        const isSystem = (group as any).isSystemReserved;
                        return (
                          <motion.li key={group.id} className="w-full" {...rowMotionProps}>
                            {(() => {
                              const href = getItemHref?.(group);
                              const cardClassName = masterListRowUnselectedCn(isSelected);
                              const cardContent = (
                              <div className="pl-master-list-row">
                                <div className="pl-master-list-row-leading">
                                  {/* PartyList jaisa: badge icon ke top-right corner pe, naam ke beech me nahi */}
                                  <div className="relative flex-shrink-0">
                                    <div className="h-8 w-8 flex items-center justify-center rounded-md border bg-muted text-muted-foreground">
                                      {isSystem ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                                    </div>
                                    {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                                      <span
                                        className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center bg-pink-500 text-[10px] font-bold text-white origin-center"
                                        style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                                        aria-label={`${pendingApprovalByGroupId[group.id]} pending approval`}
                                      >
                                        <span style={{ transform: "rotate(-45deg)" }}>
                                          {pendingApprovalByGroupId[group.id]}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                  <Tooltip>
                                    {/* asChild hata — motion layout + span ref merge par Radix setRef loop (party groups tab) */}
                                    <TooltipTrigger
                                      type="button"
                                      data-pl-list-name=""
                                      onPointerDown={(e) => e.stopPropagation()}
                                      className={cn(masterListNameTriggerCn, "min-w-0 flex-1 text-sm font-semibold")}
                                    >
                                      {group.name}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{group.name}</p>
                                      {(pendingApprovalByGroupId[group.id] ?? 0) > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                          {pendingApprovalByGroupId[group.id]} pending approval
                                        </p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <p
                                  className={cn(
                                    "pl-master-list-row-amount-xs ml-1 rounded px-1",
                                    group.balance >= 0 ? "text-green-600" : "text-red-600"
                                  )}
                                >
                                  {formatCurrency(group.balance, { showDrCr: true })}
                                </p>
                              </div>
                              );
                              return href ? (
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
                              );
                            })()}
                          </motion.li>
                        );
                      })}
                      </AnimatePresence>
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
      </div>
    </TooltipProvider>
  );
}

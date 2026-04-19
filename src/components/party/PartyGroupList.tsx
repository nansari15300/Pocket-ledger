
"use client";

import { cn } from "@/lib/utils";
import { Users, Lock, Building2, CreditCard, Receipt, Package, FileText, ChevronRight, ChevronDown } from "lucide-react";
import type { Group } from "@/components/party/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import AnimatedNumber from "../ui/AnimatedNumber";
import { isSystemParentGroup } from "@/lib/system-groups";
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
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings.rows.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['party group']));
  
  const categories: CategorySection[] = useMemo(() => {
    // Groups are already filtered in page.tsx, so we only need to apply search filter here
    const filteredGroups = (groups || []).filter((group) => {
      if (!group || !group.name) return false;
      
      // Only apply search filter - groups are already filtered for system groups in page.tsx
      if (!searchTerm) return true;
      return group.name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const partyGroups: GroupWithType[] = [];
    const taxGroups: GroupWithType[] = [];
    const staffGroups: GroupWithType[] = [];
    const accountGroups: GroupWithType[] = [];
    const expenseGroups: GroupWithType[] = [];
    const itemGroups: GroupWithType[] = [];

    filteredGroups.forEach(group => {
      const groupType = (group as GroupWithType).groupType || 'party';
      switch (groupType) {
        case 'tax':
          taxGroups.push(group as GroupWithType);
          break;
        case 'staff':
          staffGroups.push(group as GroupWithType);
          break;
        case 'account':
          accountGroups.push(group as GroupWithType);
          break;
        case 'expense':
          expenseGroups.push(group as GroupWithType);
          break;
        case 'item':
          itemGroups.push(group as GroupWithType);
          break;
        default:
          partyGroups.push(group as GroupWithType);
      }
    });

    // Sort groups within each category
    const sortGroups = (gs: GroupWithType[]) => {
      return gs.sort((a, b) => {
        const aIsSystem = (a as any).isSystemReserved;
        const bIsSystem = (b as any).isSystemReserved;
        if (aIsSystem && !bIsSystem) return -1;
        if (!aIsSystem && bIsSystem) return 1;
        return Math.abs(b.balance) - Math.abs(a.balance);
      });
    };

    return [
      { name: 'Party group', icon: <Users className="h-4 w-4" />, groups: sortGroups(partyGroups) },
      { name: 'Tax', icon: <Receipt className="h-4 w-4" />, groups: sortGroups(taxGroups) },
      { name: 'Staff', icon: <Building2 className="h-4 w-4" />, groups: sortGroups(staffGroups) },
      { name: 'Bank & Cash', icon: <CreditCard className="h-4 w-4" />, groups: sortGroups(accountGroups) },
      { name: 'Income & Expense', icon: <FileText className="h-4 w-4" />, groups: sortGroups(expenseGroups) },
      { name: 'Item', icon: <Package className="h-4 w-4" />, groups: sortGroups(itemGroups) },
    ].filter(cat => cat.groups.length > 0);
  }, [groups, searchTerm]);

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

  if (categories.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-background rounded-b-lg border-t-0 w-full">
        No groups found.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 min-w-0 w-full flex-col rounded-b-lg border-t-0 bg-background">
        <ScrollArea className="min-h-0 min-w-0 w-full flex-1">
          <div className="px-3 pt-0 pb-2 space-y-2 w-full">
          <AnimatePresence mode="popLayout">
            {categories.map((category) => {
              const categoryKey = category.name.toLowerCase();
              const isExpanded = collapsible ? expandedCategories.has(categoryKey) : true;
              const hasGroups = category.groups.length > 0;
              
              return (
                <motion.div
                  key={categoryKey}
                  layout
                  initial={false}
                  exit={{ transition: { duration: 0 } }}
                  transition={{ 
                    duration: rowAnimationDuration,
                    ease: "easeInOut"
                  }}
                >
                  {/* Category Header - same padding/height as party list section (Party (x)) */}
                  <div
                    className={cn(
                      "px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground",
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

                  {/* Groups under category - full width like party list */}
                  {isExpanded && hasGroups && (
                    <ul className="mt-1 space-y-1 w-full">
                      {category.groups.map((group) => {
                        const isSelected = selectedGroup?.id === group.id;
                        const isSystem = (group as any).isSystemReserved;
                        return (
                          <motion.li
                            key={group.id}
                            className="w-full"
                            layout
                            initial={false}
                            exit={{ transition: { duration: 0 } }}
                            transition={{ 
                              duration: rowAnimationDuration,
                              ease: "easeInOut"
                            }}
                          >
                            {(() => {
                              const href = getItemHref?.(group);
                              const cardClassName = cn(
                                "w-full min-w-0 max-w-full overflow-hidden p-1.5 cursor-pointer border rounded-lg transition-colors duration-200",
                                isSelected
                                  ? "border-primary bg-secondary shadow-sm"
                                  : "border-gray-300 dark:border-gray-600 hover:border-primary/40 bg-card hover:bg-muted/30"
                              );
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
                                    <TooltipTrigger asChild>
                                      <span className="pl-master-list-row-name min-w-0 flex-1 cursor-default truncate text-left text-sm font-semibold">
                                        {group.name}
                                      </span>
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
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p
                                      className={cn(
                                        "pl-master-list-row-amount-xs ml-1 rounded px-1",
                                        group.balance >= 0 ? "text-green-600" : "text-red-600"
                                      )}
                                    >
                                      {formatCurrency(group.balance, { showDrCr: true })}
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p className="font-medium">{formatCurrency(group.balance, { showDrCr: true })}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              );
                              return href ? (
                                <Link href={href} className="block min-w-0 max-w-full overflow-hidden">
                                  <Card className={cardClassName}>{cardContent}</Card>
                                </Link>
                              ) : (
                                <Card className={cardClassName} onClick={() => onSelectGroup(group)}>
                                  {cardContent}
                                </Card>
                              );
                            })()}
                          </motion.li>
                        );
                      })}
                    </ul>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

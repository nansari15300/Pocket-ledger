
"use client";

import { cn } from "@/lib/utils";
import { Users, Lock } from "lucide-react";
import type { ExpenseGroup } from "@/components/expenses/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { isSystemParentGroup } from "@/lib/system-groups";

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
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings.rows.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;

  // System groups sirf Reports me – list pages pe hide (Direct Income, Direct Expenses etc. bhi)
  const filteredAndSortedGroups = useMemo(() => {
    return (groups || [])
      .filter((group) => {
        const isReportOnly = (group as any).isReportOnly === true;
        const isSystem = (group as any).isSystemReserved === true || isSystemParentGroup("expense_groups", (group as any).id);
        if (isReportOnly || isSystem) return false;
        if (!searchTerm) return true;
        return group.name && group.name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        const aIsSystem = (a as any).isSystemReserved;
        const bIsSystem = (b as any).isSystemReserved;
        if (aIsSystem && !bIsSystem) return -1;
        if (!aIsSystem && bIsSystem) return 1;
        return Math.abs(b.balance || 0) - Math.abs(a.balance || 0);
      });
  }, [groups, searchTerm]);

  if (filteredAndSortedGroups.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-background rounded-b-lg border-t-0 w-full">
        No groups found.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex h-full min-h-0 min-w-0 w-full flex-col rounded-b-lg border-t-0 bg-background", disabled && "pointer-events-none opacity-60")}>
        <ScrollArea className="min-h-0 min-w-0 w-full flex-1">
          <ul className="p-2 space-y-1 w-full">
            <AnimatePresence mode="popLayout">
              {filteredAndSortedGroups.map((group) => {
                const isSelected = selectedGroup?.id === group.id;
                const isSystem = (group as any).isSystemReserved;
                const href = getItemHref?.(group);
                const cardClassName = cn(
                  "w-full min-w-0 max-w-full overflow-hidden p-1.5 cursor-pointer border rounded-lg transition-colors duration-200",
                  disabled && "cursor-not-allowed",
                  isSelected
                    ? "border-primary bg-secondary shadow-sm"
                    : "border-gray-300 dark:border-gray-600 hover:border-primary/40 bg-card hover:bg-muted/30"
                );
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
                            <TooltipTrigger asChild>
                              <span className="pl-master-list-row-name-strong cursor-default">
                                {group.name}
                              </span>
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
                          <TooltipTrigger asChild>
                            <p
                              className={cn(
                                "pl-master-list-row-amount-xs ml-1 rounded px-1",
                                group.balance >= 0 ? "text-green-600" : "text-red-600"
                              )}
                            >
                              {formatCurrency(group.balance, {
                                showDrCr: true,
                                noAnimation: true,
                              })}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="font-medium">{formatCurrency(group.balance, { showDrCr: true })}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                );
                return (
                  <motion.li
                    key={group.id}
                    className="w-full"
                    layout
                    initial={false}
                    exit={{ transition: { duration: 0 } }}
                    transition={{
                      duration: rowAnimationDuration,
                      ease: "easeInOut",
                    }}
                  >
                    {href ? (
                      <Link href={href} className="block min-w-0 max-w-full overflow-hidden">
                        <Card className={cardClassName}>{cardContent}</Card>
                      </Link>
                    ) : (
                      <Card className={cardClassName} onClick={() => onSelectGroup(group)}>
                        {cardContent}
                      </Card>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

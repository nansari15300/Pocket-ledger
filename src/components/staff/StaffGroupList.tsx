

"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react"; 
import type { StaffGroup } from "@/components/staff/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import Link from 'next/link';
import { isSystemParentGroup } from "@/lib/system-groups";

export function StaffGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
  pendingApprovalByGroupId = {},
}: {
  groups: StaffGroup[];
  searchTerm: string;
  selectedGroup: StaffGroup | null;
  onSelectGroup: (group: StaffGroup) => void;
  pendingApprovalByGroupId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 2.5) : 0;

  const filteredAndSortedGroups = useMemo(() => {
    return (groups || [])
      .filter((group) => {
        // Filter out report-only + system parent groups so they are only used structurally / in reports
        const isReportOnly = (group as any).isReportOnly === true;
        const isSystemParent =
          (group as any).isSystemReserved === true ||
          isSystemParentGroup("staff_groups", (group as any).id);
        if (isReportOnly || isSystemParent) return false;
        return group.name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [groups, searchTerm]);

  return (
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-x border-b bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              
              return (
                <motion.li 
                  key={group.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: rowAnimationDuration, type: "spring", stiffness: 100, damping: 20 }}
                >
                  <div
                    className={cn(
                      "p-1 cursor-pointer border rounded-lg transition-colors duration-200",
                      isSelected
                        ? "border-primary bg-secondary"
                        : "hover:border-primary/50 bg-card hover:bg-accent/50"
                    )}
                    onClick={() => onSelectGroup(group)}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Icon for Staff Group */}
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
                          <TooltipTrigger className="font-semibold whitespace-nowrap truncate max-w-[150px] text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none">
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

                      <p className={cn(
                        "font-semibold text-sm whitespace-nowrap flex-shrink-0 ml-2",
                        group.balance >= 0 ? "text-green-600" : "text-red-600",
                        isSelected && (group.balance >= 0 ? "text-green-800" : "text-red-800")
                      )}>
                        {formatCurrency(group.balance, { showDrCr: true })}
                      </p>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
          
          {filteredAndSortedGroups.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-muted-foreground p-8"
            >
              No staff groups found.
            </motion.div>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}

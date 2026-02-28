
"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import type { ItemGroup } from "@/components/items/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import AnimatedNumber from "../ui/AnimatedNumber";
import { isSystemParentGroup } from "@/lib/system-groups";

export function ItemGroupList({
  groups,
  searchTerm,
  selectedGroup,
  onSelectGroup,
}: {
  groups: ItemGroup[];
  searchTerm: string;
  selectedGroup: ItemGroup | null;
  onSelectGroup: (group: ItemGroup) => void;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  const isRowAnimationEnabled = animationSettings.rows.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
  
  const filteredAndSortedGroups = useMemo(() => {
    return groups
      .filter((group) => {
        // Filter out report-only + system parent groups
        const isReportOnly = (group as any).isReportOnly === true;
        const isSystemParent =
          (group as any).isSystemReserved === true ||
          isSystemParentGroup("item_groups", (group as any).id);
        if (isReportOnly || isSystemParent) return false;
        return group.name && group.name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [groups, searchTerm]);

  return (
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-x border-b bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          <AnimatePresence>
            {filteredAndSortedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              return (
                <motion.li
                  key={group.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ 
                    duration: rowAnimationDuration,
                    type: "spring",
                    stiffness: 100,
                    damping: 20
                  }}
                >
                  <Card
                    className={cn(
                      "p-1 cursor-pointer border",
                      isSelected
                        ? "border-primary bg-secondary"
                        : "hover:border-primary/50"
                    )}
                    onClick={() => onSelectGroup(group)}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="h-8 w-8 flex items-center justify-center bg-muted rounded-lg text-muted-foreground flex-shrink-0">
                          <Users className="h-5 w-5" />
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                             <span className="font-semibold whitespace-nowrap truncate max-w-[150px] text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none cursor-pointer">
                               {group.name}
                             </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{group.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div
                        className={cn(
                          "font-semibold text-sm whitespace-nowrap flex-shrink-0 ml-2",
                          group.balance >= 0 ? "text-green-600" : "text-red-600",
                          isSelected &&
                            (group.balance >= 0
                              ? "text-green-800"
                              : "text-red-800")
                        )}
                      >
                         {/* ✅ FIX: Render formatCurrency directly instead of via AnimatedNumber */}
                        {formatCurrency(group.balance, { showDrCr: true, noAnimation: true })}
                      </div>
                    </div>
                  </Card>
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
    </div>
  );
}

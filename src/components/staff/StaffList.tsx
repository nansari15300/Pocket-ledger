
"use client";

import type { Staff } from "@/components/staff/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Briefcase } from "lucide-react";
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from "framer-motion";

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function StaffList({
  staff,
  selectedStaff,
  onSelectStaff,
  searchTerm,
  pendingApprovalByStaffId = {},
}: {
  staff: Staff[];
  selectedStaff: Staff | null;
  onSelectStaff: (staff: Staff) => void;
  searchTerm: string;
  /** Pending approval count per staff id (only when approve notifications on list). */
  pendingApprovalByStaffId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  
  // Get animation settings - check enabled flag explicitly
  const isRowAnimationEnabled = animationSettings.rows.enabled === true;
  // Use exact duration when enabled, 0 when disabled
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
  
  const filteredAndSortedStaff = useMemo(() => {
    return staff
      .filter((s) =>
        s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [staff, searchTerm]);


  return (
    <div className="flex flex-col h-full min-h-0 rounded-b-lg border-t-0 bg-background">
      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedStaff.map((staffMember) => {
              const isSelected = selectedStaff?.id === staffMember.id;
              return (
                <motion.li
                  key={staffMember.id}
                  layout
                  initial={false}
                  exit={{ transition: { duration: 0 } }}
                  transition={{ duration: isRowAnimationEnabled ? rowAnimationDuration : 0, ease: "easeInOut" }}
                >
                  <Card
                    className={cn(
                      "p-1.5 cursor-pointer border rounded-md transition-all duration-200",
                      isSelected
                        ? "border-primary bg-secondary shadow-sm"
                        : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30"
                    )}
                    onClick={() => onSelectStaff(staffMember)}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-8 w-8 text-xs">
                            <AvatarImage src={staffMember.fileUrl} />
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              <Briefcase className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          {(pendingApprovalByStaffId[staffMember.id] ?? 0) > 0 && (
                            <span
                              className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                              style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                              aria-label={`${pendingApprovalByStaffId[staffMember.id]} pending approval`}
                            >
                              <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByStaffId[staffMember.id]}</span>
                            </span>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger className="text-sm font-medium whitespace-nowrap truncate flex-1 min-w-0 text-left p-0 h-auto bg-transparent hover:bg-transparent border-none shadow-none">
                            {staffMember.name}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{staffMember.name}</p>
                            {(pendingApprovalByStaffId[staffMember.id] ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">{pendingApprovalByStaffId[staffMember.id]} pending approval</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className={cn(
                          "text-sm font-medium whitespace-nowrap flex-shrink-0 ml-2",
                          staffMember.balance >= 0 ? "text-green-600" : "text-red-600",
                          isSelected && (staffMember.balance >= 0 ? "text-green-800" : "text-red-800")
                        )}>
                          {formatCurrency(staffMember.balance, { showDrCr: true, context: 'list' })}
                        </p>
                    </div>
                  </Card>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {filteredAndSortedStaff.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No staff members found.
            </div>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
};

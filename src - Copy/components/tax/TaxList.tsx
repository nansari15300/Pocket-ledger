
"use client";

import type { Tax } from "@/components/tax/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Receipt } from "lucide-react";
import { useDate } from "@/hooks/useDate";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Card } from "@/components/ui/card";
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from "framer-motion";

export function TaxList({ 
    taxes, 
    selectedTax, 
    onSelectTax, 
    searchTerm,
    pendingApprovalByTaxId = {},
}: { 
    taxes: Tax[], 
    selectedTax: Tax | null,
    onSelectTax: (tax: Tax) => void,
    searchTerm: string,
    /** Pending approval count per tax id (only when approve notifications on list). */
    pendingApprovalByTaxId?: Record<string, number>;
}) {
  const { formatCurrency } = useDate();
  
  const filteredAndSortedTaxes = useMemo(() => {
    return taxes
      .filter(tax =>
        tax.name && tax.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [taxes, searchTerm]);

  if (filteredAndSortedTaxes.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-background rounded-b-lg border-t-0">
        No taxes found.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full min-h-0 rounded-b-lg border-t-0 bg-background">
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedTaxes.map(tax => {
                const isSelected = selectedTax?.id === tax.id;
                return (
                <motion.li
                  key={tax.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.8 }}
                >
                    <Card
                        onClick={() => onSelectTax(tax)}
                        className={cn(
                            "p-1.5 cursor-pointer border rounded-md transition-all duration-200",
                            isSelected
                                ? "border-primary bg-secondary shadow-sm"
                                : "border-gray-300 dark:border-gray-600 border-[1.5px] hover:border-primary/40 hover:bg-muted/30"
                        )}
                    >
                        <div className="flex items-center justify-between w-full gap-2 min-w-0">
                            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                            <div className="relative flex-shrink-0">
                              <Avatar className="h-8 w-8 text-sm bg-muted text-muted-foreground">
                                <AvatarImage src={tax.fileUrl} alt={tax.name} />
                                <AvatarFallback>
                                  <Receipt className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              {(pendingApprovalByTaxId[tax.id] ?? 0) > 0 && (
                                <span
                                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                                  style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                                  aria-label={`${pendingApprovalByTaxId[tax.id]} pending approval`}
                                >
                                  <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByTaxId[tax.id]}</span>
                                </span>
                              )}
                            </div>
                            <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-medium whitespace-nowrap truncate min-w-0 text-left cursor-default">
                              {tax.name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="font-medium">{tax.name}</p>
                            {(pendingApprovalByTaxId[tax.id] ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">{pendingApprovalByTaxId[tax.id]} pending approval</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "text-sm font-medium whitespace-nowrap flex-shrink-0 ml-2",
                              tax.balance >= 0 ? "text-green-600" : "text-red-600",
                              isSelected && (tax.balance >= 0 ? "text-green-700" : "text-red-700")
                            )}
                          >
                            {formatCurrency(tax.balance, { showDrCr: true, noAnimation: true })}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="font-medium">{formatCurrency(tax.balance, { showDrCr: true, noAnimation: true })}</p>
                        </TooltipContent>
                      </Tooltip>
                        </div>
                    </Card>
                </motion.li>
            )})}
          </AnimatePresence>
        </ul>
      </ScrollArea>
    </div>
    </TooltipProvider>
  );
};

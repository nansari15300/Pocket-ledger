
"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import { statCardData } from "@/components/dashboard/statCardData";

const allVoucherTypes = [
    { id: "all", label: "All" },
    ...statCardData.map(item => ({ id: item.type, label: item.title })),
];


interface VoucherTypeFilterProps {
  selectedTypes: string[];
  onSelectionChange: (types: string[]) => void;
}

export function VoucherTypeFilter({ selectedTypes, onSelectionChange }: VoucherTypeFilterProps) {

  const handleCheckedChange = (checked: boolean | "indeterminate", typeId: string) => {
    if (typeId === "all") {
      onSelectionChange(checked ? ["all"] : []);
      return;
    }

    let newSelection: string[];
    if (selectedTypes.includes('all')) {
        newSelection = [typeId];
    } else {
        if (selectedTypes.includes(typeId)) {
            newSelection = selectedTypes.filter(t => t !== typeId);
        } else {
            newSelection = [...selectedTypes, typeId];
        }
    }
    
    if (newSelection.length === 0) {
      onSelectionChange(["all"]);
    } else if (newSelection.length === allVoucherTypes.length - 1) {
      onSelectionChange(["all"]);
    } else {
      onSelectionChange(newSelection);
    }
  };
  
  const isAllSelected = selectedTypes.includes("all");


  return (
    <div className="p-2">
        <p className="font-semibold text-sm mb-2 px-2">Filter by Voucher Type</p>
        <ScrollArea className="h-64">
            <div className="space-y-2">
            {allVoucherTypes.map((type) => {
                const isChecked = isAllSelected || selectedTypes.includes(type.id);
                return (
                    <div key={type.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                        <Checkbox
                            id={`filter-${type.id}`}
                            checked={isAllSelected ? true : selectedTypes.includes(type.id)}
                            onCheckedChange={(checked) => handleCheckedChange(checked, type.id)}
                        />
                        <label
                            htmlFor={`filter-${type.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            {type.label}
                        </label>
                    </div>
                )
            })}
            </div>
        </ScrollArea>
    </div>
  );
}

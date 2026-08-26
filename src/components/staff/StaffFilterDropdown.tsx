"use client";
import { STAFF_ENTITY_LABEL, STAFF_ENTITY_TYPE_KEY, STAFF_ENTITY_SEARCH_PLACEHOLDER, STAFF_ENTITY_ADD_BUTTON, staffEntityDisplayLabel } from "@/lib/staffEntityDisplayName";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Staff } from "@/components/staff/types";

type StaffFilterDropdownProps = {
  staffMembers: Staff[];
  selectedStaffIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
};

export function StaffFilterDropdown({
  staffMembers,
  selectedStaffIds,
  onSelectionChange,
}: StaffFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (staffId: string) => {
    if (staffId === "all") {
        if (selectedStaffIds.includes("all") || selectedStaffIds.length === staffMembers.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(["all"]);
        }
        return;
    }

    const currentSelection = selectedStaffIds.includes("all") ? [] : [...selectedStaffIds];
    
    const index = currentSelection.indexOf(staffId);
    if (index > -1) {
        currentSelection.splice(index, 1);
    } else {
        currentSelection.push(staffId);
    }

    if (currentSelection.length === staffMembers.length) {
        onSelectionChange(["all"]);
    } else {
        onSelectionChange(currentSelection);
    }
  };

  const isAllSelected = selectedStaffIds.includes("all") || selectedStaffIds.length === staffMembers.length;
  const selectedCount = isAllSelected ? staffMembers.length : selectedStaffIds.length;

  const displayValue = () => {
    if (selectedCount === 0) return "Select staff...";
    if (isAllSelected) return `${staffMembers.length} selected`;
    if (selectedCount === 1) {
      const selectedStaff = staffMembers.find(p => p.id === selectedStaffIds[0]);
      return selectedStaff ? selectedStaff.name : "1 item selected";
    }
    return `${selectedCount} selected`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between"
        >
          <span className="truncate">
            {displayValue()}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder={STAFF_ENTITY_SEARCH_PLACEHOLDER} />
          <CommandList>
            <CommandEmpty>No staff found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => handleSelect("all")}>
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    isAllSelected ? "opacity-100" : "opacity-0"
                  )}
                />
                Show All
              </CommandItem>
              {staffMembers.map((staff) => (
                <CommandItem
                  key={staff.id}
                  value={staff.name}
                  onSelect={() => handleSelect(staff.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isAllSelected || selectedStaffIds.includes(staff.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {staff.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

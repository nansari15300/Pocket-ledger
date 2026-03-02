
"use client";

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
import type { Item } from "@/components/items/types";

type ItemFilterDropdownProps = {
  items: Item[];
  selectedItemIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
};

export function ItemFilterDropdown({
  items,
  selectedItemIds,
  onSelectionChange,
}: ItemFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (itemId: string) => {
    if (itemId === "all") {
        if (selectedItemIds.includes("all") || selectedItemIds.length === items.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(["all"]);
        }
        return;
    }

    const currentSelection = selectedItemIds.includes("all") ? [] : [...selectedItemIds];
    
    const index = currentSelection.indexOf(itemId);
    if (index > -1) {
        currentSelection.splice(index, 1);
    } else {
        currentSelection.push(itemId);
    }

    if (currentSelection.length === items.length) {
        onSelectionChange(["all"]);
    } else {
        onSelectionChange(currentSelection);
    }
  };

  const isAllSelected = selectedItemIds.includes("all") || selectedItemIds.length === items.length;
  const selectedCount = isAllSelected ? items.length : selectedItemIds.length;

  const displayValue = () => {
    if (selectedCount === 0) return "Select items...";
    if (isAllSelected) return `${items.length} selected`;
    if (selectedCount === 1) {
      const selectedItem = items.find(p => p.id === selectedItemIds[0]);
      return selectedItem ? selectedItem.name : "1 item selected";
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
          <CommandInput placeholder="Search items..." />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
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
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  onSelect={() => handleSelect(item.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isAllSelected || selectedItemIds.includes(item.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {item.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

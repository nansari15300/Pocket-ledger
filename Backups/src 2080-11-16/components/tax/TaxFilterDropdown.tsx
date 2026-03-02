
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
import type { Tax } from "@/components/tax/types";

type TaxFilterDropdownProps = {
  taxes: Tax[];
  selectedTaxIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
};

export function TaxFilterDropdown({
  taxes,
  selectedTaxIds,
  onSelectionChange,
}: TaxFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (taxId: string) => {
    if (taxId === "all") {
        if (selectedTaxIds.includes("all") || selectedTaxIds.length === taxes.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(["all"]);
        }
        return;
    }

    const currentSelection = selectedTaxIds.includes("all") ? [] : [...selectedTaxIds];
    
    const index = currentSelection.indexOf(taxId);
    if (index > -1) {
        currentSelection.splice(index, 1);
    } else {
        currentSelection.push(taxId);
    }

    if (currentSelection.length === taxes.length) {
        onSelectionChange(["all"]);
    } else {
        onSelectionChange(currentSelection);
    }
  };

  const isAllSelected = selectedTaxIds.includes("all") || selectedTaxIds.length === taxes.length;
  const selectedCount = isAllSelected ? taxes.length : selectedTaxIds.length;

  const displayValue = () => {
    if (selectedCount === 0) return "Select taxes...";
    if (isAllSelected) return `${taxes.length} selected`;
    if (selectedCount === 1) {
      const selectedTax = taxes.find(p => p.id === selectedTaxIds[0]);
      return selectedTax ? selectedTax.name : "1 item selected";
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
          <CommandInput placeholder="Search taxes..." />
          <CommandList>
            <CommandEmpty>No taxes found.</CommandEmpty>
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
              {taxes.map((tax) => (
                <CommandItem
                  key={tax.id}
                  value={tax.name}
                  onSelect={() => handleSelect(tax.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isAllSelected || selectedTaxIds.includes(tax.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {tax.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

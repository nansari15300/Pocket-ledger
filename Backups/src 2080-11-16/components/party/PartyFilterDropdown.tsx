
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
import type { Party } from "@/components/party/types";

type PartyFilterDropdownProps = {
  parties: Party[];
  selectedPartyIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
};

export function PartyFilterDropdown({
  parties,
  selectedPartyIds,
  onSelectionChange,
}: PartyFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (partyId: string) => {
    if (partyId === "all") {
        if (selectedPartyIds.includes("all") || selectedPartyIds.length === parties.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(["all"]);
        }
        return;
    }

    const currentSelection = selectedPartyIds.includes("all") ? [] : [...selectedPartyIds];
    
    const index = currentSelection.indexOf(partyId);
    if (index > -1) {
        currentSelection.splice(index, 1);
    } else {
        currentSelection.push(partyId);
    }

    if (currentSelection.length === parties.length) {
        onSelectionChange(["all"]);
    } else {
        onSelectionChange(currentSelection);
    }
  };

  const isAllSelected = selectedPartyIds.includes("all") || selectedPartyIds.length === parties.length;
  const selectedCount = isAllSelected ? parties.length : selectedPartyIds.length;

  const displayValue = () => {
    if (selectedCount === 0) return "Select parties...";
    if (isAllSelected) return `All (${parties.length}) selected`;
    if (selectedCount === 1) {
      const selectedParty = parties.find(p => p.id === selectedPartyIds[0]);
      return selectedParty ? selectedParty.name : "1 item selected";
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
          className="h-10 px-2 w-auto justify-between"
        >
          <span className="truncate">
            {displayValue()}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search parties..." />
          <CommandList>
            <CommandEmpty>No parties found.</CommandEmpty>
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
              {parties.map((party) => (
                <CommandItem
                  key={party.id}
                  value={party.name}
                  onSelect={() => handleSelect(party.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isAllSelected || selectedPartyIds.includes(party.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {party.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

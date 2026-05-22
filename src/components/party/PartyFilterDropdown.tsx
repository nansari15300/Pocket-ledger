
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
import { LEDGER_HEADER_PILL_CN, LEDGER_HEADER_PILL_ICON_SIZE_CN } from "@/lib/ledgerHeaderChrome";
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
    // Use neutral wording so item/entity pages are not tied to "Party" label.
    if (selectedCount === 0) return "Select entities...";
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
          className={cn(LEDGER_HEADER_PILL_CN, "w-auto justify-between px-2")}
        >
          <span className="truncate">
            {displayValue()}
          </span>
          <ChevronsUpDown className={cn("ml-2 shrink-0 opacity-50", LEDGER_HEADER_PILL_ICON_SIZE_CN)} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search entities..." />
          <CommandList>
            <CommandEmpty>No entities found.</CommandEmpty>
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

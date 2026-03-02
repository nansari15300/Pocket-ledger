
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
import type { Account } from "@/components/bank-cash/types";

type AccountFilterDropdownProps = {
  accounts: Account[];
  selectedAccountIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
};

export function AccountFilterDropdown({
  accounts,
  selectedAccountIds,
  onSelectionChange,
}: AccountFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (accountId: string) => {
    if (accountId === "all") {
        if (selectedAccountIds.includes("all") || selectedAccountIds.length === accounts.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(["all"]);
        }
        return;
    }

    const currentSelection = selectedAccountIds.includes("all") ? [] : [...selectedAccountIds];
    
    const index = currentSelection.indexOf(accountId);
    if (index > -1) {
        currentSelection.splice(index, 1);
    } else {
        currentSelection.push(accountId);
    }

    if (currentSelection.length === accounts.length) {
        onSelectionChange(["all"]);
    } else {
        onSelectionChange(currentSelection);
    }
  };

  const isAllSelected = selectedAccountIds.includes("all") || selectedAccountIds.length === accounts.length;
  const selectedCount = isAllSelected ? accounts.length : selectedAccountIds.length;

  const displayValue = () => {
    if (selectedCount === 0) return "Select accounts...";
    if (isAllSelected) return `${accounts.length} selected`;
    if (selectedCount === 1) {
      const selectedAccount = accounts.find(p => p.id === selectedAccountIds[0]);
      return selectedAccount ? selectedAccount.accountName : "1 item selected";
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
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
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
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={account.accountName}
                  onSelect={() => handleSelect(account.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isAllSelected || selectedAccountIds.includes(account.id)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {account.accountName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Crown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

type ComboboxProps = {
  options: { value: string; label: string; isSpecial?: boolean }[];
  value?: string | string[];
  onChange?: (value: string, newName?: string) => void;
  onMultiChange?: (values: string[]) => void;
  placeholder?: string;
  addNewLabel?: string;
  addNewLabels?: { value: string; label: string }[];
  disabled?: boolean;
  isMultiSelect?: boolean;
  triggerClassName?: string;
};

export function Combobox({
  options,
  value,
  onChange,
  onMultiChange,
  placeholder = "Select an option",
  addNewLabel,
  addNewLabels,
  disabled = false,
  isMultiSelect = false,
  triggerClassName,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  
  const handleSingleSelect = (val: string) => {
    onChange?.(val);
    setOpen(false);
  };
  
  const handleMultiSelect = (val: string) => {
    if (!Array.isArray(value) || !onMultiChange) return;

    if (val === 'all') {
        const isAllSelected = value.includes('all') || value.length === options.length;
        onMultiChange(isAllSelected ? [] : ['all']);
        return;
    }
    
    let newSelection = value.includes('all') ? [] : [...value];
    
    if (newSelection.includes(val)) {
        newSelection = newSelection.filter(item => item !== val);
    } else {
        newSelection.push(val);
    }

    if (newSelection.length === options.length) {
        onMultiChange(['all']);
    } else {
        onMultiChange(newSelection);
    }
  };

  const handleAddNew = (val: string, newName: string) => {
    onChange?.(val, newName);
    setOpen(false);
  };
  
  const displayValue = () => {
    if (isMultiSelect) {
      if (!Array.isArray(value) || value.length === 0 || value.includes('all')) return placeholder;
      if (value.length === 1) {
        return options.find(opt => opt.value === value[0])?.label || placeholder;
      }
      return `${value.length} selected`;
    }
    const selectedOption = options.find((option) => option.value === value);
    return selectedOption?.label || placeholder;
  };

  const addNewItems = addNewLabels || (addNewLabel ? [{value: "add-new", label: addNewLabel}] : []);
  const filteredOptions = options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));
  const hasNoResults = filteredOptions.length === 0;
  const showAddNew = addNewItems.length > 0 && (search.trim().length > 0 || hasNoResults);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-9", triggerClassName)}
          disabled={disabled}
        >
          <span className="truncate flex items-center gap-2">
            {!isMultiSelect && (options.find((o) => o.value === value))?.isSpecial && <Crown className="h-4 w-4 text-amber-500" />}
            {displayValue()}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        style={{ width: `var(--radix-popover-trigger-width)` }}
        className="p-0 z-[9999]"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{showAddNew ? null : "No results found."}</CommandEmpty>
            <CommandGroup>
              {isMultiSelect && (
                  <CommandItem key="all" value="all" onSelect={() => handleMultiSelect('all')}>
                    <Check className={cn("mr-2 h-4 w-4", (value as string[]).includes('all') ? "opacity-100" : "opacity-0")} />
                    All
                  </CommandItem>
              )}
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => isMultiSelect ? handleMultiSelect(option.value) : handleSingleSelect(option.value)}
                  className={cn("flex items-center", option.isSpecial && "text-amber-600 font-medium")}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isMultiSelect
                        ? (value as string[]).includes(option.value) || (value as string[]).includes('all') ? "opacity-100" : "opacity-0"
                        : value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.isSpecial && <Crown className="mr-2 h-4 w-4 text-amber-500" />}
                  <span className="flex-1">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            
            {showAddNew && (
                <>
                    <CommandSeparator />
                    <CommandGroup>
                         {addNewItems.map((item) => (
                            <CommandItem
                                key={item.value}
                                value={item.value}
                                onSelect={() => handleAddNew(item.value, search.trim())}
                                className="text-green-600 font-medium focus:text-green-700 focus:bg-green-50 dark:focus:bg-green-950/30"
                            >
                                <Plus className="mr-2 h-4 w-4 text-green-600" />
                                {search.trim() ? `${item.label}: "${search.trim()}"` : item.label}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </>
            )}

          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

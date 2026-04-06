
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
  // Option-level disabled is used by voucher account dropdowns to block non-selectable accounts.
  options: { value: string; label: string; triggerLabel?: string; isSpecial?: boolean; disabled?: boolean }[];
  value?: string | string[];
  onChange?: (value: string, newName?: string) => void;
  onMultiChange?: (values: string[]) => void;
  placeholder?: string;
  /** CommandInput placeholder (filter list by typing). */
  searchPlaceholder?: string;
  addNewLabel?: string;
  addNewLabels?: { value: string; label: string }[];
  disabled?: boolean;
  isMultiSelect?: boolean;
  triggerClassName?: string;
  // Optional UI flag: highlight trailing "Balance: ..." text in option rows.
  highlightBalanceInOptions?: boolean;
  // Optional UI flag: force option labels to stay in a single row.
  noWrapOptions?: boolean;
  // Optional UI flag: when single-row is enabled, show full text (no ellipsis truncation).
  showFullOptionText?: boolean;
  // Optional popover sizing mode: "auto" allows dropdown to grow wider than trigger.
  contentWidthMode?: "trigger" | "auto";
  /** Dialog ke andar: modal=false + focus search — nested focus trap se search dikhe/kaam kare */
  popoverModal?: boolean;
  /** Khulte hi filter input par focus (Note form / lambe lists). */
  autoFocusSearchOnOpen?: boolean;
};

export function Combobox({
  options,
  value,
  onChange,
  onMultiChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  addNewLabel,
  addNewLabels,
  disabled = false,
  isMultiSelect = false,
  triggerClassName,
  highlightBalanceInOptions = false,
  noWrapOptions = false,
  showFullOptionText = false,
  contentWidthMode = "trigger",
  popoverModal = true,
  autoFocusSearchOnOpen = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Dialog + Popover: default preventDefault se search input focus nahi milta — optional rAF se focus
  React.useEffect(() => {
    if (!open || !autoFocusSearchOnOpen) return;
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, autoFocusSearchOnOpen]);
  
  const handleSingleSelect = (val: string) => {
    onChange?.(val);
    setOpen(false);
    setSearch("");
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
    setSearch("");
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
    // Allow caller to show a cleaner selected value than dropdown list row text.
    return selectedOption?.triggerLabel || selectedOption?.label || placeholder;
  };

  const addNewItems = addNewLabels || (addNewLabel ? [{value: "add-new", label: addNewLabel}] : []);
  const q = search.trim().toLowerCase();
  const filteredOptions = q.length === 0 ? options : options.filter((opt) => opt.label.toLowerCase().includes(q));
  const hasNoResults = filteredOptions.length === 0;
  const showAddNew = addNewItems.length > 0 && (search.trim().length > 0 || hasNoResults);

  const renderOptionLabel = (label: string) => {
    // Keep list row text single-line when caller requests no-wrap options.
    const labelClassName = cn(
      "flex-1 min-w-0",
      noWrapOptions && "whitespace-nowrap",
      noWrapOptions && !showFullOptionText && "truncate"
    );
    if (!highlightBalanceInOptions) return <span className={labelClassName}>{label}</span>;
    const balanceIdx = label.indexOf("Balance:");
    if (balanceIdx < 0) return <span className={labelClassName}>{label}</span>;
    const prefix = label.slice(0, balanceIdx);
    const balanceText = label.slice(balanceIdx);
    // Keep account name neutral; emphasize the balance segment in green for quick scan.
    return (
      <span className={labelClassName}>
        <span>{prefix}</span>
        <span className="text-green-600 font-medium">{balanceText}</span>
      </span>
    );
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={popoverModal}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full min-w-0 max-w-full justify-between h-9 overflow-hidden", triggerClassName)}
          disabled={disabled}
        >
          <span className="truncate flex items-center gap-2 min-w-0 flex-1">
            {!isMultiSelect && (options.find((o) => o.value === value))?.isSpecial && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}
            <span className="truncate">{displayValue()}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // Allow desktop dropdowns to expand while keeping minimum trigger width.
        style={
          contentWidthMode === "auto"
            ? { minWidth: `var(--radix-popover-trigger-width)` }
            : { width: `var(--radix-popover-trigger-width)` }
        }
        className={cn(
          "p-0 z-[9999]",
          contentWidthMode === "auto" && "w-auto max-w-[calc(100vw-2rem)]"
        )}
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          if (!autoFocusSearchOnOpen) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={searchInputRef}
            placeholder={searchPlaceholder}
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
                  value={option.value}
                  // Use option.value (id) so cmdk passes correct value; option.label can break selection.
                  disabled={option.disabled}
                  onSelect={() => {
                    if (option.disabled) return;
                    return isMultiSelect ? handleMultiSelect(option.value) : handleSingleSelect(option.value);
                  }}
                  className={cn(
                    "flex items-center",
                    option.isSpecial && "text-amber-600 font-medium",
                    option.disabled && "opacity-50 cursor-not-allowed"
                  )}
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
                  {renderOptionLabel(option.label)}
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

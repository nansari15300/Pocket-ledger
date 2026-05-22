
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
import { useIsMobile } from "@/hooks/use-mobile";

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
  /** Lamba selected label: truncate ke bajay trigger me horizontal scroll (voucher line grid). */
  triggerLabelScrollable?: boolean;
  /**
   * Trigger text ka minimum width (`ch`): grid/flex me `min-w-0` se Unit jaise fields 2 letter tak squeeze ho rahe the —
   * yahan ~N character worth width + `truncate` se uske baad ellipsis.
   */
  triggerLabelMinCh?: number;
  /** Optional: cap visible filtered options (useful for mobile dropdown performance/clarity). */
  maxVisibleOptions?: number;
  /** Popover panel extra classes; agar set ho to default trigger-width inline style skip (mobile width jaise). */
  popoverContentClassName?: string;
  /**
   * Mobile par default 80vw list + ek-line option — band karo jahan wrap chahiye (`mobileWideOptionList={false}`).
   * Web + APK/Capacitor dono: `useIsMobile()` breakpoint.
   */
  mobileWideOptionList?: boolean;
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
  triggerLabelScrollable = false,
  triggerLabelMinCh,
  maxVisibleOptions,
  popoverContentClassName,
  mobileWideOptionList = true,
}: ComboboxProps) {
  const isMobile = useIsMobile();
  /** Voucher / sab combo: mobile par list ~80vw jab tak caller ne `popoverContentClassName` na di ho. */
  const useMobileWideList =
    mobileWideOptionList !== false && isMobile && !popoverContentClassName;
  /** Mobile: naam ek row + horizontal scroll; `noWrapOptions={false}` se purana wrap behaviour. */
  const effectiveNoWrap = isMobile ? noWrapOptions !== false : noWrapOptions;
  const effectiveShowFull = isMobile ? showFullOptionText !== false : showFullOptionText;
  const skipPopoverInlineWidth = Boolean(popoverContentClassName) || useMobileWideList;
  const mergedPopoverContentClassName = cn(
    useMobileWideList &&
      "w-[80vw] max-w-[80vw] sm:min-w-[var(--radix-popover-trigger-width)] sm:w-auto sm:max-w-md",
    popoverContentClassName
  );

  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  /** cmdk highlighted row = form `value` jab dropdown khule — pehla item galat “selected” na dikhe. */
  const [cmdkListValue, setCmdkListValue] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  /** List scroll / drag: accidental onSelect rokne (mobile touch scroll). */
  const listGestureStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const blockSelectFromGestureRef = React.useRef(false);
  /** Khulte hi programmatic scroll se `onScroll` pehli tap block na kare. */
  const ignoreListScrollRef = React.useRef(false);

  // Dialog + Popover: default preventDefault se search input focus nahi milta — optional rAF se focus
  React.useEffect(() => {
    if (!open || !autoFocusSearchOnOpen) return;
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, autoFocusSearchOnOpen]);

  React.useEffect(() => {
    if (!open || isMultiSelect) return;
    const v = Array.isArray(value) ? "" : (value ?? "");
    setCmdkListValue(typeof v === "string" ? v : "");
  }, [open, value, isMultiSelect]);

  React.useEffect(() => {
    if (!open) return;
    ignoreListScrollRef.current = true;
    const t = window.setTimeout(() => {
      ignoreListScrollRef.current = false;
    }, 220);
    return () => window.clearTimeout(t);
  }, [open]);

  const runIfNotScrollGesture = (fn: () => void) => {
    if (blockSelectFromGestureRef.current) {
      blockSelectFromGestureRef.current = false;
      return;
    }
    fn();
  };

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
  // Keep dropdown manageable on dense lists by capping rendered rows when requested.
  const visibleOptions = React.useMemo(() => {
    if (typeof maxVisibleOptions !== "number" || maxVisibleOptions <= 0) return filteredOptions;
    const capped = filteredOptions.slice(0, maxVisibleOptions);
    // Keep special action options visible at list bottom even when capped.
    const specialTail = filteredOptions.filter((opt) => opt.isSpecial && !capped.some((c) => c.value === opt.value));
    return [...capped, ...specialTail];
  }, [filteredOptions, maxVisibleOptions]);
  const hasNoResults = filteredOptions.length === 0;
  const showAddNew = addNewItems.length > 0 && (search.trim().length > 0 || hasNoResults);

  const renderOptionLabel = (label: string) => {
    // Keep list row text single-line when caller requests no-wrap options.
    const labelClassName = cn(
      "flex-1 min-w-0",
      effectiveNoWrap && "whitespace-nowrap",
      effectiveNoWrap && effectiveShowFull && "overflow-x-auto [scrollbar-width:thin]",
      effectiveNoWrap && !effectiveShowFull && "truncate"
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

  const hasLabelMinCh = typeof triggerLabelMinCh === "number" && triggerLabelMinCh > 0;
  const labelMinCh = hasLabelMinCh ? triggerLabelMinCh! : null;

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
          className={cn(
            // overflow label wrapper par; button par nahi — warna ChevronsUpDown clip (Unit = lamba minWidth).
            "w-full max-w-full justify-between gap-0.5 h-9 px-2",
            labelMinCh == null ? "min-w-0" : "",
            triggerLabelScrollable ? "overflow-x-auto" : "overflow-visible",
            triggerClassName
          )}
          style={
            labelMinCh != null
              ? { minWidth: `calc(${labelMinCh}ch + 1.75rem)` }
              : undefined
          }
          disabled={disabled}
        >
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1",
              triggerLabelScrollable
                ? "max-w-full overflow-x-auto"
                : "max-w-[calc(100%-1.75rem)] overflow-hidden"
            )}
            style={
              labelMinCh != null
                ? { minWidth: `${labelMinCh}ch` }
                : undefined
            }
          >
            {!isMultiSelect && (options.find((o) => o.value === value))?.isSpecial && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}
            <span
              className={cn(
                "block flex-1 max-w-full text-left",
                labelMinCh == null ? "min-w-0" : "",
                triggerLabelScrollable ? "overflow-x-auto whitespace-nowrap" : "truncate"
              )}
              style={
                labelMinCh != null
                  ? { minWidth: `${labelMinCh}ch` }
                  : undefined
              }
            >
              {displayValue()}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 mr-0.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // Custom / mobile-80vw: inline width mat lagao — radix trigger var list ko patla kar deta tha.
        style={
          skipPopoverInlineWidth
            ? undefined
            : contentWidthMode === "auto"
              ? { minWidth: `var(--radix-popover-trigger-width)` }
              : { width: `var(--radix-popover-trigger-width)` }
        }
        className={cn(
          "p-0 z-[9999]",
          !skipPopoverInlineWidth && contentWidthMode === "auto" && "w-auto max-w-[calc(100vw-2rem)]",
          mergedPopoverContentClassName
        )}
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          // Dialog ke andar popover: radix default focus search ko block karta hai — manual focus
          e.preventDefault();
          if (autoFocusSearchOnOpen) {
            requestAnimationFrame(() => searchInputRef.current?.focus());
          }
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          shouldFilter={false}
          {...(!isMultiSelect
            ? {
                value: cmdkListValue,
                onValueChange: setCmdkListValue,
              }
            : {})}
        >
          <CommandInput
            ref={searchInputRef}
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <CommandList
            onPointerDownCapture={(e) => {
              listGestureStartRef.current = { x: e.clientX, y: e.clientY };
              blockSelectFromGestureRef.current = false;
            }}
            onPointerMoveCapture={(e) => {
              const s = listGestureStartRef.current;
              if (!s) return;
              if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) {
                blockSelectFromGestureRef.current = true;
              }
            }}
            onPointerUpCapture={() => {
              listGestureStartRef.current = null;
            }}
            onScroll={() => {
              if (ignoreListScrollRef.current) return;
              blockSelectFromGestureRef.current = true;
            }}
          >
            <CommandEmpty>{showAddNew ? null : "No results found."}</CommandEmpty>
            <CommandGroup>
              {isMultiSelect && (
                  <CommandItem
                    key="all"
                    value="all"
                    onSelect={() => runIfNotScrollGesture(() => handleMultiSelect("all"))}
                    className="w-full"
                  >
                    {/* pointer-events-none: hit cmdk-item root — full row select (child text svg pe narrow hit fix) */}
                    <span className="pointer-events-none flex w-full min-w-0 items-center">
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", (value as string[]).includes("all") ? "opacity-100" : "opacity-0")} />
                      All
                    </span>
                  </CommandItem>
              )}
              {visibleOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  // Use option.value (id) so cmdk passes correct value; option.label can break selection.
                  disabled={option.disabled}
                  onSelect={() => {
                    if (option.disabled) return;
                    runIfNotScrollGesture(() => {
                      if (isMultiSelect) handleMultiSelect(option.value);
                      else handleSingleSelect(option.value);
                    });
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-center",
                    // Patla trigger: dropdown row wrap na ho — ek line + andar scroll
                    effectiveNoWrap && "whitespace-nowrap",
                    // Sirf Check = form selection; aria-selected sirf halka hover (scroll pe galat “selected” na lage).
                    "[&[aria-selected=true]]:!bg-muted/25 [&[aria-selected=true]]:!text-foreground",
                    option.isSpecial && "text-amber-600 font-medium",
                    option.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className="pointer-events-none flex w-full min-w-0 items-center">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        isMultiSelect
                          ? (value as string[]).includes(option.value) || (value as string[]).includes("all")
                            ? "opacity-100"
                            : "opacity-0"
                          : value === option.value
                            ? "opacity-100"
                            : "opacity-0"
                      )}
                    />
                    {option.isSpecial && <Crown className="mr-2 h-4 w-4 shrink-0 text-amber-500" />}
                    {renderOptionLabel(option.label)}
                  </span>
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
                                onSelect={() =>
                                  runIfNotScrollGesture(() => handleAddNew(item.value, search.trim()))
                                }
                                className="w-full min-w-0 text-green-600 font-medium focus:text-green-700 focus:bg-green-50 dark:focus:bg-green-950/30"
                            >
                                <span className="pointer-events-none flex w-full min-w-0 items-center">
                                  <Plus className="mr-2 h-4 w-4 shrink-0 text-green-600" />
                                  {search.trim() ? `${item.label}: "${search.trim()}"` : item.label}
                                </span>
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

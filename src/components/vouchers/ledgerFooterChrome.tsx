"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { chromePillBtn } from "@/lib/chromePillButton";

/** PC ledger footer — har control alag chrome pill; active = green border. */
export function LedgerFooterChromePill({
  active,
  className,
  children,
}: {
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5",
        chromePillBtn(active),
        className
      )}
    >
      {children}
    </span>
  );
}

/** Show Narration / Note / Check mode — checkbox + label ek pill me. */
export function LedgerFooterCheckboxPill({
  id,
  checked,
  onCheckedChange,
  label,
  disabled,
  labelClassName,
  activeWhenChecked = true,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  labelClassName?: string;
  /** false ho to pill hamesha neutral (info icon wale cases). */
  activeWhenChecked?: boolean;
}) {
  return (
    <LedgerFooterChromePill
      active={activeWhenChecked ? checked : false}
      className={cn(disabled && "pointer-events-none opacity-50")}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onCheckedChange(Boolean(c))}
        className="shrink-0"
      />
      <label
        htmlFor={id}
        className={cn(
          "cursor-pointer whitespace-nowrap text-sm font-medium leading-none",
          labelClassName
        )}
      >
        {label}
      </label>
    </LedgerFooterChromePill>
  );
}

/** Page count / Total Trxn — sirf text wala pill. */
export function LedgerFooterTextPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <LedgerFooterChromePill className={className}>
      <span className="whitespace-nowrap text-sm font-medium tabular-nums">{children}</span>
    </LedgerFooterChromePill>
  );
}

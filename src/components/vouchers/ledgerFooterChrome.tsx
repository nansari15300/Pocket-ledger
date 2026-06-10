"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { chromePillBtn } from "@/lib/chromePillButton";

/** PC ledger footer — saare pills + parent pill ek hi height */
export const LEDGER_FOOTER_PILL_H = "h-8";
/** Har pill ke beech same gap (left row, pagination, parent ke andar) */
export const LEDGER_FOOTER_GAP = "gap-1.5";
export const ledgerFooterRowCn = `flex flex-nowrap items-center ${LEDGER_FOOTER_GAP}`;

/** @deprecated — ab sab `LEDGER_FOOTER_PILL_H` */
export const LEDGER_FOOTER_PARENT_H = LEDGER_FOOTER_PILL_H;
export const LEDGER_FOOTER_CHILD_H = LEDGER_FOOTER_PILL_H;

/** Footer chrome pill — parent jaisi height */
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
        "inline-flex shrink-0 items-center rounded-full px-2.5",
        LEDGER_FOOTER_PILL_H,
        LEDGER_FOOTER_GAP,
        chromePillBtn(active),
        className
      )}
    >
      {children}
    </span>
  );
}

/** Pagination counts — parent ke andar text only */
export function LedgerFooterTextPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-pl-footer-meta
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap px-1 text-sm font-medium tabular-nums text-muted-foreground",
        LEDGER_FOOTER_PILL_H,
        className
      )}
    >
      {children}
    </span>
  );
}

/** Pagination block — ek outer pill; andar bhi same gap */
export function LedgerFooterParentPill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-pl-footer-parent-pill
      className={cn(
        "inline-flex shrink-0 flex-nowrap items-center rounded-full px-1.5",
        LEDGER_FOOTER_PILL_H,
        LEDGER_FOOTER_GAP,
        chromePillBtn(false),
        className
      )}
    >
      {children}
    </span>
  );
}

/** Footer icon buttons — pill height ke barabar */
export const ledgerFooterIconBtnCn = `${LEDGER_FOOTER_PILL_H} w-8 shrink-0 px-0`;

/** Footer text/button triggers — chrome pill height */
export const ledgerFooterPillBtnCn = `${LEDGER_FOOTER_PILL_H} shrink-0 gap-1 px-2.5`;

/** Show Narration / Note — checkbox state se; pill hamesha blue chrome (Columns / Check mode jaisa). */
export function LedgerFooterCheckboxPill({
  id,
  checked,
  onCheckedChange,
  label,
  disabled,
  labelClassName,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  labelClassName?: string;
}) {
  return (
    <LedgerFooterChromePill className={cn(disabled && "pointer-events-none opacity-50")}>
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

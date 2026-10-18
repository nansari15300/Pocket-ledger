"use client";

import { useController, type Control } from "react-hook-form";
import { cn } from "@/lib/utils";

type Props = {
  control: Control<any>;
  name?: string;
  disabled?: boolean;
  compact?: boolean;
  /** Show "TDS Unverified" / "TDS Verified" text next to the box (totals row). */
  showLabel?: boolean;
};

type BoxProps = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  showLabel?: boolean;
  /** Left margin in px (default 20). */
  gapLeft?: number;
  /** Optional label texts (default "TDS Verified" / "TDS Unverified") and box-to-label gap in px (default 6). */
  verifiedText?: string;
  unverifiedText?: string;
  labelGap?: number;
};

/**
 * Presentational "Verify TDS" tick (also used by Add Salary header, where it toggles all rows).
 * Custom span checkbox (not input/button) so the global dialog rule that forces green borders on
 * input/button/[role=checkbox] buttons does not wash out the border.
 */
export function TdsVerifyTickBox({ checked, onToggle, disabled, showLabel, gapLeft = 20, verifiedText = "TDS Verified", unverifiedText = "TDS Unverified", labelGap = 6 }: BoxProps) {
  const toggle = () => {
    if (!disabled) onToggle();
  };
  const box = (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label="Verify TDS"
      tabIndex={disabled ? -1 : 0}
      title={checked ? "TDS Verified" : "Verify TDS (marks TDS Verified without a journal)"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, marginLeft: gapLeft }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[3px] border-2 border-solid align-middle",
        checked ? "border-emerald-700 bg-emerald-700 text-white" : "border-amber-700 bg-[#FEF3C7] dark:border-amber-400 dark:bg-amber-900/40",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      )}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true">
          <path d="M2 6.5l2.6 2.6L10 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
  if (!showLabel) return box;
  return (
    <span className="inline-flex items-center" style={{ gap: labelGap }}>
      {box}
      <span className={cn("text-sm font-semibold whitespace-nowrap", checked ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
        {checked ? verifiedText : unverifiedText}
      </span>
    </span>
  );
}

/**
 * "Verify TDS" tick bound to a form field (default voucher-level `isTdsVerified`).
 * Status only (TDS badge -> Paid) - no accounting posting.
 */
export function SalePurchaseTdsVerifyTick({ control, name = "isTdsVerified", disabled, showLabel }: Props) {
  const { field } = useController({ control, name });
  const checked = field.value === true;
  return <TdsVerifyTickBox checked={checked} onToggle={() => field.onChange(!checked)} disabled={disabled} showLabel={showLabel} />;
}
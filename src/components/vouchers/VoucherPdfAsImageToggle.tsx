"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Voucher attach: PDF ko save par JPEG (sab pages ek vertical image) me badalne ka option */
export function VoucherPdfAsImageToggle({
  checked,
  onCheckedChange,
  disabled,
  className,
  id = "voucher-save-pdf-as-image",
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border border-dashed border-muted-foreground/25 bg-muted/20 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span>
        <span className="font-medium text-foreground">Save PDF as JPEG image</span>
        <span className="block text-[10px] text-muted-foreground">
          All pages in one vertical image (smaller upload). Applies on Save when checked.
        </span>
      </span>
    </label>
  );
}

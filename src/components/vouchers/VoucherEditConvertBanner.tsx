"use client";

import { cn } from "@/lib/utils";

type Props = {
  message: string;
  className?: string;
};

export function VoucherEditConvertBanner({ message, className }: Props) {
  return (
    <div
      role="status"
      data-pl-voucher-edit-convert-banner=""
      className={cn(
        "mx-[2px] mb-2 shrink-0 rounded-md border border-amber-400/90 bg-amber-50 px-3 py-2 text-sm font-medium leading-snug text-amber-950",
        className
      )}
    >
      {message}
    </div>
  );
}

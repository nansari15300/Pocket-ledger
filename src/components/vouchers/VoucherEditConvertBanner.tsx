"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { setActiveVoucherConvertSourceId, setVoucherConvertSourceMoveToBin } from "@/lib/voucherEditConvert";

type Props = {
  message: string;
  className?: string;
  /** Original (source) voucher id + number: enables the "move old voucher to bin" checkbox. */
  sourceVoucherId?: string | null;
  sourceVoucherNumber?: string;
};

export function VoucherEditConvertBanner({ message, className, sourceVoucherId, sourceVoucherNumber }: Props) {
  const [moveToBin, setMoveToBin] = useState(true);
  useEffect(() => {
    if (!sourceVoucherId) return;
    setMoveToBin(true);
    setVoucherConvertSourceMoveToBin(sourceVoucherId, true);
    setActiveVoucherConvertSourceId(sourceVoucherId);
    return () => {
      setVoucherConvertSourceMoveToBin(sourceVoucherId, true);
      setActiveVoucherConvertSourceId(null);
    };
  }, [sourceVoucherId]);
  const oldNo = String(sourceVoucherNumber || "").trim();
  const noAt = oldNo ? message.indexOf(oldNo) : -1;
  return (
    <div
      role="status"
      data-pl-voucher-edit-convert-banner=""
      className={cn(
        "mx-[2px] mb-2 shrink-0 text-center rounded-md border border-amber-400/90 bg-amber-50 px-3 py-2 text-sm font-medium leading-snug text-amber-950",
        sourceVoucherId && "flex flex-wrap items-center justify-center gap-x-[40px] gap-y-1",
        className
      )}
    >
      <span>
        {noAt >= 0 ? (<>{message.slice(0, noAt)}(<span className="text-xs text-red-600 dark:text-red-400">{oldNo}</span>){message.slice(noAt + oldNo.length)}</>) : message}
      </span>
      {sourceVoucherId ? (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span>{oldNo ? (<>Old voucher (<span className="text-xs text-red-600 dark:text-red-400">{oldNo}</span>) will be moved to bin</>) : "Old voucher will be moved to bin"}</span>
          <Checkbox
            checked={moveToBin}
            onCheckedChange={(c) => {
              const v = c === true;
              setMoveToBin(v);
              setVoucherConvertSourceMoveToBin(sourceVoucherId, v);
            }}
            aria-label="Move old voucher to bin"
          />
        </label>
      ) : null}
    </div>
  );
}
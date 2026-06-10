"use client";

import { openVoucherEditFromPrefetchNotice } from "@/lib/attachmentPrefetchVoucherLookup";

export type AttachmentPrefetchSummaryToastItem = {
  voucherNumber: string;
  companyId: string;
  voucherId: string;
  voucherKindLabel?: string | null;
  fileName?: string | null;
};

type Props = {
  failedCount: number;
  companyName?: string | null;
  extraSuppressed?: number;
  items: AttachmentPrefetchSummaryToastItem[];
};

export function AttachmentPrefetchSummaryToastBody({
  failedCount,
  companyName,
  extraSuppressed = 0,
  items,
}: Props) {
  const companyBit = companyName?.trim() ? ` (${companyName.trim()})` : "";
  const withVoucher = items.filter((i) => i.voucherId && i.companyId);

  return (
    <div className="space-y-2 text-sm leading-snug">
      <p>
        {failedCount} attachment(s) could not be cached for offline use{companyBit}.
        {extraSuppressed > 0
          ? ` ${extraSuppressed} more alert(s) were skipped to avoid repetition.`
          : null}
      </p>
      {withVoucher.length > 0 ? (
        <ul className="space-y-1">
          {withVoucher.slice(0, 6).map((item) => (
            <li key={`${item.companyId}:${item.voucherId}:${item.voucherNumber}`}>
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2 hover:no-underline"
                onClick={() => openVoucherEditFromPrefetchNotice(item.companyId, item.voucherId)}
              >
                Click here
              </button>
              <span>
                {" "}
                to open {item.voucherKindLabel ? `${item.voucherKindLabel} ` : ""}
                <span className="font-medium">{item.voucherNumber}</span>
                {item.fileName ? ` — ${item.fileName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Open vouchers online to refresh file links.</p>
      )}
      {withVoucher.length > 6 ? (
        <p className="text-muted-foreground text-xs">+ {withVoucher.length - 6} more with attachment errors</p>
      ) : null}
    </div>
  );
}

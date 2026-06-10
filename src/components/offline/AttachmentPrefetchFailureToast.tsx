"use client";

import { openVoucherEditFromPrefetchNotice } from "@/lib/attachmentPrefetchVoucherLookup";

type Props = {
  statusLine: string;
  voucherNumber?: string | null;
  voucherKindLabel?: string | null;
  fileName?: string | null;
  companyId?: string | null;
  voucherId?: string | null;
  showRefreshTip?: boolean;
};

export function AttachmentPrefetchFailureToastBody({
  statusLine,
  voucherNumber,
  voucherKindLabel,
  fileName,
  companyId,
  voucherId,
  showRefreshTip,
}: Props) {
  const canOpen = Boolean(companyId && voucherId && voucherNumber);

  return (
    <div className="space-y-1.5 text-sm leading-snug">
      <p>{statusLine}</p>
      <p className="text-muted-foreground text-xs">Source: Background offline attachment sync</p>
      {voucherNumber ? (
        <p>
          <span className="font-semibold">Voucher no: {voucherNumber}</span>
          {voucherKindLabel ? <span className="text-muted-foreground"> ({voucherKindLabel})</span> : null}
        </p>
      ) : voucherKindLabel ? (
        <p>Voucher type: {voucherKindLabel}</p>
      ) : null}
      {fileName ? <p>File: {fileName}</p> : null}
      {canOpen ? (
        <p>
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2 hover:no-underline"
            onClick={() => openVoucherEditFromPrefetchNotice(companyId!, voucherId!)}
          >
            Click here
          </button>
          <span> to open voucher {voucherNumber}</span>
        </p>
      ) : null}
      {showRefreshTip ? (
        <p className="text-muted-foreground text-xs">Tip: Open the voucher online once to refresh the attachment link.</p>
      ) : null}
    </div>
  );
}

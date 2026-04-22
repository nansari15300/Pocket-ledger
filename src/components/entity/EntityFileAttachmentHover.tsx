"use client";

import * as React from "react";
import { AttachmentHoverPortal } from "@/components/vouchers/AttachmentHoverPortal";
import { SingleAttachmentHoverPreviewBody } from "@/components/vouchers/attachmentHoverPreviewBody";
import { getAttachmentFormatLabel } from "@/lib/attachmentFormatLabel";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";

type Props = {
  /** Party / bank / tax `fileUrl` — khali ho to sirf children (no portal). */
  fileUrl?: string | null;
  children: React.ReactNode;
  /** Avatar rounded-full list row ke liye `inline-flex` default. */
  triggerClassName?: string;
};

/**
 * List + details entity avatar: same AttachmentHoverPortal frame as voucher file column.
 * Global switch OFF par portal andar se disabled (context).
 */
export function EntityFileAttachmentHover({ fileUrl, children, triggerClassName }: Props) {
  const u = fileUrl?.trim();
  if (!u) return <>{children}</>;
  const onPdfDbl =
    getAttachmentFormatLabel(u) === "PDF"
      ? (e: React.MouseEvent<HTMLDivElement>) => {
          e.stopPropagation();
          void openAttachmentInApp(u, { kind: "pdf" });
        }
      : undefined;
  return (
    <AttachmentHoverPortal
      triggerClassName={triggerClassName ?? "inline-flex"}
      onPreviewDoubleClick={onPdfDbl}
      preview={<SingleAttachmentHoverPreviewBody url={u} />}
    >
      {children}
    </AttachmentHoverPortal>
  );
}

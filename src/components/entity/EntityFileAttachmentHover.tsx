"use client";

import * as React from "react";
import { AttachmentHoverPortal } from "@/components/vouchers/AttachmentHoverPortal";
import { SingleAttachmentHoverPreviewBody } from "@/components/vouchers/attachmentHoverPreviewBody";

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
  return (
    <AttachmentHoverPortal
      triggerClassName={triggerClassName ?? "inline-flex"}
      preview={<SingleAttachmentHoverPreviewBody url={u} />}
    >
      {children}
    </AttachmentHoverPortal>
  );
}

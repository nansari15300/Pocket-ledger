"use client";

import * as React from "react";
import { AttachmentHoverPortal } from "@/components/vouchers/AttachmentHoverPortal";
import { SingleAttachmentHoverPreviewBody } from "@/components/vouchers/attachmentHoverPreviewBody";
import { getAttachmentFormatLabel } from "@/lib/attachmentFormatLabel";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFileHoverPreview } from "@/contexts/FileHoverPreviewContext";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";

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
  // Mobile UX: avatar hover preview disable, so only explicit tap/click preview flows remain.
  const isMobile = useIsMobile();
  const { mode: globalPreviewMode } = useFileHoverPreview();
  // `"null"` string / stale SQLite — bina attachment ke PDF portal mat kholo; lists me `ResolvedEntityAvatar` src bhi trim ke saath pass karo.
  const u = trimEntityFileUrlForPreview(fileUrl);
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
      disabled={isMobile}
      clickOpensPreview
      openOnHover={globalPreviewMode !== "off"}
      triggerClassName={triggerClassName ?? "inline-flex"}
      onPreviewDoubleClick={onPdfDbl}
      preview={<SingleAttachmentHoverPreviewBody url={u} />}
    >
      {children}
    </AttachmentHoverPortal>
  );
}

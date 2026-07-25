"use client";

import { useEffect, useRef } from "react";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { isCanonicalServerBridgeRenderer } from "@/lib/hostBridgeWrite";

/** Host main window: existing voucher attachments → bridge via loopback POST (staff preview/spinner fix). */
export function PlServerHostAttachmentDeltaBootstrap() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!isLocalAppServerHost() || isCanonicalServerBridgeRenderer()) return;
    ranRef.current = true;
    const timer = setTimeout(() => {
      void import("@/lib/plServerAttachmentUploadQueue").then(({ backfillPlServerHostAttachmentsToBridge }) =>
        backfillPlServerHostAttachmentsToBridge().catch((e) => {
          console.warn("[PlServerHostAttachmentDeltaBootstrap]", e);
        })
      );
    }, 3_000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

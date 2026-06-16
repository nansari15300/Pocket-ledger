"use client";

import { usePendingVoucherSync } from "@/hooks/usePendingVoucherSync";

/** Background retry: IndexedDB `local:` pending → Firebase Storage + Firestore HTTPS patch. */
export function PendingAttachmentSyncBridge() {
  usePendingVoucherSync({ enabled: true });
  return null;
}

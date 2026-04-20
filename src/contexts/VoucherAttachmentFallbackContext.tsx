"use client";

import * as React from "react";

/** Set in AddVoucherDialog so FilePreview can refetch `fileUrls` when `local:` IndexedDB blob is missing. */
export type VoucherAttachmentFallbackValue = {
  companyId: string;
  voucherId: string;
};

export const VoucherAttachmentFallbackContext = React.createContext<VoucherAttachmentFallbackValue | null>(null);

export function useVoucherAttachmentFallback(): VoucherAttachmentFallbackValue | null {
  return React.useContext(VoucherAttachmentFallbackContext);
}

export function pickStringUrlsFromFiles(files: readonly unknown[]): string[] {
  return files.filter((f): f is string => typeof f === "string");
}

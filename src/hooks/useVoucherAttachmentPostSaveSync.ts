"use client";

import { useEffect } from "react";
import {
  incomingVoucherFileUrlsLookStaleVersusSaved,
  isLocalToRemoteAttachmentUpgrade,
} from "@/lib/voucherFormAttachmentSave";
import { voucherAttachmentUrlsForFormState } from "@/lib/voucherAttachmentNormalize";
import { shouldSuggestPdfAsImage } from "@/lib/voucherAttachmentPdfAsImage";

/** Outbox flush / Firestore snapshot: sync parent `voucher.fileUrls` into form without stale overwrites. */
export function useVoucherAttachmentPostSaveSync(params: {
  traceSource: string;
  companyId: string | null | undefined;
  voucher: { id?: string; fileUrls?: unknown; unassignedFile?: unknown } | null | undefined;
  savedVoucherId: string | null;
  files: (File | string)[];
  setFiles: React.Dispatch<React.SetStateAction<(File | string)[]>>;
  initialFilesRef: React.MutableRefObject<string[]>;
  savedFileUrlsSnapshotRef: React.MutableRefObject<string[] | null>;
  isFileDirty: boolean;
  setSavePdfAsImage: (value: boolean) => void;
}): void {
  const {
    traceSource,
    companyId,
    voucher,
    savedVoucherId,
    files,
    setFiles,
    initialFilesRef,
    savedFileUrlsSnapshotRef,
    isFileDirty,
    setSavePdfAsImage,
  } = params;

  useEffect(() => {
    if (!voucher?.id || savedVoucherId !== voucher.id) return;
    const hasUnsavedFilePick = files.some((f) => f instanceof File);
    if (hasUnsavedFilePick) return;
    if (isFileDirty) return;
    const incoming = voucherAttachmentUrlsForFormState(voucher).filter((f): f is string => typeof f === "string");
    const cur = files.filter((f): f is string => typeof f === "string");
    const snap = savedFileUrlsSnapshotRef.current;
    if (snap) {
      if (incomingVoucherFileUrlsLookStaleVersusSaved(snap, incoming)) return;
      if (isLocalToRemoteAttachmentUpgrade(snap, incoming)) {
        savedFileUrlsSnapshotRef.current = null;
      } else if (snap.length > 0 && JSON.stringify(incoming) === JSON.stringify(snap)) {
        savedFileUrlsSnapshotRef.current = null;
      }
    }
    if (JSON.stringify(incoming) === JSON.stringify(cur)) return;
    const explicitEmptyFileUrls =
      Object.prototype.hasOwnProperty.call(voucher, "fileUrls") &&
      Array.isArray(voucher.fileUrls) &&
      voucher.fileUrls.length === 0;
    if (!snap && cur.length > 0 && incoming.length === 0 && !explicitEmptyFileUrls) {
      return;
    }
    if (cur.length > incoming.length || (cur.length > 0 && incoming.length === 0)) {
      void import("@/lib/attachmentDeleteTrace").then((m) =>
        m.logAttachWipe({
          source: `${traceSource}.voucherFileUrlsEffect`,
          reason: "form_sync_shrunk_from_voucher_prop",
          companyId: companyId ?? undefined,
          voucherId: voucher?.id,
          beforeUrls: cur,
          afterUrls: incoming,
          extra: {
            isFileDirty,
            snap: snap ?? null,
            voucherFileUrls: Array.isArray(voucher?.fileUrls) ? voucher.fileUrls : null,
          },
        })
      );
    }
    setFiles(incoming);
    initialFilesRef.current = [...incoming];
    setSavePdfAsImage(shouldSuggestPdfAsImage(incoming));
  }, [
    traceSource,
    voucher,
    savedVoucherId,
    files,
    isFileDirty,
    companyId,
    setFiles,
    initialFilesRef,
    savedFileUrlsSnapshotRef,
    setSavePdfAsImage,
  ]);
}

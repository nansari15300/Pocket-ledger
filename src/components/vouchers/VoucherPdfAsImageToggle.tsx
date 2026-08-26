"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { AttachmentPdfOptionHelpPopover } from "@/components/vouchers/AttachmentPdfOptionHelpPopover";
import {
  LOCK_PDF_AS_PDF_HELP,
  normalizeLockedPdfFileUrls,
  readLockPdfAsPdfPreference,
  resolveLockPdfAsPdfUiState,
  SAVE_PDF_AS_JPEG_HELP,
  writeLockPdfAsPdfPreference,
  writeMasterSavePdfAsImagePreference,
} from "@/lib/attachmentPdfOptions";
import usePermissions from "@/hooks/usePermissions";

/** Voucher / master attach: PDF → JPEG + Lock as PDF options. */
export function AttachmentPdfOptionsPanel({
  savePdfAsImage,
  onSavePdfAsImageChange,
  lockPdfAsPdf,
  onLockPdfAsPdfChange,
  existingLockedPdfFileUrls,
  disabled,
  className,
  savePdfAsImageId = "voucher-save-pdf-as-image",
  lockPdfAsPdfId = "voucher-lock-pdf-as-pdf",
}: {
  savePdfAsImage: boolean;
  onSavePdfAsImageChange: (v: boolean) => void;
  lockPdfAsPdf?: boolean;
  onLockPdfAsPdfChange?: (v: boolean) => void;
  existingLockedPdfFileUrls?: readonly string[];
  disabled?: boolean;
  className?: string;
  savePdfAsImageId?: string;
  lockPdfAsPdfId?: string;
}) {
  const { can } = usePermissions();
  const canUnlockLockedPdf = can("unlock_locked_pdf");

  const [lockPref, setLockPref] = React.useState(() => {
    if (lockPdfAsPdf !== undefined) return lockPdfAsPdf;
    const persisted = normalizeLockedPdfFileUrls(existingLockedPdfFileUrls);
    if (persisted.length > 0) return true;
    return readLockPdfAsPdfPreference(false);
  });

  React.useEffect(() => {
    if (lockPdfAsPdf !== undefined) setLockPref(lockPdfAsPdf);
  }, [lockPdfAsPdf]);

  React.useEffect(() => {
    const persisted = normalizeLockedPdfFileUrls(existingLockedPdfFileUrls);
    if (persisted.length > 0 && lockPdfAsPdf === undefined) {
      setLockPref(true);
    }
  }, [existingLockedPdfFileUrls, lockPdfAsPdf]);

  const lockUi = resolveLockPdfAsPdfUiState({
    preference: lockPref,
    existingLockedPdfFileUrls,
    canUnlockLockedPdf,
  });

  const lockChecked = lockUi.checked;
  const jpegDisabled = disabled || lockChecked;

  const setLock = (next: boolean) => {
    if (!next && lockUi.disableUncheck) return;
    setLockPref(next);
    writeLockPdfAsPdfPreference(next);
    onLockPdfAsPdfChange?.(next);
    if (next && savePdfAsImage) {
      onSavePdfAsImageChange(false);
      writeMasterSavePdfAsImagePreference(false);
    }
  };

  const setJpeg = (next: boolean) => {
    if (jpegDisabled) return;
    onSavePdfAsImageChange(next);
    writeMasterSavePdfAsImagePreference(next);
    if (next && lockChecked) {
      setLock(true);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex w-fit max-w-full flex-col space-y-1.5 rounded-md border border-dashed border-muted-foreground/25 bg-muted/20 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground",
        disabled && "opacity-50",
        className
      )}
    >
      <label
        htmlFor={savePdfAsImageId}
        className={cn(
          "flex cursor-pointer items-start gap-2",
          jpegDisabled && "cursor-not-allowed"
        )}
      >
        <Checkbox
          id={savePdfAsImageId}
          checked={savePdfAsImage && !lockChecked}
          onCheckedChange={(v) => setJpeg(v === true)}
          disabled={jpegDisabled}
          className="mt-0.5 shrink-0"
        />
        <span className="flex items-start gap-1">
          <span className="font-medium text-foreground">Save PDF as JPEG image</span>
          <AttachmentPdfOptionHelpPopover
            label="Save PDF as JPEG image"
            description={SAVE_PDF_AS_JPEG_HELP}
          />
        </span>
      </label>

      <label
        htmlFor={lockPdfAsPdfId}
        className={cn(
          "flex cursor-pointer items-start gap-2",
          (disabled || lockUi.disableUncheck) && "cursor-not-allowed"
        )}
      >
        <Checkbox
          id={lockPdfAsPdfId}
          checked={lockChecked}
          onCheckedChange={(v) => setLock(v === true)}
          disabled={disabled || lockUi.disableUncheck}
          className="mt-0.5 shrink-0"
        />
        <span className="flex items-start gap-1">
          <span className="font-medium text-foreground">Lock As Pdf</span>
          <AttachmentPdfOptionHelpPopover
            label="Lock As Pdf"
            description={LOCK_PDF_AS_PDF_HELP}
          />
        </span>
      </label>
    </div>
  );
}

/** @deprecated Use AttachmentPdfOptionsPanel — kept for imports. */
export function VoucherPdfAsImageToggle({
  checked,
  onCheckedChange,
  disabled,
  className,
  id = "voucher-save-pdf-as-image",
  existingLockedPdfFileUrls,
  lockPdfAsPdf,
  onLockPdfAsPdfChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  existingLockedPdfFileUrls?: readonly string[];
  lockPdfAsPdf?: boolean;
  onLockPdfAsPdfChange?: (v: boolean) => void;
}) {
  return (
    <AttachmentPdfOptionsPanel
      savePdfAsImage={checked}
      onSavePdfAsImageChange={onCheckedChange}
      lockPdfAsPdf={lockPdfAsPdf}
      onLockPdfAsPdfChange={onLockPdfAsPdfChange}
      existingLockedPdfFileUrls={existingLockedPdfFileUrls}
      disabled={disabled}
      className={className}
      savePdfAsImageId={id}
    />
  );
}

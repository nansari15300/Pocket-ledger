"use client";

/**
 * Party form jaisa: Profile photo + Documents (96px tiles) + optional narration —
 * bank / staff / tax / expense / item dialogs me reuse.
 */
import * as React from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { VoucherPdfAsImageToggle } from "@/components/vouchers/VoucherPdfAsImageToggle";
import { syntheticFileInputChangeEvent } from "@/lib/syntheticFileInputChangeEvent";
import { toast as sonnerToast } from "sonner";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { Textarea } from "@/components/ui/textarea";
import type { Control, FieldValues, Path } from "react-hook-form";
import {
  MASTER_SAVE_PDF_AS_IMAGE_STORAGE_KEY,
  readMasterSavePdfAsImagePreference,
} from "@/lib/entityProfileLocalFiles";

const DOC_SIZE = 96;

/** Statement File column note — entity name se sentence banao */
function statementFileNote(entityLabel: string) {
  return (
    <p className="mb-1 text-[10px] text-muted-foreground">
      On the {entityLabel} statement they show on the opening balance row under the{" "}
      <span className="font-medium">File</span> column (green tick), like voucher attachments.
    </p>
  );
}

export function MasterPdfAsImageToggle({
  id = "master-save-pdf-as-image",
  disabled,
  className,
}: {
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    setChecked(readMasterSavePdfAsImagePreference(false));
  }, []);

  const handleChange = (next: boolean) => {
    setChecked(next);
    try {
      window.localStorage.setItem(MASTER_SAVE_PDF_AS_IMAGE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage optional */
    }
  };

  return (
    <VoucherPdfAsImageToggle
      id={id}
      checked={checked}
      onCheckedChange={handleChange}
      disabled={disabled}
      className={className}
    />
  );
}

export function EntityProfilePhotoBlock({
  file,
  onPickClick,
  fileInputRef,
  onAvatarChange,
  onRemoveAvatar,
  canAddAvatar,
  inputId = "entity-avatar-input",
  attachmentCompanyId,
  attachmentReusePlaceKey,
}: {
  file: File | string | null;
  onPickClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
  canAddAvatar: boolean;
  inputId?: string;
  attachmentCompanyId?: string;
  attachmentReusePlaceKey?: string | null;
}) {
  return (
    <FormItem>
      <FormLabel>Profile photo</FormLabel>
      {!canAddAvatar ? (
        <p className="text-xs text-muted-foreground">
          Upgrade plan to change profile photo.{" "}
          <Link href="/billing" className="font-medium text-primary underline hover:no-underline">
            Upgrade
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {file ? (
            <FilePreview
              file={file}
              onRemove={onRemoveAvatar}
              size={DOC_SIZE}
              attachmentCompanyId={attachmentCompanyId}
              attachmentReusePlaceKey={attachmentReusePlaceKey}
            />
          ) : null}
          {!file ? (
            <FormControl>
              {/* 2s hold = clipboard attachment paste (sirf image); tap = picker */}
              <AttachmentHoldPasteSurface
                enabled={canAddAvatar}
                onShortActivate={onPickClick}
                onPastedFiles={(incoming) => {
                  const img = incoming[0];
                  if (!img?.type.startsWith("image/")) {
                    sonnerToast.error("Profile photo: images only");
                    return;
                  }
                  void onAvatarChange(syntheticFileInputChangeEvent([img]));
                }}
                className="relative flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary"
              >
                <Upload className="h-6 w-6" />
                <span className="mt-1 px-1 text-center text-xs">Add photo</span>
                <Input
                  id={inputId}
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={onAvatarChange}
                  accept="image/*"
                />
              </AttachmentHoldPasteSurface>
            </FormControl>
          ) : null}
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">Images only — shown on profile / avatar.</p>
    </FormItem>
  );
}

export function EntityDocumentsBlock({
  docSlots,
  onRemoveDoc,
  onAddClick,
  docsInputRef,
  onDocsChange,
  canAttachDocuments,
  entityStatementLabel,
  inputId = "entity-docs-input",
  attachmentCompanyId,
  setDocSlots,
  attachmentReusePlaceKey,
}: {
  docSlots: Array<File | string>;
  onRemoveDoc: (idx: number) => void;
  onAddClick: () => void;
  docsInputRef: React.RefObject<HTMLInputElement | null>;
  onDocsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  canAttachDocuments: boolean;
  /** e.g. "party", "bank account", "staff", "tax", "income/expense account", "item" */
  entityStatementLabel: string;
  inputId?: string;
  attachmentCompanyId?: string;
  /** Paste/Reuse HTTPS link (same company) — no re-upload. */
  setDocSlots?: React.Dispatch<React.SetStateAction<Array<File | string>>>;
  attachmentReusePlaceKey?: string | null;
}) {
  // Edit mode: saare slots string URL hon to full-screen viewer me ← → / swipe same set
  const galleryUrls =
    docSlots.length > 1 && docSlots.every((s): s is string => typeof s === "string") ? docSlots : null;

  return (
    <FormItem>
      <FormLabel>Documents</FormLabel>
      <p className="mb-1 text-xs leading-snug text-muted-foreground">
        Optional supporting files (PDF or images — e.g. registration, agreement scans). Up to 5 files; stored with
        this record and available from the statement.
      </p>
      {statementFileNote(entityStatementLabel)}
      {!canAttachDocuments ? (
        <p className="text-xs text-muted-foreground">
          Upgrade for PDF/image attachments.{" "}
          <Link href="/billing" className="font-medium text-primary underline hover:no-underline">
            Upgrade
          </Link>
        </p>
      ) : (
        <div className="space-y-2">
          <MasterPdfAsImageToggle id={`${inputId}-pdf-as-image`} />
          <div className="flex flex-wrap items-start gap-2">
            {docSlots.map((slot, idx) => (
              <FilePreview
                key={typeof slot === "string" ? `${slot}-${idx}` : `${slot.name}-${idx}-${slot.size}`}
                file={slot}
                onRemove={() => onRemoveDoc(idx)}
                size={DOC_SIZE}
                attachmentCompanyId={attachmentCompanyId}
                attachmentReusePlaceKey={attachmentReusePlaceKey}
                attachmentGallery={galleryUrls ? { urls: galleryUrls, startIndex: idx } : undefined}
              />
            ))}
            {docSlots.length < 5 ? (
              <FormControl>
                <AttachmentHoldPasteSurface
                  enabled={canAttachDocuments}
                  onShortActivate={onAddClick}
                  onPastedFiles={(incoming) => {
                    if (docSlots.length >= 5) return;
                    void onDocsChange(syntheticFileInputChangeEvent(incoming));
                  }}
                  voucherAttachmentReuse={
                    setDocSlots
                      ? {
                          currentFiles: docSlots,
                          setFiles: setDocSlots,
                          maxFiles: 5,
                        }
                      : undefined
                  }
                  className="relative flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary"
                >
                  <Upload className="h-6 w-6" />
                  <span className="mt-1 px-1 text-center text-xs">PDF / image</span>
                  <Input
                    id={inputId}
                    type="file"
                    className="hidden"
                    ref={docsInputRef}
                    onChange={onDocsChange}
                    accept="image/*,application/pdf"
                    multiple
                  />
                </AttachmentHoldPasteSurface>
              </FormControl>
            ) : null}
          </div>
        </div>
      )}
    </FormItem>
  );
}

export function EntityOpeningBalanceNarrationField<T extends FieldValues>({
  control,
  name,
  detailLabel,
}: {
  control: Control<T>;
  name: Path<T>;
  /** e.g. "party detail", "bank account", "item" */
  detailLabel: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }: { field: any }) => (
        <FormItem>
          <FormLabel>Opening balance narration (Optional)</FormLabel>
          <FormControl>
            <Textarea
              placeholder="e.g. OB brought forward…"
              className="min-h-[72px] resize-y"
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          <p className="text-[10px] text-muted-foreground">
            Shown on the {detailLabel} statement under the Opening Balance row (voucher-style narration).
          </p>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

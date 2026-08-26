"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { syntheticFileInputChangeEvent } from "@/lib/syntheticFileInputChangeEvent";
import { toast as sonnerToast } from "sonner";
import type { useLoanLiabilityAttachments } from "./useLoanLiabilityAttachments";

const DOC_SIZE = 96;
const ADD_TILE_CLASS =
  "flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary";

type Attachments = ReturnType<typeof useLoanLiabilityAttachments>;

export function LoanLiabilityProfilePhotoField({ attachments }: { attachments: Attachments }) {
  const {
    profileFile,
    avatarInputRef,
    handleAvatarChange,
    removeProfile,
    canAddAvatar,
    companyId,
    attachmentReusePlaceKey,
    profileReuseConfig,
  } = attachments;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Profile photo</Label>
      {!canAddAvatar ? (
        <p className="text-xs text-muted-foreground">
          Upgrade plan to change profile photo.{" "}
          <Link href="/billing" className="font-medium text-primary underline hover:no-underline">
            Upgrade
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {profileFile ? (
            <FilePreview
              file={profileFile}
              onRemove={removeProfile}
              size={DOC_SIZE}
              attachmentCompanyId={companyId || undefined}
              attachmentReusePlaceKey={attachmentReusePlaceKey}
            />
          ) : (
            <>
              <AttachmentHoldPasteSurface
                enabled={canAddAvatar}
                onShortActivate={() => avatarInputRef.current?.click()}
                onPastedFiles={(incoming) => {
                  const img = incoming[0];
                  if (!img?.type.startsWith("image/")) {
                    sonnerToast.error("Profile photo: images only");
                    return;
                  }
                  void handleAvatarChange(syntheticFileInputChangeEvent([img]));
                }}
                voucherAttachmentReuse={profileReuseConfig}
                className={ADD_TILE_CLASS}
              >
                <Upload className="h-6 w-6" />
                <span className="mt-1 px-1 text-center text-xs">Add photo</span>
              </AttachmentHoldPasteSurface>
              <Input
                id="loan-liability-avatar-input"
                type="file"
                className="sr-only"
                ref={avatarInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
              />
            </>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Images only — shown on profile / avatar.</p>
    </div>
  );
}

export function LoanLiabilityDocumentsField({
  attachments,
  hideHeading,
}: {
  attachments: Attachments;
  hideHeading?: boolean;
}) {
  const {
    docSlots,
    docsInputRef,
    handleDocumentsChange,
    removeDocAt,
    canAttachDocuments,
    companyId,
    attachmentReusePlaceKey,
    docReuseConfig,
  } = attachments;

  const galleryUrls =
    docSlots.length > 1 && docSlots.every((s): s is string => typeof s === "string") ? docSlots : null;

  return (
    <div className="space-y-1.5">
      {!hideHeading ? <Label className="text-xs">Documents</Label> : null}
      {!canAttachDocuments ? (
        <p className="text-xs text-muted-foreground">
          Upgrade for PDF/image attachments.{" "}
          <Link href="/billing" className="font-medium text-primary underline hover:no-underline">
            Upgrade
          </Link>
        </p>
      ) : (
        <RestrictedFileUploader>
          <div className="flex flex-wrap items-start gap-2">
            {docSlots.map((slot, idx) => (
              <FilePreview
                key={typeof slot === "string" ? `${slot}-${idx}` : `${slot.name}-${idx}-${slot.size}`}
                file={slot}
                onRemove={() => removeDocAt(idx)}
                size={DOC_SIZE}
                attachmentCompanyId={companyId || undefined}
                attachmentReusePlaceKey={attachmentReusePlaceKey}
                attachmentGallery={galleryUrls ? { urls: galleryUrls, startIndex: idx } : undefined}
              />
            ))}
            {docSlots.length < 5 ? (
              <>
                <AttachmentHoldPasteSurface
                  enabled={canAttachDocuments}
                  onShortActivate={() => docsInputRef.current?.click()}
                  onPastedFiles={(incoming) => {
                    if (docSlots.length >= 5) return;
                    void handleDocumentsChange(syntheticFileInputChangeEvent(incoming));
                  }}
                  voucherAttachmentReuse={docReuseConfig}
                  className={ADD_TILE_CLASS}
                >
                  <Upload className="h-6 w-6" />
                  <span className="mt-1 px-1 text-center text-xs">PDF / image</span>
                </AttachmentHoldPasteSurface>
                <Input
                  id="loan-liability-docs-input"
                  type="file"
                  className="sr-only"
                  ref={docsInputRef}
                  onChange={handleDocumentsChange}
                  accept="image/*,application/pdf"
                  multiple
                />
              </>
            ) : null}
          </div>
        </RestrictedFileUploader>
      )}
    </div>
  );
}

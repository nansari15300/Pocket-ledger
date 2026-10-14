"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { mdc, mdcMobileHeaderAvatarNoPhotoData } from "@/lib/mobileDetailChrome";

function initialsFromName(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA"
  );
}

/** Merged mobile master-detail header — square avatar, list-dock chevron blue when no photo. */
export function MobileMasterDetailHeaderAvatar({
  name,
  attachmentUrl,
  fallbackSlot,
  previewTitle,
}: {
  name: string;
  attachmentUrl?: string | null;
  fallbackSlot?: React.ReactNode;
  previewTitle?: string;
}) {
  const label = previewTitle ?? name;
  const initials = initialsFromName(name || "NA");
  const hasAvatarImage = Boolean(attachmentUrl?.trim());
  const openPreview = () => {
    if (!attachmentUrl?.trim()) return;
    void openAttachmentInApp(attachmentUrl, { title: label });
  };

  return (
    <EntityFileAttachmentHover fileUrl={attachmentUrl ?? undefined} triggerClassName="inline-flex h-full w-full">
      <button
        type="button"
        {...(!hasAvatarImage ? mdcMobileHeaderAvatarNoPhotoData : {})}
        className={cn(
          "inline-flex h-full w-full min-h-[2.75rem] items-stretch justify-center overflow-hidden rounded-lg border",
          hasAvatarImage ? "border-border/80 bg-muted/30" : mdc.mobileHeaderAvatarNoPhoto
        )}
        onClick={openPreview}
        aria-label={`Preview ${label} avatar`}
      >
        <ResolvedEntityAvatar
          className="h-full w-full rounded-lg text-sm font-semibold"
          src={attachmentUrl ?? undefined}
          alt={label}
          fallbackText={initials}
          fallbackSlot={fallbackSlot}
          fallbackClassName={hasAvatarImage ? undefined : mdc.mobileHeaderAvatarNoPhotoFallback}
        />
      </button>
    </EntityFileAttachmentHover>
  );
}

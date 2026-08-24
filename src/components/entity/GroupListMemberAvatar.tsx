"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { getEntityListInitials } from "@/lib/groupListExpand";
import { MASTER_LIST_AVATAR_CN, MASTER_LIST_AVATAR_FALLBACK_CN } from "@/lib/masterListChrome";

export type GroupListMemberAvatarProps = {
  name: string;
  fileUrl?: string | null;
  fileUrls?: string[] | null;
  companyId?: string;
  fallbackSlot?: React.ReactNode;
  className?: string;
  hoverTriggerClassName?: string;
};

export function GroupListMemberAvatar({
  name,
  fileUrl,
  fileUrls,
  companyId,
  fallbackSlot,
  className,
  hoverTriggerClassName = "inline-flex shrink-0 rounded-full",
}: GroupListMemberAvatarProps) {
  const previewUrl = trimEntityFileUrlForPreview(fileUrl ?? fileUrls?.[0]);

  return (
    <EntityFileAttachmentHover fileUrl={previewUrl} triggerClassName={hoverTriggerClassName}>
      <ResolvedEntityAvatar
        className={cn(MASTER_LIST_AVATAR_CN, className)}
        fallbackClassName={MASTER_LIST_AVATAR_FALLBACK_CN}
        companyId={companyId}
        src={previewUrl ?? undefined}
        alt={name}
        fallbackText={fallbackSlot ? undefined : getEntityListInitials(name)}
        fallbackSlot={fallbackSlot}
      />
    </EntityFileAttachmentHover>
  );
}

export function groupListMemberAvatarFromRow(
  member: {
    name: string;
    fileUrl?: string | null;
    fileUrls?: string[] | null;
    companyId?: string;
  },
  fallbackSlot?: React.ReactNode
) {
  return (
    <GroupListMemberAvatar
      name={member.name}
      fileUrl={member.fileUrl}
      fileUrls={member.fileUrls}
      companyId={member.companyId}
      fallbackSlot={fallbackSlot}
    />
  );
}

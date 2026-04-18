"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";

type Props = {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  /** Bank/Cash jaisa: Crown/Landmark icon — text initials ke bajay */
  fallbackSlot?: React.ReactNode;
  className?: string;
};

/**
 * `local:uuid` ya remote URL — party/bank/staff/item thumbnail; local PDF = fallback initials.
 */
export function ResolvedEntityAvatar({
  src,
  alt = "",
  fallbackText = "?",
  fallbackSlot,
  className,
}: Props) {
  const [localBlobUrl, setLocalBlobUrl] = React.useState<string | null>(null);
  const blobUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!src?.trim() || !isLocalFileRef(src)) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setLocalBlobUrl(null);
      return;
    }
    void (async () => {
      const blob = await getBlobFromLocalFileRef(src);
      if (cancelled) return;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (!blob || !(blob.type || "").toLowerCase().startsWith("image/")) {
        setLocalBlobUrl(null);
        return;
      }
      const u = URL.createObjectURL(blob);
      blobUrlRef.current = u;
      setLocalBlobUrl(u);
    })();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src]);

  const imageSrc =
    !src?.trim() ? undefined : isLocalFileRef(src) ? localBlobUrl ?? undefined : src;

  return (
    <Avatar className={className}>
      <AvatarImage src={imageSrc} alt={alt} />
      <AvatarFallback>{fallbackSlot ?? fallbackText}</AvatarFallback>
    </Avatar>
  );
}

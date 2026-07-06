"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  isLocalFileRef,
} from "@/lib/localPendingFiles";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { useCompany } from "@/hooks/useCompany";
import { readActiveAttachmentCompanyId } from "@/lib/firestorePermissionSuppress";

type Props = {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  /** Bank/Cash jaisa: Crown/Landmark icon — text initials ke bajay */
  fallbackSlot?: React.ReactNode;
  className?: string;
  /** Initials fallback — e.g. Inter Company sky pill */
  fallbackClassName?: string;
  /** Drive `opening/avatars` — shared folder download ke liye */
  companyId?: string;
};

/**
 * Master/detail avatar: `local:` + Firebase HTTPS + raw Storage path — pehle IndexedDB warm cache, phir online fetch;
 * image nahi (PDF) ya miss par fallback.
 */
export function ResolvedEntityAvatar({
  src,
  alt = "",
  fallbackText = "?",
  fallbackSlot,
  className,
  fallbackClassName,
  companyId: companyIdProp,
}: Props) {
  const { companyId: shellCompanyId } = useCompany();
  const attachmentCompanyId =
    companyIdProp ?? shellCompanyId ?? readActiveAttachmentCompanyId() ?? undefined;

  const [localBlobUrl, setLocalBlobUrl] = React.useState<string | null>(null);
  const blobUrlRef = React.useRef<string | null>(null);
  /** Remote HTTPS / `voucher-files/…` — sirf yahan banaya `blob:` revoke (local Capacitor displayUrl nahi). */
  const [remoteImgSrc, setRemoteImgSrc] = React.useState<string | undefined>(undefined);
  const remoteBlobRevokeRef = React.useRef<string | null>(null);

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
      if (isCapacitorNativeApp()) {
        // Native avatar fast-path: local pending image ko `convertFileSrc` URI se turant dikhao.
        const meta = getLocalFileRefMetaSync(src) ?? (await getLocalFileRefMeta(src));
        if (cancelled) return;
        const ct = String(meta?.contentType || "").toLowerCase();
        if (!meta?.displayUrl || !ct.startsWith("image/")) {
          setLocalBlobUrl(null);
          return;
        }
        setLocalBlobUrl(meta.displayUrl);
        return;
      }
      const blob = await getBlobFromLocalFileRef(src, {
        allowNativeRead: false,
        context: "ResolvedEntityAvatar",
        companyId: attachmentCompanyId,
      });
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
      if (blobUrlRef.current && !isCapacitorNativeApp()) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src, attachmentCompanyId]);

  React.useEffect(() => {
    let cancelled = false;
    const revokeRemote = () => {
      if (remoteBlobRevokeRef.current) {
        try {
          URL.revokeObjectURL(remoteBlobRevokeRef.current);
        } catch {
          /* ignore */
        }
        remoteBlobRevokeRef.current = null;
      }
    };

    if (!src?.trim() || isLocalFileRef(src)) {
      revokeRemote();
      setRemoteImgSrc(undefined);
      return;
    }

    revokeRemote();
    setRemoteImgSrc(undefined);
    const trimmed = src.trim();

    void (async () => {
      try {
        const blob = await getRemoteAttachmentBlobPreferOfflineCache(trimmed, undefined, {
          companyId: attachmentCompanyId,
        });
        if (cancelled) return;
        if (blob && blob.size > 0) {
          const kind = await sniffBlobKindForPreview(blob);
          if (cancelled) return;
          if (kind === "image") {
            const ou = URL.createObjectURL(blob);
            remoteBlobRevokeRef.current = ou;
            setRemoteImgSrc(ou);
            return;
          }
        }
        if (
          !cancelled &&
          /^https?:\/\//i.test(trimmed) &&
          typeof navigator !== "undefined" &&
          navigator.onLine
        ) {
          setRemoteImgSrc(trimmed);
        }
      } catch {
        if (!cancelled) setRemoteImgSrc(undefined);
      }
    })();

    return () => {
      cancelled = true;
      revokeRemote();
    };
  }, [src, attachmentCompanyId]);

  const imageSrc = !src?.trim()
    ? undefined
    : isLocalFileRef(src)
      ? localBlobUrl ?? undefined
      : remoteImgSrc;

  return (
    <Avatar className={className}>
      <AvatarImage src={imageSrc} alt={alt} />
      <AvatarFallback className={fallbackClassName}>{fallbackSlot ?? fallbackText}</AvatarFallback>
    </Avatar>
  );
}

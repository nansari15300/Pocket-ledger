"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import {
  isProfileAvatarImageFile,
  isProfileDocumentFile,
} from "@/lib/entityProfileLocalFiles";
import { compressImageForCompany } from "@/lib/attachmentCompressionUi";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { normalizeFileUrlsField } from "@/lib/voucherAttachmentNormalize";

export function useLoanLiabilityAttachments(staffId?: string, initial?: { fileUrl?: string | null; documentFileUrls?: string[] | null }) {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const { canAddAvatar, canAddFileImagePdf } = usePermissions();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);

  const [profileFile, setProfileFile] = useState<File | string | null>(initial?.fileUrl || null);
  const [docSlots, setDocSlots] = useState<Array<File | string>>(() =>
    normalizeFileUrlsField(initial?.documentFileUrls)
  );

  useEffect(() => {
    setProfileFile(initial?.fileUrl || null);
    setDocSlots(normalizeFileUrlsField(initial?.documentFileUrls));
  }, [staffId, initial?.fileUrl, initial?.documentFileUrls]);

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      if (!canAddAvatar) {
        e.target.value = "";
        toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow a profile photo." });
        return;
      }
      const inputFile = e.target.files[0];
      if (!inputFile || !isProfileAvatarImageFile(inputFile)) {
        e.target.value = "";
        toast({ variant: "destructive", title: "Image only", description: "Profile photo: JPG, PNG, WebP, etc." });
        return;
      }
      if (inputFile.size > MAX_IMAGE_BYTES_BEFORE_COMPRESS) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `Please select a file smaller than ${MAX_IMAGE_MB_BEFORE_COMPRESS}MB to compress.`,
        });
        e.target.value = "";
        return;
      }
      try {
        const { file: compressedFile } = await compressImageForCompany(inputFile, companyId);
        setProfileFile(compressedFile);
      } catch {
        toast({ variant: "destructive", title: "File Error", description: "Could not process the image." });
      }
      e.target.value = "";
    },
    [canAddAvatar, companyId, toast]
  );

  const handleDocumentsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      if (!canAttachDocuments) {
        e.target.value = "";
        toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow documents." });
        return;
      }
      const incoming = Array.from(e.target.files).filter(isProfileDocumentFile);
      setDocSlots((prev) => [...prev, ...incoming].slice(0, 5));
      e.target.value = "";
    },
    [canAttachDocuments, toast]
  );

  const removeProfile = useCallback(() => {
    setProfileFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }, []);

  const removeDocAt = useCallback((idx: number) => {
    setDocSlots((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const setProfileReuseFiles = useCallback(
    (updater: React.SetStateAction<Array<File | string>>) => {
      setProfileFile((prev) => {
        const current = prev ? [prev] : [];
        const next = typeof updater === "function" ? updater(current) : updater;
        const picked = next[next.length - 1] ?? null;
        if (!picked) return null;
        if (typeof picked === "string") return picked;
        if (!isProfileAvatarImageFile(picked)) {
          toast({ variant: "destructive", title: "Image only", description: "Profile photo: JPG, PNG, WebP, etc." });
          return prev;
        }
        void (async () => {
          try {
            const { file: compressedFile } = await compressImageForCompany(picked, companyId);
            setProfileFile(compressedFile);
          } catch {
            toast({ variant: "destructive", title: "File Error", description: "Could not process the image." });
          }
        })();
        return prev;
      });
    },
    [companyId, toast]
  );

  return {
    profileFile,
    docSlots,
    setDocSlots,
    avatarInputRef,
    docsInputRef,
    handleAvatarChange,
    handleDocumentsChange,
    removeProfile,
    removeDocAt,
    canAddAvatar,
    canAttachDocuments,
    companyId,
    attachmentReusePlaceKey: staffId ? `staff/${staffId}` : null,
    profileReuseConfig: {
      currentFiles: profileFile ? [profileFile] : [],
      setFiles: setProfileReuseFiles,
      maxFiles: 1,
    },
    docReuseConfig: {
      currentFiles: docSlots,
      setFiles: setDocSlots,
      maxFiles: 5,
    },
  };
}


"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import type { TaxGroup } from "@/components/tax/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, setDoc, collection, serverTimestamp, onSnapshot, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import {
  stageEntityAvatarAndDocuments,
  uploadEntityAvatarAndDocumentsRemote,
  isProfileAvatarImageFile,
  isProfileDocumentFile,
} from "@/lib/entityProfileLocalFiles";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import {
  EntityProfilePhotoBlock,
  EntityDocumentsBlock,
  EntityOpeningBalanceNarrationField,
} from "@/components/common/EntityProfileDocumentsNarrationFields";
import usePermissions from "@/hooks/usePermissions";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  MasterFormNameAcNoRow,
  MasterFormTwoColGrid,
  MasterMobileNoField,
} from "@/components/inter-company/MasterFormLayout";
import { interCompanyAcNoForNewEntity } from "@/lib/interCompany/interCompanyAccountNo";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, FileText, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateTaxGroupDialog } from "./CreateTaxGroupDialog";
import { Combobox } from "../ui/combobox";
import { compressFile } from "@/lib/compression";
import {
  MAX_IMAGE_BYTES_BEFORE_COMPRESS,
  MAX_IMAGE_BYTES_AFTER_COMPRESS,
  MAX_IMAGE_MB_BEFORE_COMPRESS,
} from "@/lib/fileUploadLimits";
import { fetchRemoteUrlAsFile, taxPrefillPartsFromTaxRow } from "@/lib/crossCompanyMasterPrefill";
import { toast as sonnerToast } from "sonner";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { format } from "date-fns";
import { isSystemParentGroup } from "@/lib/system-groups";
import { ensureUngroupedGroup, getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import {
  apkCloudCompanyOfflineViewOnly,
  apkEntityWriteUsesLocalSqliteMirror,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox, isLikelyOfflineFirestoreError } from "@/lib/localVoucherOutbox";


function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}


const formSchema = z.object({
  name: z.string().min(2, { message: "Tax name must be at least 2 characters." }),
  phone: z.string().optional(),
  rate: z.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot be over 100."),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
  groupId: z.string().optional(),
  openingBalanceNarration: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

export function CreateTaxForm({
  onTaxCreated,
  onCloseDialogRequest,
  groups,
  onNestedDialogOpenChange,
  prefillName,
}: {
  onTaxCreated?: (
    isSaveAndNew: boolean,
    newId: string,
    newTax?: { id: string; name: string; rate: number; balance?: number; companyId: string; groupId?: string }
  ) => void;
  onCloseDialogRequest?: () => void;
  groups: TaxGroup[];
  onNestedDialogOpenChange?: (open: boolean) => void;
  prefillName?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const { canAddAvatar, canAddFileImagePdf } = usePermissions();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  React.useEffect(() => { onNestedDialogOpenChange?.(isCreateGroupOpen); }, [isCreateGroupOpen, onNestedDialogOpenChange]);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  const [avatarToUpload, setAvatarToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const { dateSystem } = useDate();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const navigatorOnline = useNavigatorOnline();
  /** APK cloud company offline: tax create parity vouchers — Save band. */
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: "",
      rate: 0,
      openingBalance: 0,
      groupId: "",
      openingBalanceNarration: "",
    },
  });

  React.useEffect(() => {
    if (prefillName && prefillName.trim()) {
      form.setValue("name", prefillName.trim());
    }
  }, [prefillName, form]);

  React.useEffect(() => {
    const handlePrefillName = (event: Event) => {
      const ce = event as CustomEvent<string>;
      const name = String(ce.detail || "").trim();
      if (name) form.setValue("name", name, { shouldDirty: true, shouldValidate: true });
    };
    document.addEventListener("prefill-create-tax-name", handlePrefillName as EventListener);
    return () => document.removeEventListener("prefill-create-tax-name", handlePrefillName as EventListener);
  }, [form]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!companyId || !user?.uid) return;
      if (apkEntityWriteUsesLocalSqliteMirror(company)) {
        // Local-only mode: keep tax default on local ungrouped without Firestore call.
        const current = form.getValues("groupId");
        if (!current) form.setValue("groupId", getUngroupedGroupId("tax"), { shouldDirty: false });
        return;
      }
      // Keep Tax create default on canonical Ungrouped bucket.
      const ungroupedId = await ensureUngroupedGroup(companyId, user.uid, "tax");
      if (!alive) return;
      const current = form.getValues("groupId");
      if (!current) form.setValue("groupId", ungroupedId, { shouldDirty: false });
    })();
    return () => {
      alive = false;
    };
  }, [companyId, user?.uid, form]);
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const compressedFile = await compressFile(inputFile);
      if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large After Compression",
          description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
        });
        e.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(compressedFile);
      setAvatarToUpload({ file: compressedFile, preview });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "File Error", description: "Could not process the file." });
    }
    e.target.value = "";
  };

  const handleDocumentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAttachDocuments) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow documents." });
      return;
    }
    const incoming = Array.from(e.target.files).filter(isProfileDocumentFile);
    setDocumentFiles((prev) => [...prev, ...incoming].slice(0, 5));
    e.target.value = "";
  };

  const removeAvatar = () => {
    if (avatarToUpload?.preview) URL.revokeObjectURL(avatarToUpload.preview);
    setAvatarToUpload(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const removeDocAt = (idx: number) => setDocumentFiles((prev) => prev.filter((_, i) => i !== idx));

  const clearUploads = () => {
    removeAvatar();
    setDocumentFiles([]);
    if (docsInputRef.current) docsInputRef.current.value = "";
  };

  /** Copy chip / Save & Copy To: source tax row + HTTPS avatar/docs → local staging (`prefill-create-tax-from-row`). */
  React.useEffect(() => {
    const handlePrefillRow = async (event: Event) => {
      const ce = event as CustomEvent<{ rowPayload?: Record<string, unknown> }>;
      const row = ce.detail?.rowPayload;
      if (!row || typeof row !== "object") return;
      const { patch, remoteAvatarUrl, remoteDocumentUrls } = taxPrefillPartsFromTaxRow(row);
      setAvatarToUpload((prev) => {
        if (prev?.preview) URL.revokeObjectURL(prev.preview);
        return null;
      });
      setDocumentFiles([]);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (docsInputRef.current) docsInputRef.current.value = "";
      form.reset({
        name: "",
        rate: 0,
        openingBalance: 0,
        openingBalanceDate: undefined,
        groupId: "",
        openingBalanceNarration: "",
        ...patch,
      } as z.infer<typeof formSchema>);
      if (remoteAvatarUrl?.trim() && canAddAvatar) {
        try {
          const raw = await fetchRemoteUrlAsFile(remoteAvatarUrl, "tax-avatar.jpg");
          if (raw) {
            let f = raw;
            try {
              f = await compressFile(raw);
            } catch {
              /* raw */
            }
            if (f.size > MAX_IMAGE_BYTES_AFTER_COMPRESS) {
              toast({
                variant: "destructive",
                title: "Avatar too large",
                description: "Fetched image could not be compressed enough.",
              });
            } else {
              const preview = URL.createObjectURL(f);
              setAvatarToUpload({ file: f, preview });
            }
          }
        } catch {
          /* fetch fail — scalars phir bhi set */
        }
      }
      if (remoteDocumentUrls?.length && canAttachDocuments) {
        const files: File[] = [];
        for (let i = 0; i < Math.min(remoteDocumentUrls.length, 5); i++) {
          const url = remoteDocumentUrls[i];
          const guessed = url.toLowerCase().includes(".pdf") ? `tax-doc-${i + 1}.pdf` : `tax-doc-${i + 1}.jpg`;
          const f = await fetchRemoteUrlAsFile(url, guessed);
          if (f) files.push(f);
        }
        if (files.length) setDocumentFiles(files);
      }
    };
    document.addEventListener("prefill-create-tax-from-row", handlePrefillRow as EventListener);
    return () => document.removeEventListener("prefill-create-tax-from-row", handlePrefillRow as EventListener);
  }, [form, canAddAvatar, canAttachDocuments, toast]);

  function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    void (async () => {
      const isValid = await form.trigger();
      if (!isValid) {
        sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
        return;
      }
      if (apkOfflineViewOnly) {
        sonnerToast.error("Offline — view only.");
        return;
      }
      if (!options.saveAndNew) {
        onCloseDialogRequest?.();
      } else {
        setIsLoading(true);
      }
      void processAndSave(form.getValues(), options.saveAndNew || false);
    })();
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in and have a company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsLoading(false);
      return;
    }

    const toastId = sonnerToast.loading("Saving tax...");
    setIsLoading(true);
    
    try {
      if (apkEntityWriteUsesLocalSqliteMirror(company)) {
        const totalAttachBytesLocal =
          (avatarToUpload?.file.size ?? 0) + documentFiles.reduce((s, f) => s + f.size, 0);
        if (totalAttachBytesLocal > 0) {
          const limitCheck = await checkStorageLimit(
            companyId,
            company?.planId,
            { attachmentsBytes: totalAttachBytesLocal, storageBytes: totalAttachBytesLocal },
            company?.storageOption
          );
          if (!limitCheck.allowed) {
            sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
            setIsLoading(false);
            return;
          }
        }
        const localId = createLocalEntityId("tax");
        const interCompanyAccountNo = await interCompanyAcNoForNewEntity("tax");
        const stagedLocal = await stageEntityAvatarAndDocuments({
          companyId,
          collectionSeg: "taxes",
          entityId: localId,
          avatarFile: avatarToUpload?.file ?? null,
          documentFiles,
        });
        const payload = {
          id: localId,
          name: values.name.trim(),
          phone: values.phone?.trim() || null,
          rate: values.rate,
          openingBalance: values.openingBalance || 0,
          openingBalanceDate: values.openingBalanceDate || null,
          openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
          groupId: values.groupId?.trim() || getUngroupedGroupId("tax"),
          ownerId: user.uid,
          companyId,
          balance: values.openingBalance || 0,
          createdAt: new Date().toISOString(),
          interCompanyAccountNo,
          fileUrl: stagedLocal.fileUrl ?? null,
          ...(stagedLocal.documentFileUrls.length ? { documentFileUrls: stagedLocal.documentFileUrls } : {}),
          isDeleted: false,
        };
        await upsertCompanyDocInBrowserDb(companyId, "taxes", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "taxes", "create", localId, payload);
        const showSyncHint = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" && user.uid !== "local_guest_user";
        sonnerToast.success(showSyncHint ? "Saved. Will sync when online." : "Saved.", {
          id: toastId,
          description: showSyncHint
            ? `"${values.name}" was saved locally and will sync when online.`
            : `"${values.name}" was saved locally.`,
        });
        if (saveAndNew) {
          form.reset({
            name: "",
            rate: 0,
            openingBalance: 0,
            openingBalanceDate: undefined,
            groupId: getUngroupedGroupId("tax"),
            openingBalanceNarration: "",
          });
          clearUploads();
        }
        const newTax = {
          id: localId,
          name: values.name.trim(),
          rate: values.rate,
          balance: values.openingBalance || 0,
          companyId,
          groupId: values.groupId || undefined,
        };
        onTaxCreated?.(saveAndNew, localId, newTax);
        return;
      }

      // Recycle-bin duplicate flow: restore or create-new on user choice.
      const duplicateDecision = await resolveRecycleBinDuplicate({
        companyId,
        collectionName: "taxes",
        name: values.name.trim(),
        entityLabel: "Tax",
      });
      if (duplicateDecision.decision === "active_exists") {
        sonnerToast.error("Duplicate Tax Name", {
          id: toastId,
          description: "A tax with this name already exists.",
        });
        setIsLoading(false);
        return;
      }
      if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
        const restoredTax = {
          id: duplicateDecision.restoredId,
          name: values.name.trim(),
          rate: values.rate,
          balance: values.openingBalance || 0,
          companyId,
          groupId: values.groupId || undefined,
        };
        sonnerToast.success("Tax Restored!", {
          id: toastId,
          description: `"${values.name.trim()}" was restored from Recycle Bin.`,
        });
        onTaxCreated?.(saveAndNew, duplicateDecision.restoredId, restoredTax as any);
        setIsLoading(false);
        return;
      }
      
      const totalAttachBytes =
        (avatarToUpload?.file.size ?? 0) + documentFiles.reduce((s, f) => s + f.size, 0);
      if (totalAttachBytes > 0) {
        const limitCheck = await checkStorageLimit(
          companyId,
          company?.planId,
          { attachmentsBytes: totalAttachBytes, storageBytes: totalAttachBytes },
          company?.storageOption
        );
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
      }

      const resolvedGroupId =
        values.groupId?.trim() || (await ensureUngroupedGroup(companyId!, user.uid, "tax"));
      const taxRef = doc(collection(firestore, `companies/${companyId}/taxes`));
      const newTaxId = taxRef.id;
      const staged = await uploadEntityAvatarAndDocumentsRemote({
        companyId: companyId!,
        collectionSeg: "taxes",
        entityId: newTaxId,
        avatarFile: avatarToUpload?.file ?? null,
        documentFiles,
      });

      const interCompanyAccountNo = await interCompanyAcNoForNewEntity("tax");
      await setDoc(taxRef, {
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        rate: values.rate,
        openingBalance: values.openingBalance || 0,
        openingBalanceDate: values.openingBalanceDate || null,
        openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
        groupId: resolvedGroupId || getUngroupedGroupId("tax"),
        ownerId: user.uid,
        companyId,
        balance: values.openingBalance || 0,
        createdAt: serverTimestamp(),
        interCompanyAccountNo,
        fileUrl: staged.fileUrl,
        ...(staged.documentFileUrls.length ? { documentFileUrls: staged.documentFileUrls } : {}),
        isDeleted: false,
      });

      if (totalAttachBytes > 0) {
        await incrementCompanyStorage(companyId, {
          attachmentsBytes: totalAttachBytes,
          storageBytes: totalAttachBytes,
        });
      }

      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, "taxes", newTaxId, 0, values.openingBalance);
      }

      sonnerToast.success("Tax Created!", {
        id: toastId,
        description: `"${values.name}" has been added.`,
      });

      if (saveAndNew) {
        form.reset({
          name: "",
          rate: 0,
          openingBalance: 0,
          openingBalanceDate: undefined,
          groupId: getUngroupedGroupId("tax"),
          openingBalanceNarration: "",
        });
        clearUploads();
      }

      const newTax = {
        id: newTaxId,
        name: values.name.trim(),
        rate: values.rate,
        balance: values.openingBalance || 0,
        companyId,
        groupId: values.groupId || undefined,
      };
      onTaxCreated?.(saveAndNew, newTaxId, newTax);
    } catch (error) {
      console.error("Error creating tax:", error);
      if (isLikelyOfflineFirestoreError(error) && apkEntityWriteUsesLocalSqliteMirror(company)) {
        try {
          if (!companyId || !user) throw new Error("Missing company or user.");
          const totalCatch =
            (avatarToUpload?.file.size ?? 0) + documentFiles.reduce((s, f) => s + f.size, 0);
          if (totalCatch > 0) {
            const lim = await checkStorageLimit(
              companyId,
              company?.planId,
              { attachmentsBytes: totalCatch, storageBytes: totalCatch },
              company?.storageOption
            );
            if (!lim.allowed) throw new Error(lim.message || "Storage limit reached.");
          }
          const localId = createLocalEntityId("tax");
          const interCompanyAccountNo = await interCompanyAcNoForNewEntity("tax");
          const stagedCatch = await stageEntityAvatarAndDocuments({
            companyId,
            collectionSeg: "taxes",
            entityId: localId,
            avatarFile: avatarToUpload?.file ?? null,
            documentFiles,
          });
          const nowTs = Timestamp.now();
          const payload: Record<string, unknown> = {
            id: localId,
            name: values.name.trim(),
            rate: values.rate,
            openingBalance: values.openingBalance || 0,
            openingBalanceDate: values.openingBalanceDate || null,
            openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
            groupId: values.groupId?.trim() || getUngroupedGroupId("tax"),
            ownerId: user.uid,
            companyId,
            balance: values.openingBalance || 0,
            createdAt: nowTs,
            interCompanyAccountNo,
            fileUrl: stagedCatch.fileUrl ?? null,
            ...(stagedCatch.documentFileUrls.length ? { documentFileUrls: stagedCatch.documentFileUrls } : {}),
            isDeleted: false,
          };
          await upsertCompanyDocInBrowserDb(companyId, "taxes", localId, payload as any);
          await enqueueCompanyDocOutbox(companyId, "taxes", "create", localId, payload as any);
          sonnerToast.success("Saved. Will sync when online.", {
            id: toastId,
            description: `"${values.name}" was saved locally (offline).`,
          });
          onTaxCreated?.(saveAndNew, localId, {
            id: localId,
            name: values.name.trim(),
            rate: values.rate,
            balance: values.openingBalance || 0,
            companyId,
            groupId: values.groupId || undefined,
          });
          if (saveAndNew) {
            form.reset({
              name: "",
              rate: 0,
              openingBalance: 0,
              openingBalanceDate: undefined,
              groupId: getUngroupedGroupId("tax"),
              openingBalanceNarration: "",
            });
            clearUploads();
          }
        } catch {
          sonnerToast.error("Error", { id: toastId, description: "Failed to create tax." });
        }
      } else {
        sonnerToast.error("Error", {
          id: toastId,
          description: "Failed to create tax.",
        });
      }
    } finally {
        setIsLoading(false);
    }
  }

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };
  
  const groupOptions = React.useMemo(() => {
    const userGroups = (groups || []).filter(
      (g) => !(g as any).isSystemReserved && !isSystemParentGroup("tax_groups", g.id) && (g as any).isAutoUngrouped !== true
    );
    return [{ value: getUngroupedGroupId("tax"), label: "Ungrouped" }, ...userGroups.map((g) => ({ value: g.id, label: g.name }))];
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    if (!groupSearchQuery) return groups;
    return groups.filter((group) =>
      group.name.toLowerCase().includes(groupSearchQuery.toLowerCase())
    );
  }, [groups, groupSearchQuery]);

  return (
    <>
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="flex min-h-0 flex-1 flex-col">
        <div className="pl-master-form-scroll min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 sm:pr-2">
        <div className="space-y-4">
            <MasterFormNameAcNoRow
              entityKind="tax"
              mode="create"
              nameField={
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Tax Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., VAT" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
            />
            <MasterFormTwoColGrid>
              <MasterMobileNoField control={form.control} />
            <FormField
              control={form.control}
              name="groupId"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Group</FormLabel>
                  <Combobox
                    options={groupOptions}
                    value={field.value}
                    onChange={(value, newName) => {
                      if (value === "add-new") {
                        setIsCreateGroupOpen(true);
                         setTimeout(() => {
                          document.dispatchEvent(new CustomEvent('prefill-create-tax-group-name', { detail: newName }));
                        }, 100);
                      } else {
                        field.onChange(value === "none" ? "" : value);
                      }
                    }}
                    placeholder="Select a group"
                    addNewLabel="+ Add New Group"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
            control={form.control}
            name="rate"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Tax Rate (%)</FormLabel>
                <FormControl>
                    <Input 
                      type="number" 
                      value={field.value || ''} 
                      onChange={(e) => {
                        const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                        field.onChange(value);
                      }}
                      onBlur={field.onBlur}
                    />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            </MasterFormTwoColGrid>
             <MasterFormTwoColGrid>
              <FormField
              control={form.control}
              name="openingBalance"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Opening Balance</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="0" 
                      value={field.value || ''} 
                      onChange={(e) => {
                        const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                        field.onChange(value);
                      }}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
              />
              <FormField
                  control={form.control}
                  name="openingBalanceDate"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>As on Date</FormLabel>
                       <div className={cn("grid", dateSystem === 'Both' && "grid-cols-1 sm:grid-cols-2 gap-2")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                                <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} />
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                                <Popover modal={true} open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                      >
                                        {field.value ? format(field.value, "MMM-dd-yyyy") : <span>Pick a date</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setIsCalendarOpen(false); }} initialFocus />
                                  </PopoverContent>
                                </Popover>
                            )}
                        </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             </MasterFormTwoColGrid>
            <EntityProfilePhotoBlock
              file={avatarToUpload?.file ?? null}
              onPickClick={() => avatarInputRef.current?.click()}
              fileInputRef={avatarInputRef}
              onAvatarChange={handleAvatarChange}
              onRemoveAvatar={removeAvatar}
              canAddAvatar={canAddAvatar}
              inputId="create-tax-avatar"
            />
            <EntityDocumentsBlock
              docSlots={documentFiles}
              onRemoveDoc={removeDocAt}
              onAddClick={() => docsInputRef.current?.click()}
              docsInputRef={docsInputRef}
              onDocsChange={handleDocumentsChange}
              canAttachDocuments={canAttachDocuments}
              attachmentCompanyId={companyId ?? undefined}
              entityStatementLabel="tax"
              inputId="create-tax-docs"
            />
            <EntityOpeningBalanceNarrationField
              control={form.control}
              name="openingBalanceNarration"
              detailLabel="tax"
            />
        </div>
        </div>
        {/* Same row masters create footer — slate Cancel pill */}
        <div className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
          <Button
            type="button"
            variant="ghost"
            className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}
            onClick={() => onCloseDialogRequest?.()}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <div className="flex min-w-0 flex-1 justify-center px-1">
            <Button
              type="button"
              variant="ghost"
              className={cn(BTN_SAVE_NEW_CLASS, "shrink-0 px-4")}
              onClick={(e) => handleFormSubmit(e, { saveAndNew: true })}
              disabled={isLoading || apkOfflineViewOnly}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & New
            </Button>
          </div>
          <Button type="submit" disabled={isLoading || !companyId || apkOfflineViewOnly} className="shrink-0">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Tax
          </Button>
        </div>
      </form>
    </Form>
     <CreateTaxGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

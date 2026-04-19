
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Upload, Trash2, FileText, CalendarIcon, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { collection, doc, serverTimestamp, onSnapshot, query, setDoc, Timestamp } from "firebase/firestore";
import { stageEntityAvatarAndDocuments, isProfileAvatarImageFile, isProfileDocumentFile } from "@/lib/entityProfileLocalFiles";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Calendar } from "@/components/ui/calendar";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { FilePreview } from "../vouchers/FilePreview";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { Combobox } from "../ui/combobox";
import { toast as sonnerToast } from "sonner";
import { saveVoucher, balanceOpeningBalanceWithCapital } from "@/lib/voucherActionsClient";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Party, Group } from "./types";
import { format } from "date-fns";
import { ensureUngroupedGroup, getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox, isLikelyOfflineFirestoreError } from "@/lib/localVoucherOutbox";
import { isLocalOnlyMode } from "@/lib/localMode";


const formSchema = z
  .object({
    name: z.string().min(2, "Party name is required."),
    groupId: z.string().optional(),
    openingBalance: z.coerce.number(),
    openingBalanceDate: z.date().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z
      .union([z.string().email({ message: "Please enter a valid email." }), z.literal("")])
      .optional(),
    pan: z.string().optional(),
    /** Statement opening row — table me alag narration line */
    openingBalanceNarration: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.password || data.confirmPassword) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    { message: "Passwords do not match.", path: ["confirmPassword"] }
  );

type FormValues = z.infer<typeof formSchema>;


const MAX_FILE_SIZE_MB = 0.5;

function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}


export function CreatePartyForm({
  onPartyCreated,
  onNestedDialogOpenChange,
}: {
  onPartyCreated?: (isSaveAndNew: boolean, newId: string) => void;
  onNestedDialogOpenChange?: (open: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  const [avatarToUpload, setAvatarToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionResult, setCompressionResult] = useState<{originalSize: number, compressedSize: number} | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  React.useEffect(() => { onNestedDialogOpenChange?.(isCreateGroupOpen); }, [isCreateGroupOpen, onNestedDialogOpenChange]);


  const { toast } = useToast();
  const { user } = useAuth();
  // triggerSync hataya: company registry reload se poori UI hilti thi — party save par BUMP/listeners kaafi.
  const { setCompanyId, companyId, company } = useCompany();
  const { canAddAvatar, canAddFileImagePdf } = usePermissions();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const { processedGroups } = useVouchers();
  const isLocalGuestUser = user?.uid === "local_guest_user";
  const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      pan: "",
      openingBalanceNarration: "",
      password: "",
      confirmPassword: "",
      openingBalance: 0,
      groupId: "",
    },
    mode: "onChange",
  });


  const displayDate = (date?: Date) => {
    if (!date || isNaN(date.getTime())) return "Pick a date";
    switch (dateSystem) {
      case "AD":
        return formatDate(date);
      case "BS":
        return formatDateBS(date);
      case "Both":
        return `${formatDate(date)} / ${formatDateBS(date)}`;
      default:
        return formatDate(date);
    }
  };
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding a profile photo." });
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

    setIsCompressing(true);
    try {
      const compressedFile = await compressFile(inputFile);
      setCompressionResult({ originalSize: inputFile.size, compressedSize: compressedFile.size });
      if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large After Compression",
          description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
        });
        setAvatarToUpload(null);
        return;
      }
      const preview = URL.createObjectURL(compressedFile);
      setAvatarToUpload({ file: compressedFile, preview });
    } catch (err) {
      console.error("File compression error:", err);
      toast({ variant: "destructive", title: "File Error", description: "Could not process the file." });
    } finally {
      setIsCompressing(false);
    }
    e.target.value = "";
  };

  const handleDocumentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAttachDocuments) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow attaching documents." });
      return;
    }
    const incoming = Array.from(e.target.files).filter((f) => isProfileDocumentFile(f));
    setDocumentFiles((prev) => [...prev, ...incoming].slice(0, 5));
    e.target.value = "";
  };

  const removeAvatar = () => {
    if (avatarToUpload?.preview) URL.revokeObjectURL(avatarToUpload.preview);
    setAvatarToUpload(null);
    setCompressionResult(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const removeDocAt = (idx: number) => {
    setDocumentFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };
  
  useEffect(() => {
    if (!companyId) return;
    if (isLocalOnlyMode()) {
      // Local-only mode: groups Firestore listener skip karo; form local cached groups/useVouchers se chalti rahe.
      return;
    }
    const q = query(collection(firestore, `companies/${companyId}/groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)).filter(g => !g.isDeleted));
    });
    return () => unsubscribe();
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!companyId || !user?.uid) return;
      if (isLocalOnlyMode()) {
        // Local-only mode: Firestore-backed ungrouped initializer call mat chalao.
        const current = form.getValues("groupId");
        if (!current) form.setValue("groupId", getUngroupedGroupId("party"), { shouldDirty: false });
        return;
      }
      // Keep Party create default on canonical Ungrouped bucket.
      const ungroupedId = await ensureUngroupedGroup(companyId, user.uid, "party");
      if (!alive) return;
      const current = form.getValues("groupId");
      if (!current) form.setValue("groupId", ungroupedId, { shouldDirty: false });
    })();
    return () => {
      alive = false;
    };
  }, [companyId, user?.uid, form]);

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    document.addEventListener('prefill-create-party-name', handlePrefill as any);
    return () => document.removeEventListener('prefill-create-party-name', handlePrefill as any);
  }, [form]);


  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    onPartyCreated?.(options.saveAndNew || false, '');

    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: FormValues, saveAndNew: boolean = false) {
    if ((!user || !user.email) && !isStaticAppBuild()) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in to create a party.",
      });
      return;
    }
    
    // Offline/online dono me same flow; network fail par local+outbox fallback hoga.
    const toastId = sonnerToast.loading("Saving party...");
    setIsLoading(true);

    try {
      if (isLocalOnlyMode()) {
        // Local-only mode: IndexedDB pending files + SQLite row (online upload nahin)
        if (!companyId) {
          sonnerToast.error("No company selected", {
            id: toastId,
            description: "Select a company before saving a party.",
          });
          return;
        }
        const totalAttachBytesLocal =
          (avatarToUpload?.file.size ?? 0) + documentFiles.reduce((s, f) => s + f.size, 0);
        if (totalAttachBytesLocal > 0) {
          const limitCheck = await checkStorageLimit(
            companyId!,
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
        const resolvedGroupId = values.groupId?.trim() || getUngroupedGroupId("party");
        const localId = createLocalEntityId("party");
        const stagedLocal = await stageEntityAvatarAndDocuments({
          companyId: companyId!,
          collectionSeg: "parties",
          entityId: localId,
          avatarFile: avatarToUpload?.file ?? null,
          documentFiles,
        });
        const nowTs = Timestamp.now();
        const payload: Record<string, unknown> = {
          id: localId,
          name: values.name,
          address: values.address,
          phone: values.phone,
          email: values.email,
          pan: values.pan,
          openingBalance: values.openingBalance,
          openingBalanceDate: values.openingBalanceDate || null,
          openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
          ownerId: user?.uid || "local_guest_user",
          companyId,
          groupId: resolvedGroupId,
          balance: values.openingBalance,
          isDeleted: false,
          createdAt: nowTs,
          fileUrl: stagedLocal.fileUrl ?? null,
          ...(stagedLocal.documentFileUrls.length
            ? { documentFileUrls: stagedLocal.documentFileUrls }
            : {}),
        };
        await upsertCompanyDocInBrowserDb(companyId!, "parties", localId, payload);
        await enqueueCompanyDocOutbox(companyId!, "parties", "create", localId, payload);
        const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
        sonnerToast.success(showSyncHint ? "Saved. Will sync when online." : "Saved.", {
          id: toastId,
          description: showSyncHint
            ? `"${values.name}" was saved locally and will sync when online.`
            : `"${values.name}" was saved locally.`,
        });
        if (saveAndNew) {
          form.reset({ name: "", address: "", phone: "", email: "", pan: "", openingBalanceNarration: "", password: "", confirmPassword: "", openingBalance: 0, openingBalanceDate: undefined, groupId: getUngroupedGroupId("party") });
          removeAvatar();
          setDocumentFiles([]);
        }
        onPartyCreated?.(saveAndNew, localId);
        return;
      }

      // Online mode only: Recycle-bin duplicate flow Firestore query ke through.
      const duplicateDecision = await resolveRecycleBinDuplicate({
        companyId: companyId!,
        collectionName: "parties",
        name: values.name.trim(),
        entityLabel: "Party",
      });
      if (duplicateDecision.decision === "active_exists") {
        sonnerToast.error("Duplicate Party Name", {
          id: toastId,
          description: "A party with this name already exists.",
        });
        setIsLoading(false);
        return;
      }
      if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
        sonnerToast.success("Party Restored!", {
          id: toastId,
          description: `"${values.name.trim()}" was restored from Recycle Bin.`,
        });
        onPartyCreated?.(saveAndNew, duplicateDecision.restoredId);
        setIsLoading(false);
        return;
      }

      const totalAttachBytes =
        (avatarToUpload?.file.size ?? 0) + documentFiles.reduce((s, f) => s + f.size, 0);
      if (totalAttachBytes > 0) {
        const limitCheck = await checkStorageLimit(
          companyId!,
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
        values.groupId?.trim() || (await ensureUngroupedGroup(companyId!, user.uid, "party"));
      const partyRef = doc(collection(firestore, `companies/${companyId}/parties`));
      const newPartyId = partyRef.id;
      const staged = await stageEntityAvatarAndDocuments({
        companyId: companyId!,
        collectionSeg: "parties",
        entityId: newPartyId,
        avatarFile: avatarToUpload?.file ?? null,
        documentFiles,
      });

      await setDoc(partyRef, {
        name: values.name,
        address: values.address,
        phone: values.phone,
        email: values.email,
        pan: values.pan,
        openingBalance: values.openingBalance,
        openingBalanceDate: values.openingBalanceDate || null,
        openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
        ownerId: user.uid,
        companyId,
        groupId: resolvedGroupId || getUngroupedGroupId("party"),
        balance: values.openingBalance,
        isDeleted: false,
        createdAt: serverTimestamp(),
        fileUrl: staged.fileUrl,
        ...(staged.documentFileUrls.length ? { documentFileUrls: staged.documentFileUrls } : {}),
      });

      if (totalAttachBytes > 0) {
        await incrementCompanyStorage(companyId!, {
          attachmentsBytes: totalAttachBytes,
          storageBytes: totalAttachBytes,
        });
      }

      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        await balanceOpeningBalanceWithCapital(companyId!, "parties", newPartyId, 0, values.openingBalance);
      }

      sonnerToast.success("Party Created!", {
        id: toastId,
        description: `"${values.name}" has been successfully created.`,
      });

      if (saveAndNew) {
        form.reset({ name: "", address: "", phone: "", email: "", pan: "", openingBalanceNarration: "", password: "", confirmPassword: "", openingBalance: 0, openingBalanceDate: undefined, groupId: getUngroupedGroupId("party") });
        removeAvatar();
        setDocumentFiles([]);
      }

      onPartyCreated?.(saveAndNew, newPartyId);

    } catch (error) {
      console.error("Error creating party:", error);
      const staticMode = isLocalOnlyMode();
      const isOfflineFallback = staticMode && isLikelyOfflineFirestoreError(error);
      if (staticMode) {
        try {
          if (!companyId) throw new Error("Select a company before saving a party.");
          const totalCatch =
            (avatarToUpload?.file.size ?? 0) + documentFiles.reduce((s, f) => s + f.size, 0);
          if (totalCatch > 0) {
            const lim = await checkStorageLimit(
              companyId!,
              company?.planId,
              { attachmentsBytes: totalCatch, storageBytes: totalCatch },
              company?.storageOption
            );
            if (!lim.allowed) throw new Error(lim.message || "Storage limit reached.");
          }
          const resolvedGroupId =
            values.groupId?.trim() || getUngroupedGroupId("party");
          const localId = createLocalEntityId("party");
          const stagedCatch = await stageEntityAvatarAndDocuments({
            companyId: companyId!,
            collectionSeg: "parties",
            entityId: localId,
            avatarFile: avatarToUpload?.file ?? null,
            documentFiles,
          });
          const nowTs = Timestamp.now();
          const payload: Record<string, unknown> = {
            id: localId,
            name: values.name,
            address: values.address,
            phone: values.phone,
            email: values.email,
            pan: values.pan,
            openingBalance: values.openingBalance,
            openingBalanceDate: values.openingBalanceDate || null,
            openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
            ownerId: user?.uid || "local_guest_user",
            companyId,
            groupId: resolvedGroupId || getUngroupedGroupId("party"),
            balance: values.openingBalance,
            isDeleted: false,
            createdAt: nowTs,
            fileUrl: stagedCatch.fileUrl ?? null,
            ...(stagedCatch.documentFileUrls.length
              ? { documentFileUrls: stagedCatch.documentFileUrls }
              : {}),
          };
          // Local list ko turant update karo so party left panel me instantly dikhe.
          await upsertCompanyDocInBrowserDb(companyId!, "parties", localId, payload);
          // Reconnect par server sync ke liye outbox row.
          await enqueueCompanyDocOutbox(companyId!, "parties", "create", localId, payload);
          const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
          sonnerToast.success(showSyncHint ? "Saved. Will sync when online." : "Saved.", {
            id: toastId,
            description: showSyncHint
              ? `"${values.name}" was saved locally and will sync when online.`
              : `"${values.name}" was saved locally.`,
          });
          if (saveAndNew) {
            form.reset({ name: "", address: "", phone: "", email: "", pan: "", openingBalanceNarration: "", password: "", confirmPassword: "", openingBalance: 0, openingBalanceDate: undefined, groupId: getUngroupedGroupId("party") });
            removeAvatar();
            setDocumentFiles([]);
          }
          onPartyCreated?.(saveAndNew, localId);
        } catch (offlineErr) {
          sonnerToast.error("Error", {
            id: toastId,
            description: offlineErr instanceof Error ? offlineErr.message : "Failed to save party offline.",
          });
        }
      } else {
        sonnerToast.error("Error", {
          id: toastId,
          description: "Failed to create party. Please try again.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  const partyGroupOptions = React.useMemo(() => {
    // Only user-defined party groups; system parent groups are hidden from selection
    return [
      { value: getUngroupedGroupId("party"), label: "Ungrouped" },
      ...processedGroups
      .filter(group => !(group as any).isSystemReserved && (group as any).isAutoUngrouped !== true)
      .map(group => ({ value: group.id, label: group.name })),
    ];
  }, [processedGroups]);

  return (
    <>
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Party Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
            control={form.control}
            name="groupId"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Group</FormLabel>
                <Combobox
                    options={partyGroupOptions}
                    value={field.value}
                    onChange={(val, newName) => {
                        if (val === 'add-new') {
                            setIsCreateGroupOpen(true);
                            setTimeout(() => {
                                document.dispatchEvent(new CustomEvent('prefill-create-group-name', { detail: newName }));
                            }, 100);
                        } else {
                            field.onChange(val === "none" ? "" : val);
                        }
                    }}
                    placeholder="Select a group"
                    addNewLabel="+ Add New Group"
                    />
                <FormMessage />
                </FormItem>
            )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>Phone No.</FormLabel>
                <FormControl>
                  <Input placeholder="Party phone number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="Party email address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Party's full address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
         {/* PAN / OB / date — File tick hata (docs neeche section me) */}
         <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
            control={form.control}
            name="pan"
            render={({ field }: any) => (
              <FormItem className="sm:col-span-2 lg:col-span-1">
                <FormLabel>PAN/VAT No.</FormLabel>
                <FormControl>
                  <Input placeholder="Party's PAN/VAT" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
            <FormField
              control={form.control}
              name="openingBalance"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Opening Balance</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
                control={form.control}
                name="openingBalanceDate"
                render={({ field }: any) => (
                  <FormItem className="flex flex-col pt-2 lg:pt-0">
                    <FormLabel>As on Date</FormLabel>
                      <div className={cn("grid", dateSystem === 'Both' && "grid-cols-1 sm:grid-cols-2 gap-2")}>
                          {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} />
                          )}
                          {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
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
          </div>

        <Separator />
        
        <FormItem>
          <FormLabel>Profile photo (Optional)</FormLabel>
          {!canAddAvatar ? (
            <p className="text-xs text-muted-foreground">
              Upgrade plan to add profile photo.{" "}
              <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Click here to upgrade</Link>
            </p>
          ) : (
            <RestrictedFileUploader>
              <div className="flex items-center gap-4 flex-wrap">
                {avatarToUpload && (
                  <FilePreview
                    file={avatarToUpload.file}
                    onRemove={removeAvatar}
                    isCompressing={isCompressing}
                    compressionResult={compressionResult}
                  />
                )}
                {!avatarToUpload && (
                  <FormControl>
                    <div
                      className="relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <Upload className="h-6 w-6" />
                      <span className="text-xs mt-1 text-center px-1">Add photo</span>
                      <Input
                        type="file"
                        className="hidden"
                        ref={avatarInputRef}
                        onChange={handleAvatarChange}
                        accept="image/*"
                      />
                    </div>
                  </FormControl>
                )}
              </div>
            </RestrictedFileUploader>
          )}
          {/* List / detail par profile thumbnail */}
          <p className="text-[10px] text-muted-foreground mt-1">Images only — shown on profile / avatar.</p>
        </FormItem>

        <FormItem>
          <FormLabel>Documents (Optional)</FormLabel>
          <p className="text-xs text-muted-foreground mb-1 leading-snug">
            Optional supporting files for this party (PDF or images — e.g. registration, agreement scans). Up to 5 files; stored with the party and available from the statement.
          </p>
          <p className="text-[10px] text-muted-foreground mb-1">
            On the party statement they show on the opening balance row under the <span className="font-medium">File</span> column (green tick), like voucher attachments.
          </p>
          {!canAttachDocuments ? (
            <p className="text-xs text-muted-foreground">
              Upgrade plan to attach PDF/images.{" "}
              <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Click here to upgrade</Link>
            </p>
          ) : (
            <RestrictedFileUploader>
              {/* Add box aur previews ek hi flex row — pehle alag `space-y` se box hamesha neeche chala jata tha */}
              <div className="flex flex-wrap items-start gap-2">
                {/* 96px = Tailwind w-24 h-24 — dashed “PDF / image” box ke barabar */}
                {documentFiles.map((f, idx) => (
                  <FilePreview
                    key={`${f.name}-${idx}-${f.size}`}
                    file={f}
                    onRemove={() => removeDocAt(idx)}
                    size={96}
                  />
                ))}
                {documentFiles.length < 5 && (
                  <FormControl>
                    <div
                      className="relative h-24 w-24 shrink-0 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                      onClick={() => docsInputRef.current?.click()}
                    >
                      <Upload className="h-6 w-6" />
                      <span className="text-xs mt-1 text-center px-1">PDF / image</span>
                      <Input
                        type="file"
                        className="hidden"
                        ref={docsInputRef}
                        onChange={handleDocumentsChange}
                        accept="image/*,application/pdf"
                        multiple
                      />
                    </div>
                  </FormControl>
                )}
              </div>
            </RestrictedFileUploader>
          )}
        </FormItem>

        <FormField
          control={form.control}
          name="openingBalanceNarration"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Opening balance narration (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g. OB brought forward from previous system…"
                  className="min-h-[72px] resize-y"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <p className="text-[10px] text-muted-foreground">
                Shown on the party statement as a line under the Opening Balance row (voucher-style narration).
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4 pt-4">
          {onPartyCreated && (
            <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & New
            </Button>
          )}
          <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Party
          </Button>
        </div>
      </form>
    </Form>
     <CreateGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

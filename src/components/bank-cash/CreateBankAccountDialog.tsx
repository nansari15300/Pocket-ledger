
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CalendarIcon, Upload } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { doc, setDoc, collection, serverTimestamp, query, onSnapshot, Timestamp } from "firebase/firestore";
import {
  stageEntityAvatarAndDocuments,
  uploadEntityAvatarAndDocumentsRemote,
  isProfileAvatarImageFile,
  isProfileDocumentFile,
} from "@/lib/entityProfileLocalFiles";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountGroup } from "@/components/bank-cash/types";
import { CreateAccountGroupDialog } from "./CreateAccountGroupDialog";
import { Switch } from "@/components/ui/switch";
import usePermissions from "@/hooks/usePermissions";
import { Combobox } from "../ui/combobox";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  cnMasterEntityDialogContent,
  masterEntityDialogHeaderClassName,
  masterEntityDialogFormWrapperClassName,
} from "@/lib/masterEntityDialogClasses";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { FilePreview } from "../vouchers/FilePreview";
import { toast as sonnerToast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { SpecialAccountAccessControl } from "./SpecialAccountAccessControl";
import { ensureUngroupedGroup, getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { EntityOpeningBalanceNarrationField } from "@/components/common/EntityProfileDocumentsNarrationFields";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import { isLocalOnlyMode } from "@/lib/localMode";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox, isLikelyOfflineFirestoreError } from "@/lib/localVoucherOutbox";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { bankPrefillPartsFromRow, fetchRemoteUrlAsFile } from "@/lib/crossCompanyMasterPrefill";

function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

const MAX_FILE_SIZE_MB = 0.5;

const formSchema = z.object({
  accountName: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  accountType: z.enum(["Bank", "Cash"]),
  openingBalance: z.number().min(0),
  openingBalanceDate: z.date().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  groupId: z.string().optional(), // Group optional so accounts can start as Ungrouped
  openingBalanceNarration: z.string().optional(),
  isSpecial: z.boolean(),
  useFor: z.object({
    in: z.array(z.string()),
    out: z.array(z.string()),
  }).optional(),
});

export function CreateBankAccountDialog({
  onAccountCreated,
  children,
  isOpen: parentIsOpen,
  onOpenChange: parentOnOpenChange,
  contextNote,
}: {
  onAccountCreated: (id: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  contextNote?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const { can, canAddAvatar, canAddFileImagePdf } = usePermissions();
  // Documents: voucher-files entitlement ya avatar — party form jaisa
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const { dateSystem } = useDate();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  /** Profile — sirf image; Firebase turant upload nahi — IndexedDB + local: id */
  const [avatarToUpload, setAvatarToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [compressionResult, setCompressionResult] = useState<{originalSize: number, compressedSize: number} | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const isMobile = useIsMobile();

  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setIsOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountName: "",
      accountType: "Bank",
      openingBalance: 0,
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      groupId: "",
      isSpecial: false,
      useFor: { 
          in: company?.ownerEmail ? [company.ownerEmail] : [], 
          out: company?.ownerEmail ? [company.ownerEmail] : [] 
      },
      openingBalanceNarration: "",
    },
  });

  const accountType = form.watch("accountType");
  const isSpecial = form.watch("isSpecial");
  
  const usersForAccessControl = useMemo(() => {
    if (!company) return [];

    const ownerUser = {
        id: company.ownerEmail, 
        email: company.ownerEmail,
        name: "Owner",
        photoURL: null,
        role: 'owner' as const
    };

    const sharedUsers = (company.sharedWith || []).map(u => ({
        id: u.email, 
        email: u.email,
        name: u.name || "Unknown",
        photoURL: u.photoURL || null,
        role: u.role
    }));
    
    const uniqueUsersMap = new Map<string, any>();
    
    if(ownerUser.id) {
      uniqueUsersMap.set(ownerUser.id, ownerUser);
    }

    sharedUsers.forEach(u => {
        if (u.id && !uniqueUsersMap.has(u.id)) {
            uniqueUsersMap.set(u.id, u);
        }
    });

    return Array.from(uniqueUsersMap.values());
  }, [company]);

  useEffect(() => {
    if (!companyId || !isOpen) return;
    if (isLocalOnlyMode()) {
      // Local-only mode: skip Firestore account group listener to avoid offline runtime errors.
      return;
    }
    const q = query(collection(firestore, `companies/${companyId}/account_groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountGroup));
      setGroups(fetchedGroups);
    });
    return () => unsubscribe();
  }, [companyId, isOpen]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!companyId || !user?.uid || !isOpen) return;
      if (isLocalOnlyMode()) {
        // Local-only mode: default to local ungrouped id without Firestore ensure call.
        const current = form.getValues("groupId");
        if (!current) form.setValue("groupId", getUngroupedGroupId("bank"), { shouldDirty: false });
        return;
      }
      // Keep Bank/Cash create default on canonical Ungrouped bucket.
      const ungroupedId = await ensureUngroupedGroup(companyId, user.uid, "bank");
      if (!alive) return;
      const current = form.getValues("groupId");
      if (!current) form.setValue("groupId", ungroupedId, { shouldDirty: false });
    })();
    return () => {
      alive = false;
    };
  }, [companyId, user?.uid, isOpen, form]);

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('accountName', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-bank-account-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-bank-account-name', handlePrefill);
    };
  }, [form]);
  
  useEffect(() => {
    // Do not auto-assign system parent groups; let accounts start Ungrouped unless user picks a custom group
    if (!isOpen) return;
    const anyCurrent = form.getValues("groupId");
    if (!anyCurrent && groups.some(g => !(g as any).isSystemReserved)) {
      const firstCustom = groups.find(g => !(g as any).isSystemReserved);
      if (firstCustom) form.setValue("groupId", firstCustom.id);
    }
  }, [isOpen, groups, form]);


  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setTimeout(() => setIsCreateGroupOpen(false), 50);
  };
  
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

  const clearUploads = () => {
    removeAvatar();
    setDocumentFiles([]);
    if (docsInputRef.current) docsInputRef.current.value = "";
  };

  /** Copy-to-company: source bank row + remote avatar/docs → form (naye company par save). */
  useEffect(() => {
    const h = async (e: CustomEvent<{ rowPayload?: Record<string, unknown> }>) => {
      const row = e.detail?.rowPayload;
      if (!row || typeof row !== "object") return;
      clearUploads();
      const { defaults, remoteAvatarUrl, remoteDocumentUrls } = bankPrefillPartsFromRow(row);
      form.reset({
        accountName: defaults.accountName,
        accountType: defaults.accountType,
        openingBalance: defaults.openingBalance,
        openingBalanceDate: defaults.openingBalanceDate,
        bankName: defaults.bankName,
        accountNumber: defaults.accountNumber,
        ifscCode: defaults.ifscCode,
        openingBalanceNarration: defaults.openingBalanceNarration,
        groupId: getUngroupedGroupId("bank"),
        isSpecial: defaults.isSpecial,
        useFor:
          defaults.useFor ?? {
            in: company?.ownerEmail ? [company.ownerEmail] : [],
            out: company?.ownerEmail ? [company.ownerEmail] : [],
          },
      });
      if (remoteAvatarUrl?.trim() && canAddAvatar) {
        setIsCompressing(true);
        try {
          const raw = await fetchRemoteUrlAsFile(remoteAvatarUrl, "bank-avatar.jpg");
          if (raw) {
            const compressed = await compressFile(raw);
            setCompressionResult({ originalSize: raw.size, compressedSize: compressed.size });
            const preview = URL.createObjectURL(compressed);
            setAvatarToUpload({ file: compressed, preview });
          }
        } catch {
          /* ignore */
        } finally {
          setIsCompressing(false);
        }
      }
      if (remoteDocumentUrls?.length && canAttachDocuments) {
        const next: File[] = [];
        for (let i = 0; i < Math.min(remoteDocumentUrls.length, 5); i++) {
          const u = remoteDocumentUrls[i];
          const nameGuess = u.toLowerCase().includes(".pdf") ? `bank-doc-${i + 1}.pdf` : `bank-doc-${i + 1}.jpg`;
          const f = await fetchRemoteUrlAsFile(u, nameGuess);
          if (f && isProfileDocumentFile(f)) next.push(f);
        }
        if (next.length) setDocumentFiles(next);
      }
    };
    document.addEventListener("prefill-create-bank-account-full", h as EventListener);
    return () => document.removeEventListener("prefill-create-bank-account-full", h as EventListener);
  }, [form, company, canAddAvatar, canAttachDocuments]);

  function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    void (async () => {
      const isValid = await form.trigger();
      if (!isValid) {
        sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
        return;
      }
      if (!options.saveAndNew) {
        setIsOpen(false);
      } else {
        setIsLoading(true);
      }
      void processAndSave(form.getValues(), options.saveAndNew || false);
    })();
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in and have a company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Creating account...");
    setIsLoading(true);

    try {
      if (isLocalOnlyMode()) {
        // Local-only: IndexedDB pending files + SQLite (online Storage upload yahin nahi)
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
        const localId = createLocalEntityId("bank");
        const stagedLocal = await stageEntityAvatarAndDocuments({
          companyId: companyId!,
          collectionSeg: "bank_accounts",
          entityId: localId,
          avatarFile: avatarToUpload?.file ?? null,
          documentFiles,
        });
        const payload = {
          id: localId,
          ...values,
          groupId: values.groupId?.trim() || getUngroupedGroupId("bank"),
          openingBalanceDate: values.openingBalanceDate || null,
          openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
          fileUrl: stagedLocal.fileUrl ?? null,
          ...(stagedLocal.documentFileUrls.length ? { documentFileUrls: stagedLocal.documentFileUrls } : {}),
          ownerId: user.uid,
          companyId,
          createdAt: new Date().toISOString(),
          isDeleted: false,
        };
        await upsertCompanyDocInBrowserDb(companyId, "bank_accounts", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "bank_accounts", "create", localId, payload);
        const showSyncHint = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" && user.uid !== "local_guest_user";
        sonnerToast.success(showSyncHint ? "Saved. Will sync when online." : "Saved.", {
          id: toastId,
          description: showSyncHint
            ? `"${values.accountName}" was saved locally and will sync when online.`
            : `"${values.accountName}" was saved locally.`,
        });
        onAccountCreated(localId);
        if (saveAndNew) {
          form.reset({ ...form.getValues(), accountName: "", bankName: "", accountNumber: "", ifscCode: "", openingBalance: 0, openingBalanceDate: undefined, openingBalanceNarration: "", groupId: getUngroupedGroupId("bank"), isSpecial: false });
          clearUploads();
        }
        return;
      }

      // Recycle-bin duplicate flow: restore or create-new on user choice.
      const duplicateDecision = await resolveRecycleBinDuplicate({
        companyId,
        collectionName: "bank_accounts",
        fieldName: "accountName",
        name: values.accountName.trim(),
        entityLabel: "Bank/Cash Account",
      });
      if (duplicateDecision.decision === "active_exists") {
        sonnerToast.error("Duplicate Account Name", {
          id: toastId,
          description: "An account with this name already exists. Please choose a different name.",
        });
        setIsLoading(false);
        return;
      }
      if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
        sonnerToast.success("Account Restored!", {
          id: toastId,
          description: `"${values.accountName.trim()}" was restored from Recycle Bin.`,
        });
        onAccountCreated(duplicateDecision.restoredId);
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

      // Pehle doc id — staging `entityId` isi se match karega (`setDoc`, `addDoc` nahi)
      const resolvedGroupId =
        values.groupId?.trim() || (await ensureUngroupedGroup(companyId!, user.uid, "bank"));
      const accountRef = doc(collection(firestore, `companies/${companyId}/bank_accounts`));
      const newAccountId = accountRef.id;
      const staged = await uploadEntityAvatarAndDocumentsRemote({
        companyId: companyId!,
        collectionSeg: "bank_accounts",
        entityId: newAccountId,
        avatarFile: avatarToUpload?.file ?? null,
        documentFiles,
      });

      await setDoc(accountRef, {
        ...values,
        groupId: resolvedGroupId || getUngroupedGroupId("bank"),
        openingBalanceDate: values.openingBalanceDate || null,
        openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
        fileUrl: staged.fileUrl,
        ...(staged.documentFileUrls.length ? { documentFileUrls: staged.documentFileUrls } : {}),
        ownerId: user.uid,
        companyId,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });

      if (totalAttachBytes > 0) {
        await incrementCompanyStorage(companyId!, {
          attachmentsBytes: totalAttachBytes,
          storageBytes: totalAttachBytes,
        });
      }

      // Automatically balance opening balance with Capital Account
      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, "bank_accounts", newAccountId, 0, values.openingBalance);
      }

      sonnerToast.success("Account Created!", { id: toastId, description: `"${values.accountName}" has been successfully created.` });

      onAccountCreated(newAccountId);

      if (saveAndNew) {
        form.reset({ ...form.getValues(), accountName: "", bankName: "", accountNumber: "", ifscCode: "", openingBalance: 0, openingBalanceDate: undefined, openingBalanceNarration: "", groupId: getUngroupedGroupId("bank"), isSpecial: false });
        clearUploads();
      }
    } catch (error) {
      console.error("Error creating account:", error);
      if (isLocalOnlyMode()) {
        try {
          if (!companyId || !user) throw new Error("Missing company or user.");
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
          const resolvedGroupId = values.groupId?.trim() || getUngroupedGroupId("bank");
          const localId = createLocalEntityId("bank");
          const stagedCatch = await stageEntityAvatarAndDocuments({
            companyId: companyId!,
            collectionSeg: "bank_accounts",
            entityId: localId,
            avatarFile: avatarToUpload?.file ?? null,
            documentFiles,
          });
          const payload = {
            id: localId,
            ...values,
            groupId: resolvedGroupId,
            openingBalanceDate: values.openingBalanceDate || null,
            openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
            fileUrl: stagedCatch.fileUrl ?? null,
            ...(stagedCatch.documentFileUrls.length ? { documentFileUrls: stagedCatch.documentFileUrls } : {}),
            ownerId: user.uid,
            companyId,
            createdAt: new Date().toISOString(),
            isDeleted: false,
          };
          await upsertCompanyDocInBrowserDb(companyId, "bank_accounts", localId, payload);
          await enqueueCompanyDocOutbox(companyId, "bank_accounts", "create", localId, payload);
          const showSyncHint = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" && user.uid !== "local_guest_user";
          sonnerToast.success(showSyncHint ? "Saved. Will sync when online." : "Saved.", {
            id: toastId,
            description: showSyncHint
              ? `"${values.accountName}" was saved locally and will sync when online.`
              : `"${values.accountName}" was saved locally.`,
          });
          onAccountCreated(localId);
          if (saveAndNew) {
            form.reset({ ...form.getValues(), accountName: "", bankName: "", accountNumber: "", ifscCode: "", openingBalance: 0, openingBalanceDate: undefined, openingBalanceNarration: "", groupId: getUngroupedGroupId("bank"), isSpecial: false });
            clearUploads();
          }
        } catch (offlineErr) {
          sonnerToast.error("Error Creating Account", {
            id: toastId,
            description: offlineErr instanceof Error ? offlineErr.message : "Account could not be saved. Please try again.",
          });
        }
      } else if (isLikelyOfflineFirestoreError(error)) {
        try {
          if (!companyId || !user) throw new Error("Missing company or user.");
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
          const resolvedGroupId = values.groupId?.trim() || getUngroupedGroupId("bank");
          const localId = createLocalEntityId("bank");
          const stagedCatch = await stageEntityAvatarAndDocuments({
            companyId: companyId!,
            collectionSeg: "bank_accounts",
            entityId: localId,
            avatarFile: avatarToUpload?.file ?? null,
            documentFiles,
          });
          const nowTs = Timestamp.now();
          const payload: Record<string, unknown> = {
            id: localId,
            ...values,
            groupId: resolvedGroupId,
            openingBalanceDate: values.openingBalanceDate || null,
            openingBalanceNarration: values.openingBalanceNarration?.trim() || null,
            fileUrl: stagedCatch.fileUrl ?? null,
            ...(stagedCatch.documentFileUrls.length ? { documentFileUrls: stagedCatch.documentFileUrls } : {}),
            ownerId: user.uid,
            companyId,
            createdAt: nowTs,
            isDeleted: false,
          };
          await upsertCompanyDocInBrowserDb(companyId!, "bank_accounts", localId, payload);
          await enqueueCompanyDocOutbox(companyId!, "bank_accounts", "create", localId, payload);
          sonnerToast.success("Saved. Will sync when online.", {
            id: toastId,
            description: `"${values.accountName}" was saved locally (offline).`,
          });
          onAccountCreated(localId);
          if (saveAndNew) {
            form.reset({ ...form.getValues(), accountName: "", bankName: "", accountNumber: "", ifscCode: "", openingBalance: 0, openingBalanceDate: undefined, openingBalanceNarration: "", groupId: getUngroupedGroupId("bank"), isSpecial: false });
            clearUploads();
          }
        } catch {
          sonnerToast.error("Error Creating Account", { id: toastId, description: "Account could not be saved. Please try again." });
        }
      } else {
        sonnerToast.error("Error Creating Account", { id: toastId, description: "Account could not be saved. Please try again." });
      }
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={true}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Must match CreatePartyDialog height/size. */}
        <DialogContent 
            className={cn(cnMasterEntityDialogContent(isMobile), "sm:max-w-2xl")}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              if (isCreateGroupOpen) { e.preventDefault(); return; }
              const target = e.target as HTMLElement;
              if (
                target.closest('[data-radix-popper-content-wrapper]') ||
                target.closest('[cmdk-root]')
              ) {
                e.preventDefault();
              }
            }}
            onInteractOutside={(e) => {
               if (isCreateGroupOpen) { e.preventDefault(); return; }
               const target = e.target as HTMLElement;
               if (target.closest('[data-radix-dialog-content]')) {
                  e.preventDefault();
               }
            }}
        >
          <DialogHeader className={masterEntityDialogHeaderClassName}>
            <DialogTitle>Create a New Bank/Cash Account</DialogTitle>
            <DialogDescription>Add a new bank or cash account to manage your transactions.</DialogDescription>
            {contextNote ? (
              // Copy-to flow: user ko target-company context dialog ke andar clear dikhna chahiye.
              <p className="text-xs font-semibold text-emerald-700">{contextNote}</p>
            ) : null}
          </DialogHeader>
          <div className={masterEntityDialogFormWrapperClassName}>
          <Form {...form}>
            <form onSubmit={(e) => handleFormSubmit(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Cash in Hand" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex space-x-4 pt-2"
                      >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl><RadioGroupItem value="Bank" /></FormControl>
                          <FormLabel className="font-normal">Bank Account</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl><RadioGroupItem value="Cash" /></FormControl>
                          <FormLabel className="font-normal">Cash in Hand</FormLabel>
                        </FormItem>
                      </RadioGroup>
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
                        <FormControl>
                            <div className="flex items-center gap-2">
                            <div className="flex-1">
                            <Combobox
                                options={[
                                    { value: getUngroupedGroupId("bank"), label: "Ungrouped" },
                                    ...groups
                                      .filter((group) => !(group as any).isSystemReserved && (group as any).isAutoUngrouped !== true)
                                      .map((group) => ({
                                        value: group.id,
                                        label: group.name,
                                      })),
                                ]}
                                value={field.value}
                                onChange={(val, newName) => {
                                    if (val === "add-new") {
                                    setIsCreateGroupOpen(true);
                                    setTimeout(() => {
                                        document.dispatchEvent(new CustomEvent('prefill-create-account-group-name', { detail: newName }));
                                    }, 100);
                                    } else {
                                    field.onChange(val === "none" ? "" : val);
                                    }
                                }}
                                placeholder="Select or search a group"
                                addNewLabel="Create New Group"
                                disabled={isLoading}
                                />
                            </div>
                            </div>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="openingBalance"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Opening Balance</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
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
                      <div className={cn("grid", dateSystem === 'Both' && "grid-cols-2 gap-2")}>
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
              </div>

                {accountType === "Bank" && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Bank Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Himalayan Bank" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="accountNumber"
                          render={({ field }: any) => (
                            <FormItem>
                              <FormLabel>Account Number</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., 123456789" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="ifscCode"
                          render={({ field }: any) => (
                            <FormItem>
                              <FormLabel>IFSC/SWIFT Code</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., HBLNPKA..." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                    </div>
                  </div>
                )}
                
                {can('manage_special_bank_accounts') && (
                 <FormField
                  control={form.control}
                  name="isSpecial"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Mark as Special Account</FormLabel>
                        <FormDescription>Special accounts have restricted visibility.</FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )}
                />
                )}
                
                {isSpecial && can('manage_special_bank_accounts') && (
                      <Card className="p-4">
                        <CardHeader className="p-0 pb-4"><CardTitle className="text-base">Special Account Usage Control</CardTitle></CardHeader>
                        <CardContent className="p-0">
                           <SpecialAccountAccessControl
                                users={usersForAccessControl}
                                useFor={{
                                  in: form.watch('useFor')?.in ?? [],
                                  out: form.watch('useFor')?.out ?? [],
                                }}
                                onUseForChange={(newUseFor) => form.setValue('useFor', newUseFor)}
                            />
                        </CardContent>
                      </Card>
                )}
                <FormItem>
                  <FormLabel>Profile photo (Optional)</FormLabel>
                  {!canAddAvatar ? (
                    <p className="text-xs text-muted-foreground">
                      Upgrade plan to add profile photo.{" "}
                      <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                        Upgrade
                      </Link>
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
                  <p className="text-[10px] text-muted-foreground mt-1">Images only — shown on profile / avatar.</p>
                </FormItem>

                <FormItem>
                  <FormLabel>Documents (Optional)</FormLabel>
                  {!canAttachDocuments ? (
                    <p className="text-xs text-muted-foreground">
                      Upgrade plan to attach PDF/images.{" "}
                      <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                        Upgrade
                      </Link>
                    </p>
                  ) : (
                    <RestrictedFileUploader>
                      {/* PDF add box previews ke saath hi row me — party form jaisa */}
                      <div className="flex flex-wrap items-start gap-2">
                        {documentFiles.map((f, idx) => (
                          <FilePreview key={`${f.name}-${idx}-${f.size}`} file={f} onRemove={() => removeDocAt(idx)} size={96} />
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

                <EntityOpeningBalanceNarrationField
                  control={form.control}
                  name="openingBalanceNarration"
                  detailLabel="bank/cash account"
                />
            </div>

                <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <div className="flex min-w-0 flex-1 justify-center px-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(BTN_SAVE_NEW_CLASS, "shrink-0 px-4")}
                      onClick={(e) => handleFormSubmit(e, { saveAndNew: true })}
                      disabled={isLoading}
                    >
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save & New
                    </Button>
                  </div>
                  <Button type="submit" disabled={isLoading || !companyId} className="shrink-0">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </DialogFooter>
            </form>
          </Form>
          </div>
        </DialogContent>
      </Dialog>
      <CreateAccountGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

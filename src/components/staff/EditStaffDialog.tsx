"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import {
  uploadEntityAvatarAndDocumentsRemote,
  syncEntityAttachmentsAfterSave,
  isProfileAvatarImageFile,
  isProfileDocumentFile,
} from "@/lib/entityProfileLocalFiles";
import {
  captureEntityFormAttachmentBaseline,
  finalizeFormAttachmentEditAfterSave,
} from "@/lib/formAttachmentEditHelper";
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb, listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { useAuth } from "@/hooks/useAuth";
import {
  EntityProfilePhotoBlock,
  EntityDocumentsBlock,
  EntityOpeningBalanceNarrationField,
} from "@/components/common/EntityProfileDocumentsNarrationFields";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { apkCloudCompanyOfflineViewOnly, apkCloudEntityMasterReadFromSqliteMirror, apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { MasterFormNameAcNoRow, MasterMobileNoField, masterFormTwoColClass } from "@/components/inter-company/MasterFormLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  cnMasterEntityDialogContent,
  masterEntityDialogHeaderClassName,
  masterEntityDialogFormWrapperClassName,
} from "@/lib/masterEntityDialogClasses";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { CreateStaffGroupDialog } from "./CreateStaffGroupDialog";
import { Textarea } from "../ui/textarea";
import { compressFile } from "@/lib/compression";
import { compressImageForCompany, attachmentImageStillTooLargeToastFields, useImageCompressionProcessing } from "@/lib/attachmentCompressionUi";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { toast as sonnerToast } from "sonner";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { useLiveEntityDocAttachments } from "@/hooks/useLiveEntityDocAttachments";
import { beginApkLedgerAsyncWriteShield } from "@/lib/apkLedgerRouteShield";
import {
  MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS,
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";

/** CreateStaffForm jaisa: Ungrouped bucket → form value `ungrouped_staff` (null / empty legacy). */
function normalizeStaffEditGroupId(groupId: string | null | undefined): string {
  const u = getUngroupedGroupId("staff");
  if (!groupId || groupId === u) return u;
  return groupId;
}

const formSchema = z.object({
  name: z.string().min(2, { message: "Staff name must be at least 2 characters." }),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  salary: z.coerce.number().optional(),
  openingBalance: z.coerce.number().optional(),
  openingBalanceDate: z.date().optional(),
  salaryPeriod: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]).optional(),
  groupId: z.string().optional(),
  openingBalanceNarration: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

export function EditStaffDialog({ staff, allGroups = [], allStaff, onStaffUpdated, onStaffDeleted, children, isOpen, onOpenChange, hasTransactions }: {
  staff: Staff;
  allGroups?: StaffGroup[];
  allStaff?: Staff[];
  onStaffUpdated: (updatedStaff: Partial<Staff>) => void;
  onStaffDeleted: () => void;
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hasTransactions?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const isCompressing = useImageCompressionProcessing();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const dialogOpen = isOpen !== undefined ? isOpen : internalIsOpen;
  const setDialogOpen = onOpenChange ?? setInternalIsOpen;

  const { toast } = useToast();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  const localSqlMirror = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company]);
  const sqliteListsOnlyNoSnapshot = useMemo(
    () => localSqlMirror || apkCloudEntityMasterReadFromSqliteMirror(company),
    [localSqlMirror, company]
  );
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );
  const { processedStaffGroups } = useVouchers();
  const processedStaffGroupsRef = useRef(processedStaffGroups);
  processedStaffGroupsRef.current = processedStaffGroups;
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { canAddAvatar, canAddFileImagePdf } = usePermissions();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const { dateSystem } = useDate();
  const [groups, setGroups] = useState<StaffGroup[]>(allGroups);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [file, setFile] = useState<File | string | null>(staff.fileUrl || null);
  const [docSlots, setDocSlots] = useState<Array<File | string>>(() => staff.documentFileUrls || []);
  const initialFileRef = useRef<string | null>(staff.fileUrl || null);
  const initialDocUrlsRef = useRef<string[]>(staff.documentFileUrls || []);
  const attachmentsDirty =
    file instanceof File ||
    docSlots.some((x) => x instanceof File) ||
    (typeof file === "string" ? file : null) !== initialFileRef.current ||
    JSON.stringify(docSlots.filter((x): x is string => typeof x === "string")) !==
      JSON.stringify(initialDocUrlsRef.current);
  const onLiveAttachmentFields = React.useCallback(
    (fields: { fileUrl?: string | null; documentFileUrls?: string[] }) => {
      if (fields.fileUrl !== undefined) {
        const nextFile = fields.fileUrl || null;
        setFile(nextFile);
        initialFileRef.current = nextFile;
      }
      if (fields.documentFileUrls) {
        setDocSlots(fields.documentFileUrls);
        initialDocUrlsRef.current = fields.documentFileUrls;
      }
    },
    []
  );
  useLiveEntityDocAttachments({
    enabled: dialogOpen,
    companyId,
    collection: "staff",
    entityId: staff.id,
    attachmentsDirty,
    preferSqliteMirror: sqliteListsOnlyNoSnapshot,
    onFields: onLiveAttachmentFields,
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: staff.name,
      email: staff.email || "",
      phone: staff.phone || "",
      address: staff.address || "",
      salary: staff.salary,
      openingBalance: staff.openingBalance || 0,
      openingBalanceDate: (staff as any).openingBalanceDate?.toDate ? (staff as any).openingBalanceDate.toDate() : undefined,
      salaryPeriod: staff.salaryPeriod || "Monthly",
      groupId: normalizeStaffEditGroupId(staff.groupId),
      openingBalanceNarration: staff.openingBalanceNarration ?? "",
    },
  });

  useEffect(() => {
    if (dialogOpen) {
      const dateValue = (staff as any).openingBalanceDate;
      let finalDate;
      if (dateValue?.toDate) {
          finalDate = dateValue.toDate();
      } else if (dateValue instanceof Date) {
          finalDate = dateValue;
      } else if (dateValue) {
          finalDate = new Date(dateValue);
      } else {
          finalDate = undefined;
      }
      form.reset({
        name: staff.name,
        email: staff.email || "",
        phone: staff.phone || "",
        address: staff.address || "",
        salary: staff.salary,
        openingBalance: staff.openingBalance || 0,
        openingBalanceDate: finalDate,
        salaryPeriod: staff.salaryPeriod || "Monthly",
      groupId: normalizeStaffEditGroupId(staff.groupId),
        openingBalanceNarration: staff.openingBalanceNarration ?? "",
    });
      setFile(staff.fileUrl || null);
      setDocSlots(staff.documentFileUrls || []);
      initialFileRef.current = staff.fileUrl || null;
      initialDocUrlsRef.current = staff.documentFileUrls || [];
    }
  }, [dialogOpen, staff, form]);
  
  useEffect(() => {
    if (!dialogOpen || !companyId) return;
    let cancelled = false;

    const seedFb = () => {
      const fb = (processedStaffGroupsRef.current || []) as StaffGroup[];
      if (fb.length) setGroups(fb);
    };

    if (sqliteListsOnlyNoSnapshot) {
      seedFb();
      void (async () => {
        try {
          const rows = await listCompanyDocsFromBrowserDb(companyId, "staff_groups");
          if (cancelled) return;
          if (rows.length) {
            setGroups(rows.map((r: Record<string, unknown> & { id: string }) => ({ ...r, id: r.id } as StaffGroup)));
          }
        } catch (e) {
          console.warn("[EditStaffDialog] staff_groups mirror failed", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const q = query(collection(firestore, `companies/${companyId}/staff_groups`));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        setGroups(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as StaffGroup)));
      },
      (error) => {
        console.error("Error fetching groups:", error);
        const fb = (processedStaffGroupsRef.current || []) as StaffGroup[];
        if (fb.length > 0) setGroups(fb);
      }
    );
    return () => unsubscribe();
  }, [dialogOpen, companyId, processedStaffGroups, sqliteListsOnlyNoSnapshot]);

  function onSubmit(values: z.infer<typeof formSchema>): void {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      return;
    }

    const fileSnap = file;
    const docSlotsSnap = docSlots;
    const staffRefSnap = staff;
    const attachmentBaselineSnap = captureEntityFormAttachmentBaseline({
      fileUrl: initialFileRef.current,
      documentFileUrls: initialDocUrlsRef.current,
    });

    setDialogOpen(false); // Immediate close — APK/PC/mobile; persistence async below

    void (async () => {
      beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
      const toastId = sonnerToast.loading("Updating staff member...");
      const isLocalGuestUser = user?.uid === "local_guest_user";
      const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";
      setIsLoading(true);
      try {
        const { prepareMasterEditAttachmentsForSave } = await import(
          "@/lib/attachmentRecompressOnSave"
        );
        const prepared = await prepareMasterEditAttachmentsForSave({
          companyId,
          avatar: fileSnap,
          documents: docSlotsSnap,
        });
        let fileUrl: string | null = typeof prepared.avatar === "string" ? prepared.avatar : null;
        const newDocFiles = prepared.newDocFiles;
        const keptDocUrls = prepared.keptDocUrls;
        const totalBytes =
          (prepared.avatar instanceof File ? prepared.avatar.size : 0) +
          newDocFiles.reduce((s, f) => s + f.size, 0);
        if (totalBytes > 0 && companyId) {
          const limitCheck = await checkStorageLimit(
            companyId,
            company?.planId,
            { attachmentsBytes: totalBytes, storageBytes: totalBytes },
            company?.storageOption
          );
          if (!limitCheck.allowed) {
            sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
            return;
          }
        }

        const needAvatarUpload = prepared.avatar instanceof File && canAddAvatar;
        const needNewDocsUpload = newDocFiles.length > 0 && canAttachDocuments;
        let documentFileUrls = [...keptDocUrls];
        if (companyId && (needAvatarUpload || needNewDocsUpload)) {
          const st = await uploadEntityAvatarAndDocumentsRemote({
            companyId,
            collectionSeg: "staff",
            entityId: staffRefSnap.id,
            avatarFile: needAvatarUpload ? (prepared.avatar as File) : null,
            documentFiles: needNewDocsUpload ? newDocFiles : [],
          });
          if (st.fileUrl) fileUrl = st.fileUrl;
          documentFileUrls = [...keptDocUrls, ...st.documentFileUrls];
        }

        const oldOpeningBalance = staffRefSnap.openingBalance || 0;
        const newOpeningBalance = values.openingBalance || 0;
        const narrationClean = values.openingBalanceNarration?.trim() || null;

        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "staff", staffRefSnap.id);
          const base: Record<string, unknown> = fromDb ?? {
            id: staffRefSnap.id,
            companyId,
            ownerId: user?.uid ?? "local_guest_user",
            balance: staffRefSnap.balance,
            debit: staffRefSnap.debit,
            credit: staffRefSnap.credit,
            isDeleted: false,
          };
          const payload: Record<string, unknown> = {
            ...base,
            id: staffRefSnap.id,
            name: values.name,
            email: values.email ?? "",
            phone: values.phone ?? "",
            address: values.address ?? "",
            salary: values.salary,
            salaryPeriod: values.salaryPeriod,
            openingBalance: newOpeningBalance,
            openingBalanceDate: values.openingBalanceDate ?? null,
            openingBalanceNarration: narrationClean,
            groupId: values.groupId || null,
            companyId,
            fileUrl: fileUrl ?? (base.fileUrl as string | null) ?? null,
            documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
          };
          await upsertCompanyDocInBrowserDb(companyId, "staff", staffRefSnap.id, payload);
          await enqueueCompanyDocOutbox(companyId, "staff", "update", staffRefSnap.id, payload);
          await syncEntityAttachmentsAfterSave(companyId);
          const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
          onStaffUpdated({
            id: staffRefSnap.id,
            ...values,
            fileUrl: fileUrl || "",
            documentFileUrls,
            openingBalanceNarration: values.openingBalanceNarration?.trim() || "",
          });
          initialFileRef.current = fileUrl || null;
          initialDocUrlsRef.current = documentFileUrls.filter((u): u is string => typeof u === "string");
          finalizeFormAttachmentEditAfterSave({
            companyId,
            baselineUrls: attachmentBaselineSnap,
            finalUrls: captureEntityFormAttachmentBaseline({ fileUrl, documentFileUrls }),
            oldDocRemoteUrls: attachmentBaselineSnap.filter((u) => /^https?:\/\//i.test(u)),
          });
          sonnerToast.success(showSyncHint ? "Updated. Will sync when online." : "Staff Updated!", {
            id: toastId,
            description: showSyncHint ? `"${values.name}" saved locally.` : `"${values.name}" has been successfully updated.`,
          });
          return;
        }

        if (totalBytes > 0 && companyId) {
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: totalBytes,
            storageBytes: totalBytes,
          });
        }

        const staffRef = doc(firestore, `companies/${companyId}/staff`, staffRefSnap.id);
        await updateDoc(staffRef, {
          name: values.name,
          email: values.email ?? "",
          phone: values.phone ?? "",
          address: values.address ?? "",
          salary: values.salary,
          salaryPeriod: values.salaryPeriod,
          openingBalance: newOpeningBalance,
          openingBalanceDate: values.openingBalanceDate || null,
          openingBalanceNarration: narrationClean,
          fileUrl,
          documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
          groupId: values.groupId || null,
          updatedAt: serverTimestamp(),
        });
        await syncEntityAttachmentsAfterSave(companyId);

        if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
          const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
          await balanceOpeningBalanceWithCapital(companyId, "staff", staffRefSnap.id, oldOpeningBalance, newOpeningBalance);
        }

        onStaffUpdated({
          id: staffRefSnap.id,
          ...values,
          fileUrl: fileUrl || "",
          documentFileUrls,
          openingBalanceNarration: values.openingBalanceNarration?.trim() || "",
        });
        initialFileRef.current = fileUrl || null;
        initialDocUrlsRef.current = documentFileUrls.filter((u): u is string => typeof u === "string");
        finalizeFormAttachmentEditAfterSave({
          companyId,
          baselineUrls: attachmentBaselineSnap,
          finalUrls: captureEntityFormAttachmentBaseline({ fileUrl, documentFileUrls }),
          oldDocRemoteUrls: attachmentBaselineSnap.filter((u) => /^https?:\/\//i.test(u)),
        });
        sonnerToast.success("Staff Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      } catch (error) {
        console.error("Error updating staff:", error);
        sonnerToast.error("Error Updating Staff", {
          id: toastId,
          description: error instanceof Error ? error.message : "An error occurred. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsDeleteDialogOpen(false);
      return;
    }
    if (hasTransactions) {
      sonnerToast.error("Cannot Delete", { description: "This staff member has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "staff", staff.id);
          const base: Record<string, unknown> = fromDb ?? {
            id: staff.id,
            companyId,
            balance: staff.balance,
            debit: staff.debit,
            credit: staff.credit,
            isDeleted: false,
            ownerId: user?.uid ?? "local_guest_user",
            name: staff.name,
          };
          const payload: Record<string, unknown> = {
            ...base,
            id: staff.id,
            companyId,
            isDeleted: true,
            deletedAt: new Date(),
          };
          await upsertCompanyDocInBrowserDb(companyId, "staff", staff.id, payload);
          await enqueueCompanyDocOutbox(companyId, "staff", "update", staff.id, payload);
        } else {
        await updateDoc(doc(firestore, `companies/${companyId}/staff`, staff.id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
        });
        }
        toast({ title: "Staff Member Moved to Bin", description: `"${staff.name}" has been moved.`});
        onStaffDeleted();
      setDialogOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting staff: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the staff member.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };

  const removeAvatar = () => {
    setFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleDocsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAttachDocuments) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow documents." });
      return;
    }
    const incoming = Array.from(e.target.files).filter(isProfileDocumentFile);
    setDocSlots((prev) => [...prev, ...incoming].slice(0, 5));
    e.target.value = "";
  };

  const removeDocAt = (idx: number) => setDocSlots((p) => p.filter((_, i) => i !== idx));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding or changing avatar/file." });
      return;
    }
    const inputFile = e.target.files[0];
    if (!isProfileAvatarImageFile(inputFile)) {
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
      return;
    }

    if (inputFile) {
      try {
        const { file: compressedFile, maxBytes, maxKb } = await compressImageForCompany(inputFile, companyId);
         
        setFile(compressedFile);
      } catch (err) {
        console.error("File compression error:", err);
        toast({
            variant: "destructive",
            title: "File Error",
            description: "Could not process the file.",
        });
      }
    }
  };

  // CreateStaffForm ke saath: synthetic Ungrouped; `ungrouped_staff` doc list se isAutoUngrouped filter se hat jata hai
  const staffGroupOptions = useMemo(
    () => [
      { value: getUngroupedGroupId("staff"), label: "Ungrouped" },
      ...groups
        .filter(
          (g) =>
            !(g as any).isSystemReserved && (g as any).isAutoUngrouped !== true
        )
        .map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {dialogOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent
            className={cn(cnMasterEntityDialogContent(isMobile), "sm:max-w-2xl")}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader className={masterEntityDialogHeaderClassName}>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update the details for {staff.name}.</DialogDescription>
          </DialogHeader>
          <div className={masterEntityDialogFormWrapperClassName}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="pl-master-form-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:pr-2">
              <div className={masterFormTwoColClass}>
                <MasterFormNameAcNoRow
                  entityKind="staff"
                  entityId={staff.id}
                  mode="edit"
                  nameField={
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Jane Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  }
                />
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }: any) => (
                  <FormItem className="flex flex-col space-y-1 w-full">
                      <FormLabel>Group/Department (Optional)</FormLabel>
                      <FormControl>
                        <div className="w-full">
                           <Combobox
                              options={staffGroupOptions}
                              value={field.value}
                              onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateGroupOpen(true);
                                    setTimeout(() => {
                                      document.dispatchEvent(new CustomEvent('prefill-create-staff-group-name', { detail: newName }));
                                    }, 100);
                                  } else {
                                    field.onChange(val === 'none' ? '' : val);
                                  }
                              }}
                              placeholder="Select a group"
                              addNewLabel="+ Add New Group"
                            />
                        </div>
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
                        <Input type="email" placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <MasterMobileNoField control={form.control} />
                   <FormItem>
                      <FormLabel>Salary</FormLabel>
                      <div className="flex gap-2">
                        <FormField
                          control={form.control}
                          name="salary"
                          render={({ field }: any) => (
                            <FormItem className="flex-1">
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                         <FormField
                          control={form.control}
                          name="salaryPeriod"
                          render={({ field }: any) => (
                            <FormItem>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Daily">Daily</SelectItem>
                                  <SelectItem value="Weekly">Weekly</SelectItem>
                                  <SelectItem value="Monthly">Monthly</SelectItem>
                                  <SelectItem value="Yearly">Yearly</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </FormItem>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter full address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>
                <EntityProfilePhotoBlock
                  file={file}
                  onPickClick={() => avatarInputRef.current?.click()}
                  fileInputRef={avatarInputRef}
                  onAvatarChange={handleFileChange}
                  onRemoveAvatar={removeAvatar}
                  canAddAvatar={canAddAvatar}
                  attachmentCompanyId={companyId ?? undefined}
                  attachmentReusePlaceKey={staff.id ? `staff/${staff.id}` : null}
                />
                <EntityDocumentsBlock
                  docSlots={docSlots}
                  setDocSlots={setDocSlots}
                  onRemoveDoc={removeDocAt}
                  onAddClick={() => docsInputRef.current?.click()}
                  docsInputRef={docsInputRef}
                  onDocsChange={handleDocsChange}
                  canAttachDocuments={canAttachDocuments}
                  attachmentCompanyId={companyId ?? undefined}
                  attachmentReusePlaceKey={staff.id ? `staff/${staff.id}` : null}
                  entityStatementLabel="staff"
                />
                <EntityOpeningBalanceNarrationField
                  control={form.control}
                  name="openingBalanceNarration"
                  detailLabel="staff"
                />
              </div>
            </div>

              <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>
                    Cancel
                  </Button>
                </DialogClose>
                <div className="flex min-w-0 flex-1 justify-center px-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex max-w-full min-w-0 shrink" tabIndex={0}>
                          <Button
                            type="button"
                            variant="destructive"
                            className="shrink-0 px-3 sm:px-4"
                            onClick={() => setIsDeleteDialogOpen(true)}
                            disabled={isLoading || isCompressing || hasTransactions || apkOfflineViewOnly}
                          >
                            <Trash2 className="mr-2 h-4 w-4 shrink-0" /> Move to Bin
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {hasTransactions && (
                        <TooltipContent>
                          <p>Cannot delete a staff member with existing transactions.</p>
                        </TooltipContent>
                      )}
                      {!hasTransactions && apkOfflineViewOnly && (
                        <TooltipContent>
                          <p>Offline — view only.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button type="submit" disabled={isLoading || isCompressing || apkOfflineViewOnly} className="shrink-0">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will move the staff member <span className="font-semibold text-foreground">{staff.name}</span> to the recycle bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={apkOfflineViewOnly} onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Move to Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreateStaffGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

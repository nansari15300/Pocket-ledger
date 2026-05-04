
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon, Upload } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, collection, query, Timestamp } from "firebase/firestore";
import {
  stageEntityAvatarAndDocuments,
  uploadEntityAvatarAndDocumentsRemote,
  isProfileAvatarImageFile,
  isProfileDocumentFile,
} from "@/lib/entityProfileLocalFiles";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import type { Party, Group } from "@/components/party/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Textarea } from "../ui/textarea";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { toast as sonnerToast } from "sonner";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import { FilePreview } from "../vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { balanceOpeningBalanceWithCapital } from "@/lib/voucherActionsClient";
import { useVouchers } from "@/hooks/useVouchers";
import { apkCloudCompanyOfflineViewOnly, apkCloudEntityMasterReadFromSqliteMirror, apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { getCompanyDocFromBrowserDb, listCompanyDocsFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { getUngroupedGroupId } from "@/lib/ungrouped-groups";
import {
  MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS,
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";

/** Create form jaisa: combobox value hamesha `ungrouped_party` ho jab party bucket “Ungrouped” ho (null / legacy empty). */
function normalizePartyEditGroupId(groupId: string | null | undefined): string {
  const u = getUngroupedGroupId("party");
  if (!groupId || groupId === u) return u;
  return groupId;
}

const formSchema = z.object({
  name: z.string().min(2, { message: "Party name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal("")),
  phone: z.string().optional(),
  pan: z.string().optional(),
  address: z.string().optional(),
  groupId: z.string().optional(),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
  openingBalanceNarration: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

/** Save toast — lamba "Saving…" hata, chhota feedback (PC/mobile). */
const PARTY_TOAST_OK_MS = 1000;

export function EditPartyDialog({ party, onPartyUpdated, onPartyDeleted, children, hasTransactions }: {
  party: Party;
  onPartyUpdated: (updatedParty: Partial<Party>) => void;
  onPartyDeleted: (deletedId: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  /** Pure-local APK SQLite writes; APK cloud Firebase = Firestore saves par bhi dropdown lists SQLite mirror se (`apkCloudEntityMasterReadFromSqliteMirror`). */
  const localSqlMirror = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company]);
  const sqliteListsOnlyNoSnapshot = useMemo(
    () => localSqlMirror || apkCloudEntityMasterReadFromSqliteMirror(company),
    [localSqlMirror, company]
  );
  /** APK cloud offline: sirf dekho — Save/Bin toolbar band; Cancel/`DialogClose` khula. */
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );
  const { processedGroups } = useVouchers();
  /** Dialog effect me Firestore fail hone par bhi latest list — deps me poora array na dalein (balance churn). */
  const processedGroupsRef = React.useRef(processedGroups);
  processedGroupsRef.current = processedGroups;
  const { canAddAvatar, canAddFileImagePdf } = usePermissions();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const { dateSystem } = useDate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  /** Profile photo only — image; string = saved URL or local: ref */
  const [file, setFile] = useState<File | string | null>(party.fileUrl || null);
  /** PDF / images — File new pick ya existing URL string */
  const [docSlots, setDocSlots] = useState<Array<File | string>>(() => party.documentFileUrls || []);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
        name: party.name,
        email: party.email || "",
        phone: party.phone || "",
        pan: party.pan || "",
        address: party.address || "",
        groupId: normalizePartyEditGroupId(party.groupId),
        openingBalance: party.openingBalance || 0,
        openingBalanceDate: (party as any).openingBalanceDate?.toDate ? (party as any).openingBalanceDate.toDate() : undefined,
        openingBalanceNarration: party.openingBalanceNarration ?? "",
    },
  });
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setTimeout(() => setIsCreateGroupOpen(false), 50);
  };

  useEffect(() => {
    if (!isOpen || !companyId) return;
    let cancelled = false;

    const applyPartyGroups = (list: Group[]) => {
      setGroups(
        list.filter((g: any) => g?.id && !g.isDeleted && !(g as any).isSystemReserved)
      );
    };

    const seedFromVoucherContext = () => {
      const fromCtx = (processedGroupsRef.current || []).filter(
        (g: any) => !g.isDeleted && !g.isSystemReserved
      ) as Group[];
      if (fromCtx.length) applyPartyGroups(fromCtx);
    };

    const loadGroupsFromBrowserDb = async (): Promise<Group[]> => {
      try {
        const rows = await listCompanyDocsFromBrowserDb(companyId, "groups");
        return rows.map((r: any) => ({ ...r, id: r.id } as Group));
      } catch {
        return [];
      }
    };

    seedFromVoucherContext();

    // APK cloud bhi redundant `onSnapshot` band — SQLite mirror (`warm sync`) authoritative lists ke liye.
    if (sqliteListsOnlyNoSnapshot) {
      void (async () => {
        const fromDb = await loadGroupsFromBrowserDb();
        if (cancelled) return;
        if (fromDb.length) applyPartyGroups(fromDb);
      })();
      return () => {
        cancelled = true;
      };
    }

    const q = query(collection(firestore, `companies/${companyId}/groups`));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        if (cancelled) return;
        applyPartyGroups(querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Group)));
      },
      async (error) => {
        console.error("Error fetching groups:", error);
        if (cancelled) return;
        const fromDb = await loadGroupsFromBrowserDb();
        if (cancelled) return;
        if (fromDb.length) {
          applyPartyGroups(fromDb);
          return;
        }
        seedFromVoucherContext();
        if (cancelled) return;
        // Synthetic "Ungrouped" combobox option hamesha hai — listener glitch par user ko disturb mat karo
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isOpen, companyId, toast, sqliteListsOnlyNoSnapshot]);


  useEffect(() => {
    if (isOpen) {
      const dateValue = (party as any).openingBalanceDate;
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
        name: party.name,
        email: party.email || "",
        phone: party.phone || "",
        pan: party.pan || "",
        address: party.address || "",
        groupId: normalizePartyEditGroupId(party.groupId),
        openingBalance: party.openingBalance || 0,
        openingBalanceDate: finalDate,
        openingBalanceNarration: party.openingBalanceNarration ?? "",
      });
      setFile(party.fileUrl || null);
      setDocSlots(party.documentFileUrls || []);
    }
  }, [isOpen, party, form]);

  async function onSubmit(values: z.infer<typeof formSchema>): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      return;
    }

    const isLocalGuestUser = user?.uid === "local_guest_user";
    const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";
    const fileSnap = file;
    const docSlotsSnap = docSlots;
    const partyRefSnap = party;

    // PC/mobile/APK: form turant band; storage/Firestore ka kaam niche async (`void` block) — user block nahi
    setIsOpen(false);

    void (async () => {
      setIsLoading(true);
      try {
        let fileUrl: string | null = typeof fileSnap === "string" ? fileSnap : null;
        const newDocFiles = docSlotsSnap.filter((x): x is File => x instanceof File);
        const keptDocUrls = docSlotsSnap.filter((x): x is string => typeof x === "string");
        const totalBytes =
          (fileSnap instanceof File ? fileSnap.size : 0) + newDocFiles.reduce((s, f) => s + f.size, 0);
        if (totalBytes > 0 && companyId) {
          const limitCheck = await checkStorageLimit(
            companyId,
            company?.planId,
            { attachmentsBytes: totalBytes, storageBytes: totalBytes },
            company?.storageOption
          );
          if (!limitCheck.allowed) {
            sonnerToast.error("Storage limit reached", { description: limitCheck.message, duration: 4000 });
            return;
          }
        }

        const needAvatarUpload = fileSnap instanceof File && canAddAvatar;
        const needNewDocsUpload = newDocFiles.length > 0 && canAttachDocuments;
        let documentFileUrls = [...keptDocUrls];
        if (companyId && (needAvatarUpload || needNewDocsUpload)) {
          const runRemote = () =>
            uploadEntityAvatarAndDocumentsRemote({
              companyId,
              collectionSeg: "parties",
              entityId: partyRefSnap.id,
              avatarFile: needAvatarUpload ? (fileSnap as File) : null,
              documentFiles: needNewDocsUpload ? newDocFiles : [],
            });
          const runStage = () =>
            stageEntityAvatarAndDocuments({
              companyId,
              collectionSeg: "parties",
              entityId: partyRefSnap.id,
              avatarFile: needAvatarUpload ? (fileSnap as File) : null,
              documentFiles: needNewDocsUpload ? newDocFiles : [],
            });

          let st: { fileUrl: string | null; documentFileUrls: string[] };
          if (!localSqlMirror) {
            st = await runRemote();
          } else if (typeof navigator !== "undefined" && navigator.onLine) {
            try {
              st = await runRemote();
            } catch (e) {
              console.warn("[EditParty] Remote file upload failed, using local staging", e);
              st = await runStage();
            }
          } else {
            st = await runStage();
          }
          if (st.fileUrl) fileUrl = st.fileUrl;
          documentFileUrls = [...keptDocUrls, ...st.documentFileUrls];
        }

        const oldOpeningBalance = partyRefSnap.openingBalance || 0;
        const newOpeningBalance = values.openingBalance || 0;
        const resolvedGroupId = values.groupId?.trim() || getUngroupedGroupId("party");
        const narrationClean = values.openingBalanceNarration?.trim() || null;

        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "parties", partyRefSnap.id);
          const base: Record<string, unknown> = fromDb ?? {
            id: partyRefSnap.id,
            companyId,
            ownerId: user?.uid ?? "local_guest_user",
            balance: partyRefSnap.balance ?? 0,
            debit: partyRefSnap.debit ?? 0,
            credit: partyRefSnap.credit ?? 0,
            isDeleted: false,
          };
          const payload: Record<string, unknown> = {
            ...base,
            id: partyRefSnap.id,
            name: values.name,
            address: values.address ?? "",
            phone: values.phone ?? "",
            email: values.email ?? "",
            pan: values.pan ?? "",
            openingBalance: newOpeningBalance,
            openingBalanceDate: values.openingBalanceDate ?? null,
            openingBalanceNarration: narrationClean,
            groupId: resolvedGroupId,
            companyId,
            fileUrl: fileUrl ?? (base.fileUrl as string | null) ?? null,
            documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
          };
          await upsertCompanyDocInBrowserDb(companyId, "parties", partyRefSnap.id, payload);
          await enqueueCompanyDocOutbox(companyId, "parties", "update", partyRefSnap.id, payload);
          const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
          onPartyUpdated({
            id: partyRefSnap.id,
            ...values,
            fileUrl: fileUrl || "",
            documentFileUrls,
            openingBalanceNarration: values.openingBalanceNarration?.trim() || "",
          });
          sonnerToast.success(showSyncHint ? "Saved — will sync" : "Updated", {
            duration: PARTY_TOAST_OK_MS,
            description: showSyncHint ? "Background sync" : values.name,
          });
          return;
        }

        if (totalBytes > 0 && companyId) {
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: totalBytes,
            storageBytes: totalBytes,
          });
        }

        const partyRef = doc(firestore, `companies/${companyId}/parties`, partyRefSnap.id);
        await updateDoc(partyRef, {
          name: values.name,
          email: values.email ?? "",
          phone: values.phone ?? "",
          pan: values.pan ?? "",
          address: values.address ?? "",
          openingBalance: newOpeningBalance,
          openingBalanceDate: values.openingBalanceDate ?? null,
          openingBalanceNarration: narrationClean,
          fileUrl: fileUrl ?? null,
          documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
          groupId: resolvedGroupId,
        });

        if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
          await balanceOpeningBalanceWithCapital(companyId, "parties", partyRefSnap.id, oldOpeningBalance, newOpeningBalance);
        }

        onPartyUpdated({
          id: partyRefSnap.id,
          ...values,
          fileUrl: fileUrl || "",
          documentFileUrls,
          openingBalanceNarration: values.openingBalanceNarration?.trim() || "",
        });
        sonnerToast.success("Updated", { duration: PARTY_TOAST_OK_MS, description: values.name });
      } catch (error) {
        console.error("Error updating party:", error);
        sonnerToast.error("Couldn’t save", {
          duration: 5000,
          description: error instanceof Error ? error.message : "Please try again.",
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
      sonnerToast.error("Cannot Delete", { description: "This party has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    
    setIsLoading(true);
    try {
      if (localSqlMirror) {
        const fromDb = await getCompanyDocFromBrowserDb(companyId, "parties", party.id);
        const base: Record<string, unknown> = fromDb ?? {
          id: party.id,
          companyId,
          ownerId: user?.uid ?? "local_guest_user",
          balance: party.balance ?? 0,
          debit: party.debit ?? 0,
          credit: party.credit ?? 0,
          name: party.name,
          groupId: party.groupId ?? getUngroupedGroupId("party"),
          isDeleted: false,
        };
        const payload: Record<string, unknown> = {
          ...base,
          id: party.id,
          companyId,
          isDeleted: true,
          deletedAt: Timestamp.now(),
        };
        await upsertCompanyDocInBrowserDb(companyId, "parties", party.id, payload);
        await enqueueCompanyDocOutbox(companyId, "parties", "update", party.id, payload);
      } else {
        await updateDoc(doc(firestore, `companies/${companyId}/parties`, party.id), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
        });
      }
        toast({ title: "Party Moved to Bin", description: `"${party.name}" has been moved to the recycle bin.`});
        onPartyDeleted(party.id);
        setIsOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting party: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the party.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow changing profile photo." });
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
        title: "File Too Large",
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
      setFile(compressedFile);
    } catch (err) {
      console.error("File compression error:", err);
      toast({ variant: "destructive", title: "File Error", description: "Could not process the file." });
    }
    e.target.value = "";
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

  const removeAvatar = () => {
    setFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const removeDocAt = (idx: number) => setDocSlots((p) => p.filter((_, i) => i !== idx));

  const partyGroupOptions = React.useMemo(() => {
    // CreatePartyForm ke saath milao: pehle synthetic Ungrouped; `ungrouped_party` doc list se `isAutoUngrouped` filter se hat jata hai
    return [
      { value: getUngroupedGroupId("party"), label: "Ungrouped" },
      ...groups
        .filter(
          (group) =>
            !(group as any).isSystemReserved && (group as any).isAutoUngrouped !== true
        )
        .map((group) => ({ value: group.id, label: group.name })),
    ];
  }, [groups]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {isOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent
            className="z-50 max-h-[85vh] w-[98vw] max-w-[98vw] flex min-h-0 flex-col rounded-xl px-0.5 sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:px-6"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Party</DialogTitle>
            <DialogDescription>Update the details for {party.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            {/* Scroll body + ek hi row footer: Cancel • Bin • Save — pehle grid me Save neeche doosri line tha */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }: any) => (
                        <FormItem>
                        <FormLabel>Party Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Creative Solutions Ltd." {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-col space-y-1 w-full">
                      <FormLabel>Group</FormLabel>
                      <FormControl>
                        <div className="w-full">
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
                        <Input placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Phone No.</FormLabel>
                      <FormControl>
                        <Input placeholder="+91 12345 67890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pan"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>PAN No.</FormLabel>
                      <FormControl>
                        <Input placeholder="ABCDE1234F" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* OB + date — File tick hata: attachments sirf Documents section + statement row */}
                <div className="md:col-span-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }: any) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="123 Main Street, Anytown..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
                <FormItem>
                  <FormLabel>Profile photo</FormLabel>
                  {!canAddAvatar ? (
                    <p className="text-xs text-muted-foreground">
                      Upgrade plan to change profile photo.{" "}
                      <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Upgrade</Link>
                    </p>
                  ) : (
                    <div className="flex items-center gap-4 flex-wrap">
                      {file ? <FilePreview file={file} onRemove={removeAvatar} /> : null}
                      {!file ? (
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
                      ) : null}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">Images only — shown on profile / avatar.</p>
                </FormItem>

                <FormItem>
                  <FormLabel>Documents</FormLabel>
                  <p className="text-xs text-muted-foreground mb-1 leading-snug">
                    Optional supporting files for this party (PDF or images — e.g. registration, agreement scans). Up to 5 files; stored with the party and available from the statement.
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-1">
                    On the party statement they show on the opening balance row under the <span className="font-medium">File</span> column (green tick), like voucher attachments.
                  </p>
                  {!canAttachDocuments ? (
                    <p className="text-xs text-muted-foreground">
                      Upgrade for PDF/image attachments.{" "}
                      <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Upgrade</Link>
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-start gap-2">
                      {docSlots.map((slot, idx) => (
                        <FilePreview
                          key={typeof slot === "string" ? `${slot}-${idx}` : `${slot.name}-${idx}-${slot.size}`}
                          file={slot}
                          onRemove={() => removeDocAt(idx)}
                          size={96}
                        />
                      ))}
                      {docSlots.length < 5 ? (
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
                              onChange={handleDocsChange}
                              accept="image/*,application/pdf"
                              multiple
                            />
                          </div>
                        </FormControl>
                      ) : null}
                    </div>
                  )}
                </FormItem>

                <FormField
                  control={form.control}
                  name="openingBalanceNarration"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Opening balance narration (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. OB brought forward…"
                          className="min-h-[72px] resize-y"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <p className="text-[10px] text-muted-foreground">
                        Shown on the party statement under the Opening Balance row (voucher-style narration).
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

            </div>
              <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                {/* Taarteeb: Cancel (baaen) | Move to Bin (beech) | Save (daaen); shadcn DialogFooter ka flex-col-reverse yahan row se replace */}
                <DialogClose asChild>
                  {/* Gray pill: user ask — ghost ke upar slate fill (global pill = rounded-full pehle se) */}
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
                            disabled={hasTransactions || apkOfflineViewOnly}
                          >
                            <Trash2 className="mr-2 h-4 w-4 shrink-0" /> Move to Bin
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {hasTransactions && (
                        <TooltipContent>
                          <p>Cannot delete a party with existing transactions.</p>
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
                {/* APK cloud offline par submit band — sirf Cancel/close chalu */}
                <Button type="submit" className="shrink-0" disabled={isLoading || apkOfflineViewOnly}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will move the party <span className="font-semibold text-foreground">{party.name}</span> to the recycle bin.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                {/* Gray pill Cancel — AlertDialog baked `outline` ke saath slate odd/even bhi constants me */}
                <AlertDialogCancel className={MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={apkOfflineViewOnly}
                  onClick={handleDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                    Move to Bin
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreateGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

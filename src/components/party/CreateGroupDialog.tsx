
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, serverTimestamp, Timestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import type { Group } from "@/components/party/types";
import { isSystemGroupName } from "@/lib/system-group-names";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import {
  apkCloudCompanyOfflineViewOnly,
  apkEntityWriteUsesLocalSqliteMirror,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox, isLikelyOfflineFirestoreError } from "@/lib/localVoucherOutbox";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});

const systemGroups = [
    { id: "sundry_debtors", name: "Sundry Debtors" },
    { id: "sundry_creditors", name: "Sundry Creditors" },
];

function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function CreateGroupDialog({ onGroupCreated, children, groups = [], isOpen: parentIsOpen, onOpenChange: parentOnOpenChange }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: Group[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const isLocalGuestUser = user?.uid === "local_guest_user";
  const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";
  const navigatorOnline = useNavigatorOnline();
  const apkOfflineViewOnly = useMemo(() => apkCloudCompanyOfflineViewOnly(company, navigatorOnline), [company, navigatorOnline]);

  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;
  /** Parent `isOpen` pass = controlled — trigger bahar; DialogTrigger asChild ref loop avoid */
  const isDialogControlled = parentIsOpen !== undefined;
  // Dialog close ko single helper se chalao so controlled/uncontrolled dono mode mein blur overlay na atke.
  const closeDialog = () => setOpen(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      parentId: "sundry_debtors",
    },
  });

    useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-group-name', handlePrefill);
    };
  }, [form]);

  async function onSubmit(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }
     if (!companyId) {
        toast({ variant: "destructive", title: "Company Not Selected", description: "Please select a company first." });
        return;
    }
    if (apkOfflineViewOnly) {
      toast({
        variant: "destructive",
        title: "Offline — view only",
        description: "Connect to the internet to create a group.",
      });
      return;
    }
    setIsLoading(true);
    try {
      if (apkEntityWriteUsesLocalSqliteMirror(company)) {
        // Local-only mode: group direct local DB me save karo; Firebase write skip.
        const localId = createLocalEntityId("group");
        const payload = {
          id: localId,
          name: values.name.trim(),
          ownerId: user.uid,
          companyId,
          parentId: values.parentId,
          createdAt: Timestamp.now(),
          isDeleted: false,
        };
        await upsertCompanyDocInBrowserDb(companyId, "groups", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "groups", "create", localId, payload);
        // Show sync hint only for sync-enabled non-guest users.
        const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
        toast({
          title: showSyncHint ? "Saved. Will sync when online." : "Saved.",
          description: showSyncHint
            ? `"${values.name}" was saved locally and will sync when online.`
            : `"${values.name}" was saved locally.`,
        });
        onGroupCreated(localId);
        if (saveAndNew) {
          form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
        } else {
          form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
          closeDialog();
        }
        return;
      }

      const nameTrimmed = values.name.trim();
      
      // Check if it's a system group name
      if (isSystemGroupName("party", nameTrimmed)) {
        toast({
          variant: "destructive",
          title: "System Group Name",
          description: "This is a system group name. Please use another name.",
        });
        setIsLoading(false);
        return;
      }
      
      // Recycle-bin duplicate flow: restore or create-new on user choice.
      const duplicateDecision = await resolveRecycleBinDuplicate({
        companyId,
        collectionName: "groups",
        name: nameTrimmed,
        entityLabel: "Party Group",
      });
      if (duplicateDecision.decision === "active_exists") {
        toast({
          variant: "destructive",
          title: "Duplicate Group Name",
          description: "A group with this name already exists. Please choose a different name.",
        });
        setIsLoading(false);
        return;
      }
      if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
        toast({
          title: "Group Restored!",
          description: `"${nameTrimmed}" was restored from Recycle Bin.`,
        });
        onGroupCreated(duplicateDecision.restoredId);
        if (saveAndNew) {
          form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
        } else {
          form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
          closeDialog();
        }
        setIsLoading(false);
        return;
      }

      const payload = {
        name: values.name.trim(),
        ownerId: user.uid,
        companyId: companyId,
        parentId: values.parentId,
        createdAt: serverTimestamp(),
        isDeleted: false,
      };
      const collRef = collection(firestore, `companies/${companyId}/groups`);

      const docRef = await addDoc(collRef, payload);

      toast({
        title: "Group Created!",
        description: `"${values.name}" has been successfully created.`,
      });

      onGroupCreated(docRef.id);

      if (saveAndNew) {
        form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
      } else {
        form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
        closeDialog();
      }
    } catch (error: any) {
      console.error("Error creating group:", error);
      const isOfflineFallback = apkEntityWriteUsesLocalSqliteMirror(company) && isLikelyOfflineFirestoreError(error);
      if (isOfflineFallback) {
        // Offline/local create: local company_docs + outbox enqueue so list me turant dikhe.
        const localId = createLocalEntityId("group");
        const payload = {
          id: localId,
          name: values.name.trim(),
          ownerId: user.uid,
          companyId,
          parentId: values.parentId,
          createdAt: Timestamp.now(),
          isDeleted: false,
        };
        await upsertCompanyDocInBrowserDb(companyId, "groups", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "groups", "create", localId, payload);
        const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
        toast({
          title: showSyncHint ? "Saved. Will sync when online." : "Saved.",
          description: showSyncHint
            ? `"${values.name}" was saved locally and will sync when online.`
            : `"${values.name}" was saved locally.`,
        });
        onGroupCreated(localId);
        if (!saveAndNew) closeDialog();
        form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
      } else {
        toast({
          variant: "destructive",
          title: "Error Creating Group",
          description: "Group details could not be saved. Please try again.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }
  return (
    <>
      {isDialogControlled && children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
      {!isDialogControlled && children && (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}
      {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
      <DialogContent className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 py-4 sm:max-h-none sm:w-full sm:max-w-md sm:grid sm:flex-none sm:px-6">
        <DialogHeader>
          <DialogTitle>Create a New Group</DialogTitle>
          <DialogDescription>Add a new group to categorize your parties.</DialogDescription>
        </DialogHeader>
        {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
        <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(data => onSubmit(data, false))} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Group Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Local Suppliers" {...field} className="h-9 text-sm px-3 rounded-md" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Parent Group</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a parent group" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>System Groups</SelectLabel>
                        {systemGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                                {group.name}
                            </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>Cancel</Button>
                </DialogClose>
                <div className="flex min-w-0 flex-1 justify-center px-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(BTN_SAVE_NEW_CLASS, "shrink-0 px-4")}
                    onClick={form.handleSubmit(data => onSubmit(data, true))}
                    disabled={isLoading || apkOfflineViewOnly}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                </div>
                <Button type="submit" disabled={isLoading || !companyId || apkOfflineViewOnly} className="shrink-0">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Group
                </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

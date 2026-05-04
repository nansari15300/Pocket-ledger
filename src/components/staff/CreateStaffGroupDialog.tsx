
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
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
import type { StaffGroup } from "@/components/staff/types";
import { isSystemParentGroup } from "@/lib/system-groups";
import { isSystemGroupName } from "@/lib/system-group-names";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import {
  apkCloudCompanyOfflineViewOnly,
  apkEntityWriteUsesLocalSqliteMirror,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";

function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});

const FALLBACK_STAFF_SYSTEM_GROUPS: Array<{ id: string; name: string }> = [
  { id: "loans_liabilities", name: "Loans & Liabilities" },
];


export function CreateStaffGroupDialog({ onGroupCreated, children, isOpen, onOpenChange, groups = [] }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: StaffGroup[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  /** APK + cloud company offline: staff group Create band (`apkCloudCompanyOfflineViewOnly`). */
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      parentId: "loans_liabilities",
    },
  });

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-staff-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-staff-group-name', handlePrefill);
    };
  }, [form]);

  async function onSubmit(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }
    if (apkOfflineViewOnly) {
      toast({
        variant: "destructive",
        title: "Offline — view only",
        description: "Connect to create a staff group.",
      });
      return;
    }
    setIsLoading(true);
    
    try {
      if (apkEntityWriteUsesLocalSqliteMirror(company)) {
        // Local-only mode: save staff group locally and queue backup sync.
        const localId = createLocalEntityId("staff_group");
        const payload = {
          id: localId,
          name: values.name.trim(),
          ownerId: user.uid,
          companyId,
          isDeleted: false,
          parentId: values.parentId,
          createdAt: new Date().toISOString(),
        };
        await upsertCompanyDocInBrowserDb(companyId, "staff_groups", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "staff_groups", "create", localId, payload);
        const showSyncHint = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" && user.uid !== "local_guest_user";
        toast({
          title: showSyncHint ? "Saved. Will sync when online." : "Saved.",
          description: showSyncHint
            ? `"${values.name}" was saved locally and will sync when online.`
            : `"${values.name}" was saved locally.`,
        });
        onGroupCreated(localId);
        if (saveAndNew) form.reset({ name: "", parentId: "loans_liabilities" });
        else if (onOpenChange) onOpenChange(false);
        return;
      }

      const nameTrimmed = values.name.trim();
      
      // Check if it's a system group name
      if (isSystemGroupName("staff", nameTrimmed)) {
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
        collectionName: "staff_groups",
        name: nameTrimmed,
        entityLabel: "Staff Group",
      });
      if (duplicateDecision.decision === "active_exists") {
        toast({
          variant: "destructive",
          title: "Duplicate Group Name",
          description: "A group with this name already exists.",
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
        if (saveAndNew) form.reset({ name: "", parentId: "loans_liabilities" });
        else if (onOpenChange) onOpenChange(false);
        setIsLoading(false);
        return;
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/staff_groups`), {
        name: values.name.trim(),
        ownerId: user.uid,
        companyId: companyId,
        isDeleted: false,
        parentId: values.parentId,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Group Created!", description: `"${values.name}" has been successfully created.` });
      
      onGroupCreated(docRef.id);
      if (saveAndNew) {
        form.reset({ name: "", parentId: "loans_liabilities" });
      } else {
        if(onOpenChange) onOpenChange(false);
      }
    } catch (error) {
      console.error("Error creating group:", error);
      toast({ variant: "destructive", title: "Error Creating Group", description: "Group details could not be saved." });
    } finally {
      setIsLoading(false);
    }
  }

  const { systemGroups, userGroups } = useMemo(() => {
      const dynamicSystem = groups.filter(g => (g as any).isSystemReserved);
      const system = dynamicSystem.length > 0
        ? dynamicSystem
        : (FALLBACK_STAFF_SYSTEM_GROUPS as unknown as StaffGroup[]);
      const userDefined = groups.filter(g => !(g as any).isSystemReserved);
      return { systemGroups: system, userGroups: userDefined };
  }, [groups]);

  useEffect(() => {
    const currentParent = form.getValues("parentId");
    if (!currentParent && systemGroups.length > 0) {
      // Local-only fallback: keep a valid default parent selected.
      form.setValue("parentId", systemGroups[0].id, { shouldDirty: false });
    }
  }, [systemGroups, form]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogPortal>
        <DialogOverlay />
        {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
        <DialogContent 
          className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 z-[60] sm:max-h-none sm:w-full sm:max-w-md sm:grid sm:flex-none sm:px-6"
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a New Staff Group</DialogTitle>
            <DialogDescription>Add a new group to categorize your staff members (e.g. by department).</DialogDescription>
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
                      <Input placeholder="e.g., Sales Department" {...field} />
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
                            {systemGroups
                              .filter(g => isSystemParentGroup("staff_groups", g.id))
                              .map(g => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.name}
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
        </DialogPortal>
    </Dialog>
  );
}

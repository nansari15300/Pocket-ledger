
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
import type { TaxGroup } from "./types";
import { toast as sonnerToast } from "sonner";
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

const FALLBACK_TAX_SYSTEM_GROUPS: Array<{ id: string; name: string }> = [
  { id: "duties_taxes", name: "Duties & Taxes" },
];


export function CreateTaxGroupDialog({ onGroupCreated, children, isOpen, onOpenChange, groups = [] }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: TaxGroup[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  /** APK + Firestore company offline: tax group create band (`apkCloudCompanyOfflineViewOnly`). */
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      parentId: "duties_taxes",
    },
  });

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-tax-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-tax-group-name', handlePrefill);
    };
  }, [form]);

  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }

    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      return;
    }

    // Close dialog immediately for better UX
    if (!options.saveAndNew && onOpenChange) {
      onOpenChange(false);
    }
    
    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsLoading(false);
      return;
    }

    const toastId = sonnerToast.loading("Creating group...");
    setIsLoading(true);
    
    try {
      if (apkEntityWriteUsesLocalSqliteMirror(company)) {
        // Local-only mode: save tax group locally and queue backup sync.
        const localId = createLocalEntityId("tax_group");
        const payload = {
          id: localId,
          name: values.name.trim(),
          ownerId: user.uid,
          companyId,
          parentId: values.parentId,
          isDeleted: false,
          createdAt: new Date().toISOString(),
        };
        await upsertCompanyDocInBrowserDb(companyId, "tax_groups", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "tax_groups", "create", localId, payload);
        const showSyncHint = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" && user.uid !== "local_guest_user";
        sonnerToast.success(showSyncHint ? "Saved. Will sync when online." : "Saved.", {
          id: toastId,
          description: showSyncHint
            ? `"${values.name}" was saved locally and will sync when online.`
            : `"${values.name}" was saved locally.`,
        });
        onGroupCreated(localId);
        if (saveAndNew) form.reset({ name: "", parentId: "duties_taxes" });
        return;
      }

      const nameTrimmed = values.name.trim();
      
      // Check if it's a system group name
      if (isSystemGroupName("tax", nameTrimmed)) {
        sonnerToast.error("System Group Name", { id: toastId, description: "This is a system group name. Please use another name." });
        setIsLoading(false);
        return;
      }
      
      // Recycle-bin duplicate flow: restore or create-new on user choice.
      const duplicateDecision = await resolveRecycleBinDuplicate({
        companyId,
        collectionName: "tax_groups",
        name: nameTrimmed,
        entityLabel: "Tax Group",
      });
      if (duplicateDecision.decision === "active_exists") {
        sonnerToast.error("Duplicate Group Name", { id: toastId, description: "A group with this name already exists." });
        setIsLoading(false);
        return;
      }
      if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
        sonnerToast.success("Group Restored!", {
          id: toastId,
          description: `"${nameTrimmed}" was restored from Recycle Bin.`,
        });
        onGroupCreated(duplicateDecision.restoredId);
        if (saveAndNew) {
          form.reset({ name: "", parentId: "duties_taxes" });
        }
        setIsLoading(false);
        return;
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/tax_groups`), {
        name: values.name.trim(),
        ownerId: user.uid,
        companyId: companyId,
        parentId: values.parentId,
        isDeleted: false,
        createdAt: serverTimestamp(),
      });

      sonnerToast.success("Group Created!", { id: toastId, description: `"${values.name}" has been successfully created.` });
      
      onGroupCreated(docRef.id);
      if (saveAndNew) {
        form.reset({ name: "", parentId: "duties_taxes" });
      }
    } catch (error) {
      console.error("Error creating group:", error);
      sonnerToast.error("Error Creating Group", { id: toastId, description: "Group details could not be saved. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  const { systemGroups, userGroups } = useMemo(() => {
      const dynamicSystem = groups.filter(g => (g as any).isSystemReserved);
      const system = dynamicSystem.length > 0
        ? dynamicSystem
        : (FALLBACK_TAX_SYSTEM_GROUPS as unknown as TaxGroup[]);
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
            <DialogTitle>Create a New Tax Group</DialogTitle>
            <DialogDescription>Add a new group to categorize your tax types.</DialogDescription>
          </DialogHeader>
          {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
          <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Indirect Taxes" {...field} />
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
                         {systemGroups.length > 0 && (
                            <SelectGroup>
                                <SelectLabel>System Groups</SelectLabel>
                                {systemGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                            </SelectGroup>
                         )}
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
                      onClick={(e) => handleFormSubmit(e, { saveAndNew: true })}
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

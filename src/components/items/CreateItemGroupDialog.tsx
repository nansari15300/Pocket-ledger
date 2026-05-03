
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from "@/hooks/use-mobile";
import { cnStaticMobileFullscreenDialog } from "@/lib/staticMobileFullscreenDialog";
import { firestore } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import type { ItemGroup } from "@/components/items/types";
import { isSystemParentGroup } from "@/lib/system-groups";
import { isSystemGroupName } from "@/lib/system-group-names";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import { isLocalOnlyMode } from "@/lib/localMode";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";

function createLocalEntityId(prefix: string): string {
  // Offline create ke liye local id generate karo; Firebase id dependency avoid hoti hai.
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


export function CreateItemGroupDialog({ onGroupCreated, children, isOpen, onOpenChange, groups = [] }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: ItemGroup[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useCompany();
  const isMobile = useIsMobile();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", parentId: "stock_items" },
  });

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-item-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-item-group-name', handlePrefill);
    };
  }, [form]);

  async function onSubmit(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }
    setIsLoading(true);
    try {
      const nameTrimmed = values.name.trim();
      
      // Check if it's a system group name
      if (isSystemGroupName("item", nameTrimmed)) {
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
        collectionName: "item_groups",
        name: nameTrimmed,
        entityLabel: "Item Group",
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
        if (saveAndNew) form.reset({ name: "", parentId: "stock_items" });
        else if (onOpenChange) onOpenChange(false);
        setIsLoading(false);
        return;
      }

      let createdId = "";
      if (isLocalOnlyMode()) {
        // Local-first mode: save item group in browser DB and queue backup sync.
        createdId = createLocalEntityId("item_group");
        const payload = {
          id: createdId,
          name: values.name.trim(),
          ownerId: user.uid,
          companyId,
          parentId: values.parentId,
          isDeleted: false,
          createdAt: new Date().toISOString(),
        };
        await upsertCompanyDocInBrowserDb(companyId, "item_groups", createdId, payload);
        await enqueueCompanyDocOutbox(companyId, "item_groups", "create", createdId, payload);
      } else {
        const payload = {
          name: values.name.trim(),
          ownerId: user.uid,
          companyId: companyId,
          parentId: values.parentId,
          isDeleted: false,
          createdAt: serverTimestamp(),
        };
        const collRef = collection(firestore, `companies/${companyId}/item_groups`);
        const docRef = await addDoc(collRef, payload);
        createdId = docRef.id;
      }
      toast({ title: "Group Created!", description: `"${values.name}" has been successfully created.` });
      onGroupCreated(createdId);
      if (saveAndNew) {
        form.reset({ name: "", parentId: "stock_items" });
      } else {
        if (onOpenChange) onOpenChange(false);
      }
    } catch (error) {
      console.error("Error creating group:", error);
      toast({ variant: "destructive", title: "Error Creating Group", description: "Group details could not be saved. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent className={cnStaticMobileFullscreenDialog(isMobile, "flex flex-col sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle>Create a New Item Group</DialogTitle>
            <DialogDescription>Add a new group to categorize your items.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(data => onSubmit(data, false))} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Electronics" {...field} />
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
                          {groups
                            .filter(g => isSystemParentGroup("item_groups", g.id))
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
                      disabled={isLoading}
                    >
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save & New
                    </Button>
                  </div>
                  <Button type="submit" disabled={isLoading || !companyId} className="shrink-0">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Group
                  </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
    </Dialog>
  );
}

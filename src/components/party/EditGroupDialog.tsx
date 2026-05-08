
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import type { Group } from "@/components/party/types";
import { useCompany } from "@/hooks/useCompany";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import {
  apkCloudCompanyOfflineViewOnly,
  apkEntityWriteUsesLocalSqliteMirror,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useServerDirectWrites } from "@/contexts/ServerDirectWritesContext";
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS,
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { useAuth } from "@/hooks/useAuth";
import { toast as sonnerToast } from "sonner";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});

const systemGroups = [
  { id: "sundry_debtors", name: "Sundry Debtors" },
  { id: "sundry_creditors", name: "Sundry Creditors" },
];

export function EditGroupDialog({ group, allGroups, onGroupUpdated, onGroupDeleted, children, hasAccounts }: {
  group: Group;
  allGroups: Group[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  children: React.ReactNode;
  hasAccounts?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  const { directServerWrites } = useServerDirectWrites();
  /** Server writes OFF: offline par bhi group update/delete SQLite + outbox. */
  const localSqlMirror = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company, directServerWrites]);
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline, directServerWrites]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: group.name,
      parentId: group.parentId || "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: group.name,
        parentId: group.parentId || "",
      });
    }
  }, [isOpen, group, form]);

  function onSubmit(values: z.infer<typeof formSchema>): void {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      return;
    }
    const gid = group.id;
    setIsOpen(false); // Dialog turant; `updateDoc` background — RHF submit block nahi rakhta
    void (async () => {
      setIsLoading(true);
      try {
        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "groups", gid);
          const base: Record<string, unknown> =
            (fromDb as Record<string, unknown> | null) ?? {
              id: gid,
              companyId,
              ownerId: user?.uid ?? "",
              name: group.name,
              parentId: group.parentId || "",
              isDeleted: false,
            };
          const payload: Record<string, unknown> = {
            ...base,
            id: gid,
            companyId,
            name: values.name.trim(),
            parentId: values.parentId,
          };
          await upsertCompanyDocInBrowserDb(companyId, "groups", gid, payload);
          await enqueueCompanyDocOutbox(companyId, "groups", "update", gid, payload);
          toast({ title: "Group Updated!", description: `"${values.name}" saved locally — will sync when online.` });
          onGroupUpdated();
          return;
        }

        const groupRef = doc(firestore, `companies/${companyId}/groups`, gid);
        await updateDoc(groupRef, {
          name: values.name,
          parentId: values.parentId,
        });

        toast({ title: "Group Updated!", description: `"${values.name}" has been successfully updated.` });
        onGroupUpdated();
      } catch (error) {
        console.error("Error updating group:", error);
        toast({ variant: "destructive", title: "Error Updating Group", description: "An error occurred. Please try again." });
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
    if (hasAccounts) {
      sonnerToast.error("Cannot Delete", { description: "This group has accounts and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "groups", group.id);
          const base: Record<string, unknown> =
            (fromDb as Record<string, unknown> | null) ?? {
              id: group.id,
              companyId,
              ownerId: user?.uid ?? "",
              name: group.name,
              parentId: group.parentId || "",
              isDeleted: false,
            };
          const payload: Record<string, unknown> = {
            ...base,
            id: group.id,
            companyId,
            isDeleted: true,
            deletedAt: Timestamp.now(),
            deletedBy: user?.uid || "",
          };
          await upsertCompanyDocInBrowserDb(companyId, "groups", group.id, payload);
          await enqueueCompanyDocOutbox(companyId, "groups", "update", group.id, payload);
        } else {
          await updateDoc(doc(firestore, `companies/${companyId}/groups`, group.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || "",
          });
        }
        toast({ title: "Group Moved to Recycle Bin", description: `"${group.name}" has been moved.`});
        onGroupDeleted();
        setIsOpen(false); // Only close the main dialog
    } catch (error) {
        console.error("Error deleting group: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the group.",
        });
    } finally {
        setIsLoading(false);
        setIsDeleteDialogOpen(false); // Ensure this is also closed
    }
   }
  
  const systemGroupIds = systemGroups.map((g) => g.id);
  const userDefinedGroups = allGroups.filter((g) => g.id !== group.id && !systemGroupIds.includes(g.id));
  const isSystemGroup = systemGroupIds.includes(group.id);


  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>Update the details for {group.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sundry Debtors" {...field} disabled={isSystemGroup} />
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSystemGroup}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a parent group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>System Groups</SelectLabel>
                            {systemGroups.map((sg) => (
                              <SelectItem key={sg.id} value={sg.id}>
                                {sg.name}
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
                            disabled={isLoading || isSystemGroup || hasAccounts || apkOfflineViewOnly}
                          >
                            <Trash2 className="mr-2 h-4 w-4 shrink-0" /> Delete
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!hasAccounts && apkOfflineViewOnly && (
                        <TooltipContent>
                          <p>Offline — view only.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button type="submit" disabled={isLoading || isSystemGroup || apkOfflineViewOnly} className="shrink-0">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
              This action will move the group <span className="font-semibold text-foreground">{group.name}</span> to the recycle bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS} disabled={isLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isLoading || apkOfflineViewOnly} className="bg-destructive hover:bg-destructive/90">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move to Recycle Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

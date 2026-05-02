
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { beginApkLedgerAsyncWriteShield } from "@/lib/apkLedgerRouteShield";
import { useAuth } from "@/hooks/useAuth";
import type { TaxGroup } from "./types";
import { toast as sonnerToast } from "sonner";


const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});


export function EditTaxGroupDialog({ group, allGroups, onGroupUpdated, onGroupDeleted, children, hasAccounts }: {
  group: TaxGroup;
  allGroups: TaxGroup[];
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
  const { companyId } = useCompany();

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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    beginApkLedgerAsyncWriteShield({ pinCompanyId: companyId });
    
    setIsOpen(false);
    
    const toastId = sonnerToast.loading("Updating group...");
    setIsLoading(true);

    try {
      const groupRef = doc(firestore, `companies/${companyId}/tax_groups`, group.id);
      await updateDoc(groupRef, {
        name: values.name,
        parentId: values.parentId,
      });

      sonnerToast.success("Group Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      onGroupUpdated();
    } catch (error) {
      console.error("Error updating group:", error);
      sonnerToast.error("Error Updating Group", { id: toastId, description: "An error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasAccounts) {
      sonnerToast.error("Cannot Delete", { description: "This group has tax ledgers and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsDeleteDialogOpen(false);
    setIsOpen(false);
    
    const toastId = sonnerToast.loading("Moving group to bin...");
    setIsLoading(true);

    try {
        await updateDoc(doc(firestore, `companies/${companyId}/tax_groups`, group.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || "",
        });
        sonnerToast.success("Group Moved to Recycle Bin", { id: toastId, description: `"${group.name}" has been moved.`});
        onGroupDeleted();
    } catch (error) {
        console.error("Error deleting group: ", error);
        sonnerToast.error("Delete Failed", { id: toastId, description: "An error occurred while deleting the group."});
    } finally {
        setIsLoading(false);
    }
  }
  
  const systemGroups = useMemo(() => allGroups.filter(g => (g as any).isSystemReserved && g.id !== group.id), [allGroups, group.id]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Tax Group</DialogTitle>
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
              <DialogFooter className="mt-4 justify-between">
                 <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={isLoading || hasAccounts}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                              This action will move the group <span className="font-semibold text-foreground">{group.name}</span> to the recycle bin.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} disabled={isLoading} className="bg-destructive hover:bg-destructive/90">
                              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Move to Recycle Bin
                          </AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

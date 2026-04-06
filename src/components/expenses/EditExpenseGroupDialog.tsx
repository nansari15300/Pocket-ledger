
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import type { ExpenseGroup } from "./types";
import { toast as sonnerToast } from "sonner";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});


export function EditExpenseGroupDialog({ group, allGroups, onGroupUpdated, onGroupDeleted, children, hasAccounts }: {
  group: ExpenseGroup;
  allGroups: ExpenseGroup[];
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
  // Use the latest group snapshot by id so parent selection doesn't reopen with stale value.
  const liveGroup = useMemo(
    () => allGroups.find((g) => g.id === group.id) || group,
    [allGroups, group]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // Initialize with live group values to avoid parent mismatch after save.
      name: liveGroup.name,
      parentId: liveGroup.parentId || "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        // Reset with latest fetched values each time dialog opens.
        name: liveGroup.name,
        parentId: liveGroup.parentId || "",
      });
    }
  }, [isOpen, liveGroup, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      const groupRef = doc(firestore, `companies/${companyId}/expense_groups`, group.id);
      await updateDoc(groupRef, {
        name: values.name,
        parentId: values.parentId,
      });

      toast({ title: "Group Updated!", description: `"${values.name}" has been successfully updated.` });
      onGroupUpdated();
      setIsOpen(false);
    } catch (error) {
      console.error("Error updating group:", error);
      toast({ variant: "destructive", title: "Error Updating Group", description: "An error occurred. Please try again." });
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
      sonnerToast.error("Cannot Delete", { description: "This group has accounts and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/expense_groups`, group.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || "",
        });
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
  
  // Parent: only Income & Expenses (main P&L categories)
  const parentOptions = [
    { id: "income", name: "Income" },
    { id: "expenses", name: "Expenses" },
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Income / Expense Group</DialogTitle>
            <DialogDescription>Update the details for {liveGroup.name}.</DialogDescription>
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
                      <Input placeholder="e.g., Office Expenses" {...field} />
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
                         {parentOptions.map((p) => (
                           <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                         ))}
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

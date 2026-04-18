
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExpenseGroup } from "./types";
import { isSystemGroupName } from "@/lib/system-group-names";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});


export function CreateExpenseGroupDialog({ onGroupCreated, children, isOpen, onOpenChange, groups = [] }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: ExpenseGroup[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useCompany();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      parentId: "expenses",
    },
  });

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-expense-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-expense-group-name', handlePrefill);
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
      if (isSystemGroupName("expense", nameTrimmed)) {
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
        collectionName: "expense_groups",
        name: nameTrimmed,
        entityLabel: "Expense Group",
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
        if (saveAndNew) form.reset({ name: "", parentId: "expenses" });
        else if (onOpenChange) onOpenChange(false);
        setIsLoading(false);
        return;
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/expense_groups`), {
        name: values.name.trim(),
        ownerId: user.uid,
        companyId: companyId,
        parentId: values.parentId,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Group Created!", description: `"${values.name}" has been successfully created.` });
      
      onGroupCreated(docRef.id);
      if (saveAndNew) {
        form.reset({ name: "", parentId: "expenses" });
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

  // Parent: only Income & Expenses (main P&L categories)
  const parentOptions = [
    { id: "income", name: "Income" },
    { id: "expenses", name: "Expenses" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogPortal>
        <DialogOverlay />
        <DialogContent 
          className="sm:max-w-md z-[60]"
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a New Expense Group</DialogTitle>
            <DialogDescription>Add a new group to categorize your expense accounts.</DialogDescription>
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
               <DialogFooter className="mt-4">
                  <DialogClose asChild>
                      <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button type="button" variant="outline" onClick={form.handleSubmit(data => onSubmit(data, true))} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                  <Button type="submit" disabled={isLoading || !companyId}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Group
                  </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
        </DialogPortal>
    </Dialog>
  );
}

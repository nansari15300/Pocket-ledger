
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
import { firestore } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import type { Group } from "@/components/party/types";
import { isSystemGroupName } from "@/lib/system-group-names";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});

const systemGroups = [
    { id: "sundry_debtors", name: "Sundry Debtors" },
    { id: "sundry_creditors", name: "Sundry Creditors" },
];


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
  const { companyId } = useCompany();

  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;

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
    setIsLoading(true);
    try {
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
      
      const nameLower = nameTrimmed.toLowerCase();
      const isDuplicate = groups.some(
        (g) => !g.isDeleted && (g.name?.trim().toLowerCase() ?? "") === nameLower
      );
      if (isDuplicate) {
        toast({
          variant: "destructive",
          title: "Duplicate Group Name",
          description: "A group with this name already exists. Please choose a different name.",
        });
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
        if (parentOnOpenChange) parentOnOpenChange(false);
      }
    } catch (error: any) {
      console.error("Error creating group:", error);
      const isNetworkError =
        error?.code === "unavailable" ||
        error?.message?.includes("network") ||
        error?.message?.includes("offline") ||
        (typeof navigator !== "undefined" && !navigator.onLine);
      toast({
        variant: isNetworkError ? "default" : "destructive",
        title: isNetworkError ? "Saved locally" : "Error Creating Group",
        description: isNetworkError
          ? "Group will sync when you're back online."
          : "Group details could not be saved. Please try again.",
      });
      if (isNetworkError) {
        onGroupCreated("");
        if (!saveAndNew && parentOnOpenChange) parentOnOpenChange(false);
        form.reset({ name: "", parentId: form.getValues("parentId") || "sundry_debtors" });
      }
    } finally {
      setIsLoading(false);
    }
  }
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md p-4">
        <DialogHeader>
          <DialogTitle>Create a New Group</DialogTitle>
          <DialogDescription>Add a new group to categorize your parties.</DialogDescription>
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
             <DialogFooter className="pt-4">
                <DialogClose asChild>
                    <Button type="button" variant="ghost" className="h-9 text-sm px-4 rounded-md">Cancel</Button>
                </DialogClose>
                <Button type="button" variant="outline" onClick={form.handleSubmit(data => onSubmit(data, true))} disabled={isLoading} className="h-9 text-sm px-4 rounded-md">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                </Button>
                <Button type="submit" disabled={isLoading || !companyId} className="h-9 text-sm px-4 rounded-md">
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

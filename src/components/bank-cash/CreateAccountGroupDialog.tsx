
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import type { AccountGroup } from "@/components/bank-cash/types";
import { isSystemGroupName } from "@/lib/system-group-names";

const formSchema = z.object({
  name: z
    .string()
    .min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});

export function CreateAccountGroupDialog({
  onGroupCreated,
  children,
  isOpen,
  onOpenChange,
  groups = [],
}: {
  onGroupCreated: (groupId: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  groups: AccountGroup[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useCompany();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      parentId: "",
    },
  });

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-account-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-account-group-name', handlePrefill);
    };
  }, [form]);

  async function onSubmit(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in and have a company selected." });
      return;
    }
    setIsLoading(true);

    try {
      const nameTrimmed = values.name.trim();
      
      // Check if it's a system group name
      if (isSystemGroupName("account", nameTrimmed)) {
        toast({
          variant: "destructive",
          title: "System Group Name",
          description: "This is a system group name. Please use another name.",
        });
        setIsLoading(false);
        return;
      }
      
      // Check for duplicate group name
      const q = query(
        collection(firestore, `companies/${companyId}/account_groups`),
        where("name", "==", nameTrimmed)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        toast({
          variant: "destructive",
          title: "Duplicate Group Name",
          description: "A group with this name already exists. Please choose a different name.",
        });
        setIsLoading(false);
        return;
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/account_groups`), {
        name: values.name.trim(),
        ownerId: user.uid,
        companyId: companyId,
        parentId: values.parentId,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });

      toast({
        title: "Group Created!",
        description: `"${values.name}" has been successfully created.`,
      });
      onGroupCreated(docRef.id);
      
      if (saveAndNew) {
        form.reset({ name: "", parentId: "" });
      } else {
        if (onOpenChange) onOpenChange(false);
      }
    } catch (error) {
      console.error("Error creating group:", error);
      toast({
        variant: "destructive",
        title: "Error Creating Group",
        description: "Group details could not be saved. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const systemGroups = useMemo(() => groups.filter(g => (g as any).isSystemReserved), [groups]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Create a New Account Group</DialogTitle>
            <DialogDescription>
              Add a new group to categorize your bank or cash accounts.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(data => onSubmit(data, false))}
              className="space-y-4 py-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Cash in Hand" {...field} />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a parent group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                            <SelectLabel>System Groups</SelectLabel>
                            {systemGroups
                              .map((group) => (
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
              <DialogFooter className="mt-4">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                 <Button type="button" variant="outline" onClick={form.handleSubmit(data => onSubmit(data, true))} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & New
                </Button>
                <Button type="submit" disabled={isLoading || !companyId}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Group
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
    </Dialog>
  );
}

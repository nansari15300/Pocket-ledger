
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import type { StaffGroup } from "@/components/staff/types";
import { isSystemParentGroup } from "@/lib/system-groups";
import { isSystemGroupName } from "@/lib/system-group-names";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});


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
  const { companyId } = useCompany();

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
    setIsLoading(true);
    
    try {
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
      
      // Check for duplicate group name
      const q = query(
        collection(firestore, `companies/${companyId}/staff_groups`),
        where("name", "==", nameTrimmed)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        toast({
          variant: "destructive",
          title: "Duplicate Group Name",
          description: "A group with this name already exists.",
        });
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
      const system = groups.filter(g => (g as any).isSystemReserved);
      const userDefined = groups.filter(g => !(g as any).isSystemReserved);
      return { systemGroups: system, userGroups: userDefined };
  }, [groups]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogPortal>
        <DialogOverlay />
<<<<<<< HEAD
        <DialogContent 
          className="sm:max-w-md z-[60]"
=======
        {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
        <DialogContent 
          className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 z-[60] sm:max-h-none sm:w-full sm:max-w-md sm:grid sm:flex-none sm:px-6"
>>>>>>> 6a1ec26 (Animation Fixed)
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
<<<<<<< HEAD
=======
          {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
          <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
>>>>>>> 6a1ec26 (Animation Fixed)
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
<<<<<<< HEAD
=======
          </div>
>>>>>>> 6a1ec26 (Animation Fixed)
        </DialogContent>
        </DialogPortal>
    </Dialog>
  );
}


"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, where, getDocs, onSnapshot } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import type { ExpenseGroup } from "./types";
import { CreateExpenseGroupDialog } from "./CreateExpenseGroupDialog";
import { Combobox } from "../ui/combobox";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { toast as sonnerToast } from "sonner";


const formSchema = z.object({
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  groupId: z.string().min(1, "A group is required."),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
});

export function CreateExpenseAccountDialog({
  onExpenseAccountCreated,
  children,
  isOpen,
  onOpenChange,
}: {
  onExpenseAccountCreated: (id: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, triggerSync } = useCompany();
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { dateSystem } = useDate();


  const open = isOpen !== undefined ? isOpen : internalIsOpen;
  const setOpen = onOpenChange !== undefined ? onOpenChange : setInternalIsOpen;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: { name: "", openingBalance: 0, groupId: "direct_expense" },
  });
  
  useEffect(() => {
    if (!companyId || !open) return;
    const q = query(collection(firestore, `companies/${companyId}/expense_groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseGroup)));
    });
    return () => unsubscribe();
  }, [companyId, open]);

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-expense-account-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-expense-account-name', handlePrefill);
    };
  }, [form]);

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue("groupId", newGroupId);
    setIsCreateGroupOpen(false);
  };


  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    if (!options.saveAndNew) {
        setOpen(false);
    }
    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in and have a company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Creating expense account...");
    setIsLoading(true);
    try {
       const q = query(
        collection(firestore, `companies/${companyId}/expense_accounts`),
        where("name", "==", values.name.trim())
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        sonnerToast.error("Duplicate Account Name", {
          id: toastId,
          description: "An account with this name already exists.",
        });
        setIsLoading(false);
        return;
      }
      
      const selectedGroup = groups.find(g => g.id === values.groupId);
      const accountType = (selectedGroup as any)?.type || 'Expense'; // Default to Expense if not found

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/expense_accounts`), {
        name: values.name.trim(),
        groupId: values.groupId || null,
        openingBalance: values.openingBalance || 0,
        openingBalanceDate: values.openingBalanceDate || null,
        type: accountType,
        companyId,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });

      // Automatically balance opening balance with Capital Account
      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, 'expense_accounts', docRef.id, 0, values.openingBalance);
      }

      sonnerToast.success("Expense Account Created!", {
        id: toastId,
        description: `"${values.name}" has been added.`,
      });
      onExpenseAccountCreated(docRef.id);
      triggerSync();

      if (saveAndNew) {
        form.reset();
      } else {
        setOpen(false);
      }
    } catch (error) {
      console.error("Error creating expense account:", error);
      sonnerToast.error("Error", {
        id: toastId,
        description: "Failed to create expense account.",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  // Show all groups (including 4 default: Direct/Indirect Income/Expenses) - only exclude report-only parents
  const allGroupOptions = useMemo(() => {
    return groups
      .filter((g) => (g as any).isReportOnly !== true)
      .map(g => ({ value: g.id, label: g.name }));
  }, [groups]);

  useEffect(() => {
    if (allGroupOptions.length === 0) return;
    const current = form.getValues("groupId");
    const isValid = allGroupOptions.some(o => o.value === current);
    if (!current || !isValid) {
      form.setValue("groupId", allGroupOptions[0].value);
    }
  }, [allGroupOptions, form]);

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen} modal={true}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
<<<<<<< HEAD
      <DialogContent 
        className="sm:max-w-lg"
=======
      {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
      <DialogContent 
        className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 sm:max-h-none sm:w-full sm:max-w-lg sm:grid sm:flex-none sm:px-6"
>>>>>>> 6a1ec26 (Animation Fixed)
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          if (isCreateGroupOpen) { e.preventDefault(); return; }
          const target = e.target as HTMLElement;
          if (
            target.closest('[data-radix-popper-content-wrapper]') ||
            target.closest('[cmdk-root]')
          ) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
           if (isCreateGroupOpen) { e.preventDefault(); return; }
           const target = e.target as HTMLElement;
           if (target.closest('[data-radix-dialog-content]')) {
              e.preventDefault();
           }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create Expense Account</DialogTitle>
          <DialogDescription>
            Add a new category for your expenses, like "Office Rent" or "Utilities".
          </DialogDescription>
        </DialogHeader>
<<<<<<< HEAD
=======
        {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
        <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
>>>>>>> 6a1ec26 (Animation Fixed)
        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Salary Expense" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="groupId"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Group</FormLabel>
                  <Combobox
                    options={allGroupOptions}
                    value={field.value}
                    onChange={(value, newName) => {
                      if (value === "add-new") {
                        setIsCreateGroupOpen(true);
                         setTimeout(() => {
                          document.dispatchEvent(new CustomEvent('prefill-create-expense-group-name', { detail: newName }));
                        }, 100);
                      } else {
                        field.onChange(value === "none" ? "" : value);
                      }
                    }}
                    placeholder="Select a group"
                    addNewLabel="+ Add New Group"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="openingBalance"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Opening Balance</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="openingBalanceDate"
                  render={({ field }: any) => (
                    <FormItem>
                    <FormLabel>As on Date</FormLabel>
                      <div className={cn("grid", dateSystem === 'Both' && "grid-cols-2 gap-2")}>
                          {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} />
                          )}
                          {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <Popover modal={true} open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                      {field.value ? format(field.value, "MMM-dd-yyyy") : <span>Pick a date</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                  <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setIsCalendarOpen(false); }} initialFocus />
                                </PopoverContent>
                              </Popover>
                          )}
                      </div>
                    <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
               <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & New
                </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </Form>
<<<<<<< HEAD
=======
        </div>
>>>>>>> 6a1ec26 (Animation Fixed)
      </DialogContent>
    </Dialog>
    <CreateExpenseGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups}/>
    </>
  );
}

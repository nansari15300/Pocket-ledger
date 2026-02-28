
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { CreateExpenseGroupDialog } from "./CreateExpenseGroupDialog";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { toast as sonnerToast } from "sonner";

const formSchema = z.object({
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  groupId: z.string().optional(),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
});

export function EditExpenseAccountDialog({ account, onAccountUpdated, onAccountDeleted, children, hasTransactions }: {
  account: ExpenseAccount;
  onAccountUpdated: () => void;
  onAccountDeleted: (id: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { companyId, triggerSync } = useCompany();
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { dateSystem } = useDate();


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: account.name,
      groupId: account.groupId || "",
      openingBalance: account.openingBalance || 0,
      openingBalanceDate: (account as any).openingBalanceDate?.toDate ? (account as any).openingBalanceDate.toDate() : undefined,
    },
  });

  useEffect(() => {
    if (isOpen) {
      const dateValue = (account as any).openingBalanceDate;
      let finalDate;
      if (dateValue?.toDate) {
          finalDate = dateValue.toDate();
      } else if (dateValue instanceof Date) {
          finalDate = dateValue;
      } else if (dateValue) {
          finalDate = new Date(dateValue);
      } else {
          finalDate = undefined;
      }
      form.reset({
        name: account.name,
        groupId: account.groupId || "",
        openingBalance: account.openingBalance || 0,
        openingBalanceDate: finalDate,
      });
    }
  }, [isOpen, account, form]);
  
  useEffect(() => {
    if (!companyId || !isOpen) return;
    const q = query(collection(firestore, `companies/${companyId}/expense_groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseGroup)));
    });
    return () => unsubscribe();
  }, [companyId, isOpen]);

  async function onSubmit(values: z.infer<typeof formSchema>): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    
    setIsOpen(false);
    
    const toastId = sonnerToast.loading("Updating expense account...");
    try {
      const oldOpeningBalance = account.openingBalance || 0;
      const newOpeningBalance = values.openingBalance || 0;
      
      const accountRef = doc(firestore, `companies/${companyId}/expense_accounts`, account.id);
      await updateDoc(accountRef, { 
        name: values.name, 
        groupId: values.groupId || null,
        openingBalance: newOpeningBalance,
        openingBalanceDate: values.openingBalanceDate || null,
      });

      // Automatically balance opening balance change with Capital Account
      if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, 'expense_accounts', account.id, oldOpeningBalance, newOpeningBalance);
      }

      sonnerToast.success("Account Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      onAccountUpdated();

    } catch (error) {
      console.error("Error updating account:", error);
      sonnerToast.error("Error Updating Account", { id: toastId, description: "An error occurred. Please try again." });
    }
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasTransactions) {
      sonnerToast.error("Cannot Delete", { description: "This account has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/expense_accounts`, account.id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
        });
        toast({ title: "Account Moved to Bin", description: `"${account.name}" has been moved to the recycle bin.`});
        onAccountDeleted(account.id);
        setIsOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting account: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the account.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue("groupId", newGroupId);
    setIsCreateGroupOpen(false);
  };

  // Show all groups including 4 default (Direct/Indirect Income/Expenses) - only exclude report-only parents
  const allGroupOptions = useMemo(() => {
    return groups
      .filter((g) => (g as any).isReportOnly !== true)
      .map((g) => ({ value: g.id, label: g.name }));
  }, [groups]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {isOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />}
        <DialogContent 
            className="sm:max-w-lg z-50"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Expense Account</DialogTitle>
            <DialogDescription>Update the details for {account.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Office Rent" {...field} />
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
                    <FormLabel>Group (Optional)</FormLabel>
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
                              <BsDatePicker isRange={false} valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} />
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

              <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                          disabled={hasTransactions}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Move to Bin
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {hasTransactions && (
                      <TooltipContent>
                        <p>Cannot delete an account with existing transactions.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <Button type="submit" disabled={isLoading} className="col-span-2 sm:col-span-1">
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
                    This action will move the account <span className="font-semibold text-foreground">{account.name}</span> to the recycle bin.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    Move to Bin
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreateExpenseGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups}/>
    </>
  );
}

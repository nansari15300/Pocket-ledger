
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, onSnapshot, query } from "firebase/firestore";

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
import { ensureUngroupedGroup, getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";


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
  defaultGroupType,
}: {
  onExpenseAccountCreated: (id: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When "income", default to first Income group (for Sale form Sales Account). */
  defaultGroupType?: "income" | "expense";
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
    defaultValues: { name: "", openingBalance: 0, groupId: "" },
  });
  
  useEffect(() => {
    if (!companyId || !open) return;
    const q = query(collection(firestore, `companies/${companyId}/expense_groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseGroup)));
    });
    return () => unsubscribe();
  }, [companyId, open]);

  // Default group: when defaultGroupType=income (Sale form), use first Income group; else Ungrouped
  const incomeGroupIds = useMemo(() => {
    const isIncome = (g: any) => {
      const id = String(g?.id || "").toLowerCase();
      const parentId = String(g?.parentId || "").toLowerCase();
      const type = String(g?.type || "").toLowerCase();
      return parentId === "income" || type === "income" || id === "income" || id === "direct_income" || id === "indirect_income";
    };
    const groupMap = new Map(groups.map((g: any) => [g.id, g]));
    const hasIncomeAncestor = (g: any, visited = new Set<string>()): boolean => {
      if (!g || visited.has(g.id)) return false;
      visited.add(g.id);
      if (isIncome(g)) return true;
      if (g.parentId && groupMap.has(g.parentId)) return hasIncomeAncestor(groupMap.get(g.parentId), visited);
      return false;
    };
    return new Set(groups.filter((g: any) => hasIncomeAncestor(g)).map((g: any) => g.id));
  }, [groups]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!companyId || !user?.uid || !open) return;
      const current = form.getValues("groupId");
      if (current) return;
      if (defaultGroupType === "income" && incomeGroupIds.size > 0) {
        const firstIncomeId = Array.from(incomeGroupIds)[0];
        if (alive && firstIncomeId) form.setValue("groupId", firstIncomeId, { shouldDirty: false });
        return;
      }
      const ungroupedId = await ensureUngroupedGroup(companyId, user.uid, "expense");
      if (!alive) return;
      form.setValue("groupId", ungroupedId, { shouldDirty: false });
    })();
    return () => {
      alive = false;
    };
  }, [companyId, user?.uid, open, form, defaultGroupType, incomeGroupIds]);

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
      // Recycle-bin duplicate flow: allow restore or explicit create-new.
      const duplicateDecision = await resolveRecycleBinDuplicate({
        companyId,
        collectionName: "expense_accounts",
        name: values.name.trim(),
        entityLabel: "Expense Account",
      });
      if (duplicateDecision.decision === "active_exists") {
        sonnerToast.error("Duplicate Account Name", {
          id: toastId,
          description: "An account with this name already exists.",
        });
        setIsLoading(false);
        return;
      }
      if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
        sonnerToast.success("Expense Account Restored!", {
          id: toastId,
          description: `"${values.name.trim()}" was restored from Recycle Bin.`,
        });
        onExpenseAccountCreated(duplicateDecision.restoredId);
        triggerSync();
        setOpen(false);
        setIsLoading(false);
        return;
      }
      
      // If user leaves group unchanged, auto-assign/create Ungrouped before save.
      const resolvedGroupId =
        values.groupId?.trim() || (await ensureUngroupedGroup(companyId!, user.uid, "expense"));
      const selectedGroup = groups.find(g => g.id === resolvedGroupId);
      // Income group → type Income (for Sale form); else Expense
      const accountType = (selectedGroup as any)?.type || (incomeGroupIds.has(resolvedGroupId) ? 'Income' : 'Expense');

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/expense_accounts`), {
        name: values.name.trim(),
        groupId: resolvedGroupId || getUngroupedGroupId("expense"),
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
        // Keep default selection on Ungrouped for next quick entry.
        form.reset({ name: "", openingBalance: 0, groupId: getUngroupedGroupId("expense"), openingBalanceDate: undefined });
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
    const getParentLabel = (parentId?: string) => {
      // Show two logical parent buckets in picker labels so users can classify account clearly.
      if (parentId === "income" || parentId === "direct_income" || parentId === "indirect_income") return "Income";
      if (parentId === "expenses" || parentId === "direct_expense" || parentId === "indirect_expense") return "Expenses";
      return "";
    };
    return [
      { value: getUngroupedGroupId("expense"), label: "Ungrouped" },
      ...groups
        .filter((g) => (g as any).isReportOnly !== true)
        .filter((g) => (g as any).isAutoUngrouped !== true)
        .map((g: any) => {
          const parent = getParentLabel(g.parentId);
          return { value: g.id, label: parent ? `${parent} / ${g.name}` : g.name };
        }),
    ];
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
      {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
      <DialogContent 
        className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 sm:max-h-none sm:w-full sm:max-w-lg sm:grid sm:flex-none sm:px-6"
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
          <DialogTitle>{defaultGroupType === "income" ? "Create Income Account" : "Create Expense Account"}</DialogTitle>
          <DialogDescription>
            {defaultGroupType === "income"
              ? "Add a new income/sales account, like \"Sales\" or \"Service Income\"."
              : "Add a new category for your expenses, like \"Office Rent\" or \"Utilities\"."}
          </DialogDescription>
        </DialogHeader>
        {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
        <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
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
        </div>
      </DialogContent>
    </Dialog>
    <CreateExpenseGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups}/>
    </>
  );
}

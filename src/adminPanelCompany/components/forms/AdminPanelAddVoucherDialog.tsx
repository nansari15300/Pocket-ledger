"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  cnMasterEntityDialogContent,
  masterEntityDialogFormWrapperClassName,
  masterEntityDialogHeaderClassName,
} from "@/lib/masterEntityDialogClasses";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import {
  BTN_SAVE_CLASS,
  BTN_SAVE_NEW_CLASS,
  VOUCHER_NARRATION_TEXTAREA_CLASS,
} from "@/components/vouchers/voucherButtonStyles";
import { MasterFormTwoColGrid } from "@/components/inter-company/MasterFormLayout";
import {
  createAdminPanelEntity,
  listAdminPanelEntities,
  type AdminPanelEntityRow,
} from "@/lib/adminPanelCompany/entityClient";
import { ScrollArea } from "@/components/ui/scroll-area";

export type AdminPanelVoucherTab =
  | "sale"
  | "purchase"
  | "payment_in"
  | "payment_out"
  | "journal"
  | "add_salary";

const TAB_LABELS: Record<AdminPanelVoucherTab, string> = {
  sale: "Sale",
  purchase: "Purchase",
  payment_in: "Payment In",
  payment_out: "Payment Out",
  journal: "Journal",
  add_salary: "Salary",
};

const formSchema = z.object({
  partyId: z.string().optional(),
  staffId: z.string().optional(),
  bankAccountId: z.string().optional(),
  debitAccount: z.string().optional(),
  creditAccount: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  narration: z.string().min(1, "Narration is required"),
});

type FormValues = z.infer<typeof formSchema>;

function rowName(row: AdminPanelEntityRow) {
  return String(row.name ?? "").trim() || row.id;
}

/**
 * Isolated Add Voucher dialog — same tab idea as normal AddVoucherDialog
 * (Sale / Purchase / Payment / Journal / Salary), admin API save only.
 */
export function AdminPanelAddVoucherDialog({
  open,
  onOpenChange,
  defaultTab = "sale",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: AdminPanelVoucherTab;
  onCreated?: (id: string) => void;
}) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<AdminPanelVoucherTab>(defaultTab);
  const [saving, setSaving] = useState(false);
  const [parties, setParties] = useState<AdminPanelEntityRow[]>([]);
  const [banks, setBanks] = useState<AdminPanelEntityRow[]>([]);
  const [staff, setStaff] = useState<AdminPanelEntityRow[]>([]);
  const [mastersLoading, setMastersLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      partyId: "",
      staffId: "",
      bankAccountId: "",
      debitAccount: "gateway-clearing",
      creditAccount: "subscription-sales",
      amount: 0,
      narration: "",
    },
  });

  const loadMasters = useCallback(async () => {
    setMastersLoading(true);
    try {
      const [partyRows, bankRows, staffRows] = await Promise.all([
        listAdminPanelEntities("parties"),
        listAdminPanelEntities("bank_accounts"),
        listAdminPanelEntities("staff"),
      ]);
      setParties(partyRows);
      setBanks(bankRows);
      setStaff(staffRows);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load masters");
    } finally {
      setMastersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    form.reset({
      partyId: "",
      staffId: "",
      bankAccountId: "",
      debitAccount: "gateway-clearing",
      creditAccount: "subscription-sales",
      amount: 0,
      narration: "",
    });
    void loadMasters();
  }, [defaultTab, form, loadMasters, open]);

  const partyRequired = tab === "sale" || tab === "purchase" || tab === "payment_in" || tab === "payment_out";
  const staffRequired = tab === "add_salary";
  const bankHelpful = tab === "payment_in" || tab === "payment_out" || tab === "add_salary";

  const title = useMemo(() => `Add ${TAB_LABELS[tab]}`, [tab]);

  const submit = async (values: FormValues, saveAndNew: boolean) => {
    if (partyRequired && !values.partyId) {
      toast.error("Please select a party");
      return;
    }
    if (staffRequired && !values.staffId) {
      toast.error("Please select staff");
      return;
    }
    setSaving(true);
    try {
      const partyName = parties.find((row) => row.id === values.partyId);
      const staffName = staff.find((row) => row.id === values.staffId);
      const bankName = banks.find((row) => row.id === values.bankAccountId);
      const { id } = await createAdminPanelEntity("vouchers", {
        voucherType: tab,
        narration: values.narration,
        amount: values.amount,
        partyId: values.partyId || "",
        partyName: partyName ? rowName(partyName) : "",
        staffId: values.staffId || "",
        staffName: staffName ? rowName(staffName) : "",
        bankAccountId: values.bankAccountId || "",
        bankAccountName: bankName ? rowName(bankName) : "",
        debitAccount: values.debitAccount || "gateway-clearing",
        creditAccount: values.creditAccount || "subscription-sales",
        systemGenerated: false,
        locked: false,
      });
      toast.success(`${TAB_LABELS[tab]} voucher saved`);
      onCreated?.(id);
      form.reset({
        partyId: "",
        staffId: "",
        bankAccountId: "",
        debitAccount: "gateway-clearing",
        creditAccount: "subscription-sales",
        amount: 0,
        narration: "",
      });
      if (!saveAndNew) onOpenChange(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save voucher");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cnMasterEntityDialogContent(isMobile, "sm:max-w-3xl")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className={masterEntityDialogHeaderClassName}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Admin Panel Company voucher — saved under admin_panel_companies (not normal companies).
          </DialogDescription>
        </DialogHeader>
        <div className={masterEntityDialogFormWrapperClassName}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as AdminPanelVoucherTab)} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mb-2 flex h-auto w-full flex-wrap justify-start gap-1">
              {(Object.keys(TAB_LABELS) as AdminPanelVoucherTab[]).map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
                  {TAB_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
            <Form {...form}>
              <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={form.handleSubmit((values) => void submit(values, false))}
              >
                <ScrollArea className="min-h-0 flex-1 px-1">
                  <TabsContent value={tab} forceMount className="mt-0 space-y-4 p-1 pb-4 data-[state=inactive]:hidden">
                    {mastersLoading ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading parties / bank / staff…
                      </p>
                    ) : null}
                    <MasterFormTwoColGrid>
                      {partyRequired ? (
                        <FormField
                          control={form.control}
                          name="partyId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{tab === "purchase" || tab === "payment_out" ? "Supplier / party" : "Customer / party"}</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select party" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {parties.map((row) => (
                                    <SelectItem key={row.id} value={row.id}>
                                      {rowName(row)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : null}
                      {staffRequired ? (
                        <FormField
                          control={form.control}
                          name="staffId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Staff</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select staff" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {staff.map((row) => (
                                    <SelectItem key={row.id} value={row.id}>
                                      {rowName(row)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : null}
                      {bankHelpful ? (
                        <FormField
                          control={form.control}
                          name="bankAccountId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bank / Cash</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {banks.map((row) => (
                                    <SelectItem key={row.id} value={row.id}>
                                      {rowName(row)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : null}
                      {tab === "journal" ? (
                        <>
                          <FormField
                            control={form.control}
                            name="debitAccount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Debit account</FormLabel>
                                <FormControl>
                                  <Input placeholder="Debit ledger id" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="creditAccount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Credit account</FormLabel>
                                <FormControl>
                                  <Input placeholder="Credit ledger id" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      ) : null}
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input type="number" min={0} step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </MasterFormTwoColGrid>
                    <FormField
                      control={form.control}
                      name="narration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Narration</FormLabel>
                          <FormControl>
                            <Textarea className={cn(VOUCHER_NARRATION_TEXTAREA_CLASS)} placeholder="Narration" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                </ScrollArea>
                <div className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}
                    onClick={() => onOpenChange(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      className={BTN_SAVE_NEW_CLASS}
                      disabled={saving}
                      onClick={() => void form.handleSubmit((values) => submit(values, true))()}
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save & New
                    </Button>
                    <Button type="submit" className={BTN_SAVE_CLASS} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

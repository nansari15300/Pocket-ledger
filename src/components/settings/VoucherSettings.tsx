
"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, RefreshCw, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { getPlanVoucherHistoryLimit, normalizeVoucherHistoryFullBehavior } from "@/lib/voucherHistoryUtils";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";

const voucherPrefixSchema = z.object({
  sale: z.array(z.string()),
  sale_service: z.array(z.string()),
  purchase: z.array(z.string()),
  purchase_service: z.array(z.string()),
  payment_in: z.array(z.string()),
  payment_out: z.array(z.string()),
  contra: z.array(z.string()),
  direct_income: z.array(z.string()),
  direct_expense: z.array(z.string()),
  journal: z.array(z.string()),
  note: z.array(z.string()),
  add_salary: z.array(z.string()),
  pay_salary: z.array(z.string()),
});

type VoucherPrefixValues = z.infer<typeof voucherPrefixSchema>;

const defaultPrefixes: VoucherPrefixValues = {
  sale: ["Sale Inv"],
  sale_service: ["SS-"],
  purchase: ["PUR-"],
  purchase_service: ["PS-"],
  payment_in: ["RCPT-"],
  payment_out: ["PYMT-"],
  contra: ["CNTR-"],
  direct_income: ["DINC-"],
  direct_expense: ["DEXP-"],
  journal: ["JRNL-"],
  note: ["NOTE-"],
  add_salary: ["ADD-SAL-"],
  pay_salary: ["PAY-SAL-"],
};

const prefixLabels: Record<keyof VoucherPrefixValues, string> = {
    sale: "Sale Invoice (Items)",
    sale_service: "Sale Invoice (Services)",
    purchase: "Purchase Bill (Items)",
    purchase_service: "Purchase Bill (Services)",
    payment_in: "Payment In (Receipt)",
    payment_out: "Payment Out",
    contra: "Contra Entry",
    direct_income: "Direct Income",
    direct_expense: "Direct Expense",
    journal: "Journal Voucher",
    note: "Note",
    add_salary: "Add Salary (Journal)",
    pay_salary: "Pay Salary (Payment)",
}

const voucherNumberingSettingsSchema = z.object({
  sale: z.boolean(),
  sale_service: z.boolean(),
  purchase: z.boolean(),
  purchase_service: z.boolean(),
  payment_in: z.boolean(),
  payment_out: z.boolean(),
  contra: z.boolean(),
  direct_income: z.boolean(),
  direct_expense: z.boolean(),
  journal: z.boolean(),
  note: z.boolean(),
  add_salary: z.boolean(),
  pay_salary: z.boolean(),
});

const voucherEditableSettingsSchema = z.object({
  sale: z.boolean(),
  sale_service: z.boolean(),
  purchase: z.boolean(),
  purchase_service: z.boolean(),
  payment_in: z.boolean(),
  payment_out: z.boolean(),
  contra: z.boolean(),
  direct_income: z.boolean(),
  direct_expense: z.boolean(),
  journal: z.boolean(),
  note: z.boolean(),
  add_salary: z.boolean(),
  pay_salary: z.boolean(),
});

const rateEditableSettingsSchema = z.object({
  sale: z.boolean(),
  purchase: z.boolean(),
});

const voucherPrefixSelectionSchema = voucherEditableSettingsSchema.partial();

const ROLES_WITH_VOUCHER_CREATE = ["data-entry", "accountant", "editor", "manager", "owner"] as const;
const ROLE_LABELS: Record<string, string> = {
  "data-entry": "Data Entry",
  accountant: "Accountant",
  editor: "Editor",
  manager: "Manager",
  owner: "Owner",
};

export const REQUIRE_LINK_VOUCHER_KEYS = ["payment_out", "contra", "direct_expense"] as const;
export const REQUIRE_LINK_VOUCHER_LABELS: Record<(typeof REQUIRE_LINK_VOUCHER_KEYS)[number], string> = {
  payment_out: "Payment Out",
  contra: "Contra",
  direct_expense: "Direct Expense",
};

const requireLinkByRoleSchema = z.record(
  z.string(),
  z.union([
    z.boolean(),
    z.object({
      payment_out: z.boolean(),
      contra: z.boolean(),
      direct_expense: z.boolean(),
    }),
  ])
);

const voucherSettingsSchema = z.object({
  autoVoucherNumbering: voucherNumberingSettingsSchema,
  allowVoucherNumberEditing: voucherEditableSettingsSchema,
  allowRateEditing: rateEditableSettingsSchema,
  voucherPrefixes: voucherPrefixSchema,
  enableVoucherPrefixSelection: voucherPrefixSelectionSchema,
  enableLinkPaymentToTxns: z.boolean(),
  /** Company-level: header Copy ledger + cross-company copy (permission `copy_ledger_cross_company` alag). */
  enableCrossCompanyLedgerCopy: z.boolean(),
  spendWiseEnabled: z.boolean(),
  /** Role + voucher-type: when Spend Wise is on, require Payment In link to save. */
  requirePaymentLinkByRole: requireLinkByRoleSchema.optional(),
  /** On opposite vouchers (Payment In, Contra in, Direct Income): when true, "Link for spend wise" is editable; when false, read-only. */
  spendWiseOppositeVoucherEditable: z.boolean(),
  voucherHistoryEnabled: z.boolean(),
  voucherHistoryLimit: z.number().min(1).max(100),
  /** Sirf `block_edit` / `allow_edit_delete_last` allowed; preprocess invalid ko normalize karta hai — "Invalid option" error avoid */
  voucherHistoryFullBehavior: z.preprocess(
    (raw) => normalizeVoucherHistoryFullBehavior(raw),
    z.enum(["block_edit", "allow_edit_delete_last"]),
  ),
});

type VoucherSettingsValues = z.infer<typeof voucherSettingsSchema>;

export function VoucherSettings() {
  // triggerSync / reloadLocalCompanyRegistry: save ke baad header `CopyLedgerHeaderButton` + SQLite mirror jaldi align
  const { company, companyId, loading: companyLoading, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const isCompanyOwner = !!company && (company.ownerId === user?.uid || (user?.email && company.ownerEmail === user.email));
  const [isLoading, setIsLoading] = useState(false);
  const [planHistoryLimit, setPlanHistoryLimit] = useState<number>(10);
   const [newPrefixValues, setNewPrefixValues] = useState<Record<keyof VoucherPrefixValues, string>>(
      Object.keys(defaultPrefixes).reduce((acc, key) => ({ ...acc, [key]: "" }), {} as any)
    );

  const form = useForm<VoucherSettingsValues>({
    // zod preprocess + RHF Resolver generic mismatch — runtime OK
    resolver: zodResolver(voucherSettingsSchema) as any,
    defaultValues: {
      autoVoucherNumbering: {
        sale: true, sale_service: true, purchase: true, purchase_service: true, payment_in: true, payment_out: true,
        contra: true, direct_income: true, direct_expense: true, journal: true, note: true,
        add_salary: true, pay_salary: true,
      },
      allowVoucherNumberEditing: {
        sale: false, sale_service: false, purchase: false, purchase_service: false, payment_in: false, payment_out: false,
        contra: false, direct_income: false, direct_expense: false, journal: false, note: false,
        add_salary: false, pay_salary: false,
      },
        allowRateEditing: {
          sale: true, purchase: true,
        },
        voucherPrefixes: defaultPrefixes,
        enableVoucherPrefixSelection: {
          sale: false, sale_service: false, purchase: false, purchase_service: false, payment_in: false, payment_out: false,
          contra: false, direct_income: false, direct_expense: false, journal: false, note: false,
          add_salary: false, pay_salary: false,
        },
        enableLinkPaymentToTxns: true,
        enableCrossCompanyLedgerCopy: false,
        spendWiseEnabled: false,
        spendWiseOppositeVoucherEditable: false,
        requirePaymentLinkByRole: ROLES_WITH_VOUCHER_CREATE.reduce(
          (acc, r) => ({ ...acc, [r]: { payment_out: true, contra: true, direct_expense: true } }),
          {} as Record<string, { payment_out: boolean; contra: boolean; direct_expense: boolean }>
        ),
        voucherHistoryEnabled: true,
        voucherHistoryLimit: 10,
        voucherHistoryFullBehavior: 'allow_edit_delete_last' as const,
    },
  });

  useEffect(() => {
    if (!companyId) return;
    getPlanVoucherHistoryLimit(companyId).then(setPlanHistoryLimit);
  }, [companyId]);

  useEffect(() => {
    if (company) {
      const prefixes = company.voucherPrefixes as any || {};
      const validPrefixes: Partial<VoucherPrefixValues> = {};
        for (const key in defaultPrefixes) {
            if (Array.isArray(prefixes[key]) && prefixes[key].length > 0) {
                validPrefixes[key as keyof VoucherPrefixValues] = prefixes[key];
            } else if (typeof prefixes[key] === 'string') { // Backwards compatibility
                validPrefixes[key as keyof VoucherPrefixValues] = [prefixes[key]];
            }
        }

      form.reset({
        autoVoucherNumbering: {
          ...form.getValues('autoVoucherNumbering'),
          ...company.autoVoucherNumbering,
        },
        allowVoucherNumberEditing: {
          ...form.getValues('allowVoucherNumberEditing'),
          ...company.allowVoucherNumberEditing,
        },
         allowRateEditing: {
          ...form.getValues('allowRateEditing'),
          ...company.allowRateEditing as any,
        },
        voucherPrefixes: { ...defaultPrefixes, ...validPrefixes },
        enableVoucherPrefixSelection: {
            ...form.getValues('enableVoucherPrefixSelection'),
            ...(company as any).enableVoucherPrefixSelection,
        },
        enableLinkPaymentToTxns: (company as any).enableLinkPaymentToTxns !== false,
        // `reset` me zaroor ho — warna RHF default `false` pe wapas, company Firestore se `true` ho to header switch mismatch
        enableCrossCompanyLedgerCopy: (company as any).enableCrossCompanyLedgerCopy === true,
        spendWiseEnabled: (company as any).spendWiseEnabled === true,
        spendWiseOppositeVoucherEditable: (company as any).spendWiseOppositeVoucherEditable === true,
        requirePaymentLinkByRole: (() => {
          const raw = (company as any).requirePaymentLinkByRole || {};
          const defaultPerRole = { payment_out: true, contra: true, direct_expense: true };
          return ROLES_WITH_VOUCHER_CREATE.reduce((acc, r) => {
            const v = raw[r];
            if (typeof v === "boolean") acc[r] = { ...defaultPerRole, payment_out: v, contra: v, direct_expense: v };
            else if (v && typeof v === "object") acc[r] = { ...defaultPerRole, ...v };
            else acc[r] = { ...defaultPerRole };
            return acc;
          }, {} as Record<string, { payment_out: boolean; contra: boolean; direct_expense: boolean }>);
        })(),
        voucherHistoryEnabled: (company as any).voucherHistoryEnabled !== false,
        voucherHistoryLimit: Math.max(1, Math.min(planHistoryLimit, Number((company as any).voucherHistoryLimit) || 10)),
        // Company se aayi value ko enum + Select ke saath align karo (invalid string → default)
        voucherHistoryFullBehavior: normalizeVoucherHistoryFullBehavior((company as any).voucherHistoryFullBehavior),
    });
    }
  }, [company, form, planHistoryLimit]);
  
  const handleAddPrefix = (key: keyof VoucherPrefixValues) => {
        const newValue = newPrefixValues[key]?.trim();
        if (newValue) {
            const currentPrefixes = form.getValues(`voucherPrefixes.${key}`);
            if (!currentPrefixes.includes(newValue)) {
                form.setValue(`voucherPrefixes.${key}`, [...currentPrefixes, newValue]);
                setNewPrefixValues(prev => ({...prev, [key]: ""}));
            }
        }
    };
    
    const handleRemovePrefix = (key: keyof VoucherPrefixValues, prefixToRemove: string) => {
        const currentPrefixes = form.getValues(`voucherPrefixes.${key}`);
        if (currentPrefixes.length > 1) { // Prevent removing the last prefix
            form.setValue(`voucherPrefixes.${key}`, currentPrefixes.filter(p => p !== prefixToRemove));
        } else {
            toast({ variant: 'destructive', title: "Cannot remove last prefix."})
        }
    };


  async function onSubmit(data: VoucherSettingsValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      const cappedHistoryLimit = Math.min(data.voucherHistoryLimit, planHistoryLimit);
      if (data.voucherHistoryLimit > planHistoryLimit) {
        toast({ title: "Plan limit applied", description: `Max history entries capped to ${planHistoryLimit} (your plan's limit).` });
      }
      const companyRef = doc(firestore, "companies", companyId);
      const voucherSettingsPatch = {
        autoVoucherNumbering: data.autoVoucherNumbering,
        allowVoucherNumberEditing: data.allowVoucherNumberEditing,
        allowRateEditing: data.allowRateEditing,
        voucherPrefixes: data.voucherPrefixes,
        enableVoucherPrefixSelection: data.enableVoucherPrefixSelection,
        enableLinkPaymentToTxns: data.enableLinkPaymentToTxns,
        enableCrossCompanyLedgerCopy: data.enableCrossCompanyLedgerCopy,
        spendWiseEnabled: data.spendWiseEnabled,
        spendWiseOppositeVoucherEditable: data.spendWiseOppositeVoucherEditable,
        requirePaymentLinkByRole: data.requirePaymentLinkByRole,
        voucherHistoryEnabled: data.voucherHistoryEnabled,
        voucherHistoryLimit: cappedHistoryLimit,
        voucherHistoryFullBehavior: data.voucherHistoryFullBehavior,
      };
      await updateDoc(companyRef, voucherSettingsPatch);
      // SQLite mirror me bhi likho — refresh par company yahan se aaye to toggle + header sync rahein
      try {
        const localRow = await getLocalCompanyById(companyId);
        if (localRow) {
          await upsertLocalCompany({
            ...(localRow as Record<string, unknown>),
            ...voucherSettingsPatch,
            id: companyId,
          } as unknown as Parameters<typeof upsertLocalCompany>[0]);
        }
      } catch {
        /* online-only / no local DB */
      }
      // Firestore snapshot se pehle bhi `company` + local registry refresh — header Sync ledger turant show/hide
      reloadLocalCompanyRegistry();
      triggerSync();
      toast({ title: "Success", description: "Voucher settings have been updated." });
    } catch (error) {
      console.error("Error updating voucher settings:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save voucher settings." });
    } finally {
      setIsLoading(false);
    }
  }

  if (companyLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher Settings</CardTitle>
        <CardDescription>Manage automatic numbering, prefixes, and editing rules for your vouchers.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-8">
            {/* Save Button at Top — blue so user spots save action */}
            <div className="flex justify-end pb-4 border-b">
              <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Voucher Settings
              </Button>
            </div>

             {/* Prefixes */}
             <div className="space-y-4">
                 <h3 className="text-lg font-medium border-b pb-2">Voucher Prefixes</h3>
                 <CardDescription>
                    Customize the prefixes for your voucher numbers. You can add multiple prefixes for each type.
                </CardDescription>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {Object.keys(defaultPrefixes).map((keyStr) => {
                        const key = keyStr as keyof VoucherPrefixValues;
                        return (
                        <div key={key} className="space-y-2">
                                <FormLabel>{prefixLabels[key]}</FormLabel>
                                {key === "contra" && (
                                  <FormDescription className="text-xs mt-0.5">Used for both Contra Out (from account) and Contra In (to account). e.g. CNTR → CNTR Out - 001, CNTR In - 001.</FormDescription>
                                )}
                            <div className="flex gap-2">
                                <Input
                                    value={newPrefixValues[key]}
                                    onChange={(e) => setNewPrefixValues(prev => ({...prev, [key]: e.target.value}))}
                                    placeholder="Add new prefix"
                                />
                                <Button type="button" size="icon" onClick={() => handleAddPrefix(key)}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2 min-h-[40px]">
                                {form.watch(`voucherPrefixes.${key}`).map(prefix => (
                                    <Badge key={prefix} variant="secondary" className="text-base">
                                        {prefix}
                                        <button type="button" onClick={() => handleRemovePrefix(key, prefix)} className="ml-2 rounded-full hover:bg-destructive/20 p-0.5">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )})}
                </div>
            </div>

            {/* Transaction Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium border-b pb-2">Transaction Settings</h3>
              <div className="space-y-4">
                <Card className="p-4">
                  <FormField
                    control={form.control}
                    name="enableLinkPaymentToTxns"
                    render={({ field }: any) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div>
                          <FormLabel>Link for Bill Wise</FormLabel>
                          <FormDescription className="sr-only">
                            When ON, bill-wise link section is available; when required by role, user must link to save voucher.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </Card>
                <Card className="p-4">
                  <FormField
                    control={form.control}
                    name="enableCrossCompanyLedgerCopy"
                    render={({ field }: any) => (
                      <FormItem className="flex flex-row items-center justify-between gap-4">
                        <div>
                          {/* Header jaisa sync icon + label — cross-company ledger sync toggle */}
                          <FormLabel className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            Sync ledger (cross-company)
                          </FormLabel>
                          <FormDescription>
                            When ON, header shows &quot;Sync ledger&quot; with the sync icon. User role needs permission &quot;Copy Ledger to Another Company&quot;.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </Card>
                {isCompanyOwner && (
                  <>
                    <Card className="p-4">
                      <FormField
                        control={form.control}
                        name="spendWiseOppositeVoucherEditable"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center justify-between">
                            <div>
                              <FormLabel>Link for spend wise on opposite voucher (Payment In, Contra in, Direct Income)</FormLabel>
                              <FormDescription>
                                Off: link section and all &quot;Require Payment In link&quot; toggles below are off. On: link section is editable and all require-link toggles turn on.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Off</span>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={(checked) => {
                                    field.onChange(checked);
                                    const allSame = ROLES_WITH_VOUCHER_CREATE.reduce(
                                      (acc, r) => ({ ...acc, [r]: { payment_out: checked, contra: checked, direct_expense: checked } }),
                                      {} as Record<string, { payment_out: boolean; contra: boolean; direct_expense: boolean }>
                                    );
                                    form.setValue("requirePaymentLinkByRole", allSame);
                                  }}
                                />
                                <span className="text-sm text-muted-foreground">On</span>
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </Card>
                    <Card className="p-4">
                    <div className="space-y-4 pl-1 border-l-2 border-muted pl-4">
                      <p className="text-sm font-medium">Require Payment In link (role + voucher type)</p>
                      <FormDescription className="!mt-0">
                        When ON, that role must link to Payment In to save. When OFF, they can save without linking. Set per voucher: Payment Out, Contra, Direct Expense.
                      </FormDescription>
                      {ROLES_WITH_VOUCHER_CREATE.map((role) => {
                        const byRole = form.watch("requirePaymentLinkByRole") || {} as Record<string, { payment_out: boolean; contra: boolean; direct_expense: boolean }>;
                        const row = byRole[role];
                        const payment_out = typeof row === "object" && row !== null ? row.payment_out === true : false;
                        const contra = typeof row === "object" && row !== null ? row.contra === true : false;
                        const direct_expense = typeof row === "object" && row !== null ? row.direct_expense === true : false;
                        const update = (key: "payment_out" | "contra" | "direct_expense", v: boolean) => {
                          const current = form.getValues("requirePaymentLinkByRole") || {};
                          const prev = (current[role] && typeof current[role] === "object") ? (current[role] as { payment_out: boolean; contra: boolean; direct_expense: boolean }) : { payment_out: false, contra: false, direct_expense: false };
                          const nextRow: { payment_out: boolean; contra: boolean; direct_expense: boolean } = {
                            payment_out: key === "payment_out" ? v : prev.payment_out,
                            contra: key === "contra" ? v : prev.contra,
                            direct_expense: key === "direct_expense" ? v : prev.direct_expense,
                          };
                          form.setValue("requirePaymentLinkByRole", { ...current, [role]: nextRow });
                        };
                        return (
                          <div key={role} className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">{ROLE_LABELS[role] ?? role}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border px-3 py-2">
                                <FormLabel className="font-normal text-sm cursor-pointer">Payment Out</FormLabel>
                                <FormControl>
                                  <Switch checked={payment_out} onCheckedChange={(v) => update("payment_out", v)} />
                                </FormControl>
                              </FormItem>
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border px-3 py-2">
                                <FormLabel className="font-normal text-sm cursor-pointer">Contra</FormLabel>
                                <FormControl>
                                  <Switch checked={contra} onCheckedChange={(v) => update("contra", v)} />
                                </FormControl>
                              </FormItem>
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border px-3 py-2">
                                <FormLabel className="font-normal text-sm cursor-pointer">Direct Expense</FormLabel>
                                <FormControl>
                                  <Switch checked={direct_expense} onCheckedChange={(v) => update("direct_expense", v)} />
                                </FormControl>
                              </FormItem>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </Card>
                  </>
                )}
              </div>
            </div>

            {/* Voucher Edit History — company setting */}
            {isCompanyOwner && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">Voucher Edit History</h3>
                <CardDescription>
                  Track changes to vouchers. When history is full, choose to block edits or allow edit by overwriting oldest history.
                </CardDescription>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isLoading} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Voucher Settings
                  </Button>
                </div>
                <Card className="p-4 space-y-4">
                  <FormField
                    control={form.control}
                    name="voucherHistoryEnabled"
                    render={({ field }: any) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div>
                          <FormLabel>Enable voucher edit history</FormLabel>
                          <FormDescription className="sr-only">When ON, edits are tracked; when OFF, no history is stored.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("voucherHistoryEnabled") && (
                    <>
                      <FormField
                        control={form.control}
                        name="voucherHistoryLimit"
                        render={({ field }: any) => (
                          <FormItem>
                            <FormLabel>Max history entries per voucher</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={planHistoryLimit}
                                {...field}
                                onChange={(e) => field.onChange(Math.max(1, Math.min(planHistoryLimit, parseInt(e.target.value, 10) || 10)))}
                              />
                            </FormControl>
                            <FormDescription>1–{planHistoryLimit}. Plan cap from subscription.</FormDescription>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="voucherHistoryFullBehavior"
                        render={({ field }: any) => (
                          <FormItem>
                            <FormLabel>When history is full</FormLabel>
                            <Select
                              // Controlled value hamesha valid item ho — warna Radix placeholder + zod error
                              value={normalizeVoucherHistoryFullBehavior(field.value)}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select behavior" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="block_edit">Block edit (user cannot edit until admin clears history)</SelectItem>
                                <SelectItem value="allow_edit_delete_last">Allow edit over writing oldest History</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </Card>
              </div>
            )}

            {/* Auto Numbering */}
             <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-lg font-medium">Voucher Number & Rate Settings</h3>
              </div>
              {/* Middle Button — blue to match other save buttons */}
              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Voucher Settings
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(prefixLabels).map((key) => {
                   const voucherKey = key as keyof VoucherPrefixValues;
                   const canEditRate = voucherKey === 'sale' || voucherKey === 'purchase';
                   if (voucherKey === 'contra') {
                     return (
                       <Card key={voucherKey} className="p-4 md:col-span-2">
                         <CardTitle className="text-base mb-1">Contra Entry (In & Out)</CardTitle>
                         <CardDescription className="mb-4 text-xs">One set of settings for both Contra In and Contra Out. Changing any switch applies to both.</CardDescription>
                         {/* PC: Contra In left, Contra Out right; mobile: stacked */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="rounded border border-muted/60 bg-muted/20 p-3 space-y-3">
                             <p className="text-sm font-medium text-muted-foreground">Contra In</p>
                             <FormField control={form.control} name="autoVoucherNumbering.contra" render={({ field }: any) => (
                               <FormItem className="flex flex-row items-center justify-between">
                                 <FormLabel>Auto Number</FormLabel>
                                 <FormControl>
                                   <Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); if (!checked) form.setValue("allowVoucherNumberEditing.contra", true); }} />
                                 </FormControl>
                               </FormItem>
                             )} />
                             <FormField control={form.control} name="allowVoucherNumberEditing.contra" render={({ field }: any) => (
                               <FormItem className="flex flex-row items-center justify-between">
                                 <FormLabel>Allow Editing No.</FormLabel>
                                 <FormControl>
                                   <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!form.watch("autoVoucherNumbering.contra")} />
                                 </FormControl>
                               </FormItem>
                             )} />
                             <FormField control={form.control} name="enableVoucherPrefixSelection.contra" render={({ field }: any) => (
                               <FormItem className="flex flex-row items-center justify-between">
                                 <FormLabel>Enable Prefix Selection</FormLabel>
                                 <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                               </FormItem>
                             )} />
                           </div>
                           <div className="rounded border border-muted/60 bg-muted/20 p-3 space-y-3">
                             <p className="text-sm font-medium text-muted-foreground">Contra Out</p>
                             <FormField control={form.control} name="autoVoucherNumbering.contra" render={({ field }: any) => (
                               <FormItem className="flex flex-row items-center justify-between">
                                 <FormLabel>Auto Number</FormLabel>
                                 <FormControl>
                                   <Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); if (!checked) form.setValue("allowVoucherNumberEditing.contra", true); }} />
                                 </FormControl>
                               </FormItem>
                             )} />
                             <FormField control={form.control} name="allowVoucherNumberEditing.contra" render={({ field }: any) => (
                               <FormItem className="flex flex-row items-center justify-between">
                                 <FormLabel>Allow Editing No.</FormLabel>
                                 <FormControl>
                                   <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!form.watch("autoVoucherNumbering.contra")} />
                                 </FormControl>
                               </FormItem>
                             )} />
                             <FormField control={form.control} name="enableVoucherPrefixSelection.contra" render={({ field }: any) => (
                               <FormItem className="flex flex-row items-center justify-between">
                                 <FormLabel>Enable Prefix Selection</FormLabel>
                                 <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                               </FormItem>
                             )} />
                           </div>
                         </div>
                       </Card>
                     );
                   }
                   return (
                      <Card key={voucherKey} className="p-4">
                         <CardTitle className="text-base mb-4">{prefixLabels[voucherKey]}</CardTitle>
                         <div className="space-y-4">
                           <FormField
                              control={form.control}
                              name={`autoVoucherNumbering.${voucherKey}`}
                              render={({ field }: any) => (
                                 <FormItem className="flex flex-row items-center justify-between">
                                    <FormLabel>Auto Number</FormLabel>
                                    <FormControl>
                                       <Switch
                                          checked={field.value}
                                          onCheckedChange={(checked) => {
                                            field.onChange(checked);
                                            if (!checked) {
                                              form.setValue(`allowVoucherNumberEditing.${voucherKey}`, true);
                                            }
                                          }}
                                        />
                                    </FormControl>
                                 </FormItem>
                              )}
                           />
                           <FormField
                              control={form.control}
                              name={`allowVoucherNumberEditing.${voucherKey}`}
                              render={({ field }: any) => (
                                 <FormItem className="flex flex-row items-center justify-between">
                                    <FormLabel>Allow Editing No.</FormLabel>
                                    <FormControl>
                                       <Switch 
                                            checked={field.value} 
                                            onCheckedChange={field.onChange} 
                                            disabled={!form.watch(`autoVoucherNumbering.${voucherKey}`)}
                                        />
                                    </FormControl>
                                 </FormItem>
                              )}
                           />
                            <FormField
                              control={form.control}
                              name={`enableVoucherPrefixSelection.${voucherKey}`}
                              render={({ field }: any) => (
                                 <FormItem className="flex flex-row items-center justify-between">
                                    <FormLabel>Enable Prefix Selection</FormLabel>
                                    <FormControl>
                                       <Switch 
                                            checked={field.value} 
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                 </FormItem>
                              )}
                           />
                           {canEditRate && (
                                <FormField
                                    control={form.control}
                                    name={`allowRateEditing.${voucherKey as 'sale' | 'purchase'}`}
                                    render={({ field }: any) => (
                                        <FormItem className="flex flex-row items-center justify-between">
                                        <FormLabel>Allow Rate Editing</FormLabel>
                                        <FormControl>
                                            <Switch 
                                                checked={field.value} 
                                                onCheckedChange={field.onChange} 
                                            />
                                        </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}
                         </div>
                      </Card>
                   )
                })}
              </div>
            </div>

            {/* Bottom Button — blue to match other save buttons */}
            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Voucher Settings
              </Button>
            </div>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

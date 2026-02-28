
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
import { Loader2, PlusCircle, X } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useState, useEffect } from "react";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";

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

const voucherSettingsSchema = z.object({
  autoVoucherNumbering: voucherNumberingSettingsSchema,
  allowVoucherNumberEditing: voucherEditableSettingsSchema,
  allowRateEditing: rateEditableSettingsSchema,
  voucherPrefixes: voucherPrefixSchema,
  enableVoucherPrefixSelection: voucherPrefixSelectionSchema,
  enableLinkPaymentToTxns: z.boolean(),
});

type VoucherSettingsValues = z.infer<typeof voucherSettingsSchema>;

export function VoucherSettings() {
  const { company, companyId, loading: companyLoading } = useCompany();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
   const [newPrefixValues, setNewPrefixValues] = useState<Record<keyof VoucherPrefixValues, string>>(
      Object.keys(defaultPrefixes).reduce((acc, key) => ({ ...acc, [key]: "" }), {} as any)
    );

  const form = useForm<VoucherSettingsValues>({
    resolver: zodResolver(voucherSettingsSchema),
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
    },
  });

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
      });
    }
  }, [company, form]);
  
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
      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, {
        autoVoucherNumbering: data.autoVoucherNumbering,
        allowVoucherNumberEditing: data.allowVoucherNumberEditing,
      allowRateEditing: data.allowRateEditing,
      voucherPrefixes: data.voucherPrefixes,
      enableVoucherPrefixSelection: data.enableVoucherPrefixSelection,
      enableLinkPaymentToTxns: data.enableLinkPaymentToTxns,
      });
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Save Button at Top */}
            <div className="flex justify-end pb-4 border-b">
              <Button type="submit" disabled={isLoading}>
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
              <Card className="p-4">
                <FormField
                  control={form.control}
                  name="enableLinkPaymentToTxns"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div>
                        <FormLabel>Enable Link Payment to Txns</FormLabel>
                        <FormDescription className="sr-only">
                          Allow linking received payments to specific sale invoices.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </Card>
            </div>

            {/* Auto Numbering */}
             <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-lg font-medium">Voucher Number & Rate Settings</h3>
              </div>
              {/* Middle Button */}
              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading} size="sm" variant="outline">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Voucher Settings
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(prefixLabels).map((key) => {
                   const voucherKey = key as keyof VoucherPrefixValues;
                   const canEditRate = voucherKey === 'sale' || voucherKey === 'purchase';
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

            {/* Bottom Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={isLoading}>
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

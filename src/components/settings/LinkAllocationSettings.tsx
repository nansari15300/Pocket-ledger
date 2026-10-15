"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/hooks/useCompany";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { persistCompanyRootSettingsPatch } from "@/lib/persistCompanyRootSettings";
import {
  resolveLinkAllocationSettings,
  type LinkAllocationSettings,
} from "@/lib/linkAllocationSettings";
import { Loader2, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const voucherBlockSchema = z.object({
  allowTaxOnPartyAmount: z.boolean(),
  allowTdsOnPartyAmount: z.boolean(),
});

const formSchema = z.object({
  addSalaryAllowTaxEntityOnStaffAmount: z.boolean(),
  sale: voucherBlockSchema,
  purchase: voucherBlockSchema,
});

type FormValues = z.infer<typeof formSchema>;

function prefsToForm(raw: LinkAllocationSettings | null | undefined): FormValues {
  const r = resolveLinkAllocationSettings(raw);
  return {
    addSalaryAllowTaxEntityOnStaffAmount: r.addSalary.allowTaxEntityOnStaffAmount,
    sale: {
      allowTaxOnPartyAmount: r.sale.allowTaxOnPartyAmount,
      allowTdsOnPartyAmount: r.sale.allowTdsOnPartyAmount,
    },
    purchase: {
      allowTaxOnPartyAmount: r.purchase.allowTaxOnPartyAmount,
      allowTdsOnPartyAmount: r.purchase.allowTdsOnPartyAmount,
    },
  };
}

function formToPrefs(data: FormValues): LinkAllocationSettings {
  return {
    addSalary: {
      allowTaxEntityOnStaffAmount: data.addSalaryAllowTaxEntityOnStaffAmount,
    },
    sale: {
      allowTaxOnPartyAmount: data.sale.allowTaxOnPartyAmount,
      allowTdsOnPartyAmount: data.sale.allowTdsOnPartyAmount,
    },
    purchase: {
      allowTaxOnPartyAmount: data.purchase.allowTaxOnPartyAmount,
      allowTdsOnPartyAmount: data.purchase.allowTdsOnPartyAmount,
    },
  };
}

const VOUCHER_CARD =
  "rounded-lg border border-teal-200/80 bg-gradient-to-b from-white to-sky-50/60 p-4 space-y-3";

export function LinkAllocationSettings() {
  const { company, companyId, loading: companyLoading, reloadLocalCompanyRegistry, triggerSync } =
    useCompany();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: prefsToForm(undefined),
  });

  useEffect(() => {
    if (!company) return;
    form.reset(prefsToForm((company as { linkAllocation?: LinkAllocationSettings }).linkAllocation));
  }, [company, form]);

  async function onSubmit(data: FormValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      await persistCompanyRootSettingsPatch({
        companyId,
        company,
        patch: { linkAllocation: formToPrefs(data) },
        reloadLocalCompanyRegistry,
        triggerSync,
      });
      toast({ title: "Success", description: "Link allocation settings saved." });
    } catch (error) {
      console.error("Error updating link allocation settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: isCompanyNotFoundError(error)
          ? COMPANY_NOT_SYNCED_MESSAGE
          : "Failed to save link allocation settings.",
      });
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
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          Link allocation
        </CardTitle>
        <CardDescription>
          Multi-account vouchers (Add Salary, Sale, Purchase) default to same-entity linking —
          staff amount ↔ staff payment, party taxable ↔ party payment, tax ↔ tax. Tick options
          below to also allow other entity payments on the same voucher’s taxable / after-tax
          amount.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Add Salary */}
            <div className={VOUCHER_CARD}>
              <div>
                <h3 className="text-sm font-semibold">Add Salary</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  After-tax salary amount — which payments may link on the same voucher.
                </p>
              </div>
              <div className="space-y-2.5">
                <label className="flex items-start gap-2.5 text-sm cursor-default opacity-90">
                  <Checkbox checked disabled className="mt-0.5" />
                  <span>
                    <span className="font-medium">Staff payment / opposite</span>
                    <span className="block text-xs text-muted-foreground">
                      Always on — staff after-tax amount links staff payment (default).
                    </span>
                  </span>
                </label>
                <FormField
                  control={form.control}
                  name="addSalaryAllowTaxEntityOnStaffAmount"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-2.5 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={!!field.value}
                          onCheckedChange={(v) => field.onChange(v === true)}
                          className="mt-0.5"
                        />
                      </FormControl>
                      <div className="space-y-0.5 leading-none">
                        <FormLabel className="font-medium cursor-pointer">
                          Tax entity payment on staff after-tax amount
                        </FormLabel>
                        <FormDescription className="text-xs !mt-1">
                          Allow tax-account payments (this salary’s tax lines) to also settle the
                          staff after-tax / taxable amount tab.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Sale */}
            <SalePurchaseBlock
              form={form}
              title="Sale"
              prefix="sale"
              description="Party taxable amount — which payments may link on the same sale voucher."
            />

            {/* Purchase */}
            <SalePurchaseBlock
              form={form}
              title="Purchase"
              prefix="purchase"
              description="Party taxable amount — which payments may link on the same purchase voucher."
            />

            <Button type="submit" disabled={isLoading || !companyId}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Link allocation
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function SalePurchaseBlock({
  form,
  title,
  prefix,
  description,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  title: string;
  prefix: "sale" | "purchase";
  description: string;
}) {
  return (
    <div className={VOUCHER_CARD}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className={cn("text-xs text-muted-foreground mt-0.5")}>{description}</p>
      </div>
      <div className="space-y-2.5">
        <label className="flex items-start gap-2.5 text-sm cursor-default opacity-90">
          <Checkbox checked disabled className="mt-0.5" />
          <span>
            <span className="font-medium">Party payment / opposite</span>
            <span className="block text-xs text-muted-foreground">
              Always on — taxable (party) amount links party payment / opposite (default).
            </span>
          </span>
        </label>
        <FormField
          control={form.control}
          name={`${prefix}.allowTaxOnPartyAmount`}
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2.5 space-y-0">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="space-y-0.5 leading-none">
                <FormLabel className="font-medium cursor-pointer">
                  Tax payment on taxable amount
                </FormLabel>
                <FormDescription className="text-xs !mt-1">
                  Also allow this voucher’s tax-account payments to settle the party / taxable
                  amount tab.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`${prefix}.allowTdsOnPartyAmount`}
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2.5 space-y-0">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="space-y-0.5 leading-none">
                <FormLabel className="font-medium cursor-pointer">
                  TDS payment / opposite on taxable amount
                </FormLabel>
                <FormDescription className="text-xs !mt-1">
                  Also allow this voucher’s TDS-account payments to settle the party / taxable
                  amount tab.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

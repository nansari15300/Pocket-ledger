"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCompany } from "@/hooks/useCompany";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { persistCompanyRootSettingsPatch } from "@/lib/persistCompanyRootSettings";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryCurrencyCombobox } from "@/components/shared/CountryCurrencyCombobox";
import {
  getDefaultCurrencyForCountry,
  resolveCurrencyCountryKey,
} from "@/lib/worldCurrencies";

const currencySettingsSchema = z.object({
  decimalPlaces: z.number().int().min(0).max(10),
  showDrCr: z.boolean(),
  showCurrencySymbol: z.boolean(),
  billingCurrencyCountry: z.string().min(1),
});

type CurrencySettingsValues = z.infer<typeof currencySettingsSchema>;

export function CurrencySettings() {
  const { company, companyId, loading: companyLoading, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CurrencySettingsValues>({
    resolver: zodResolver(currencySettingsSchema),
    defaultValues: {
      decimalPlaces: 2,
      showDrCr: true,
      showCurrencySymbol: true,
      billingCurrencyCountry: "Nepal",
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        decimalPlaces: company.decimalPlaces ?? 2,
        showDrCr: company.showDrCr ?? true,
        showCurrencySymbol: company.showCurrencySymbol ?? true,
        billingCurrencyCountry: resolveCurrencyCountryKey(company),
      });
    }
  }, [company, form]);

  async function onSubmit(data: CurrencySettingsValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    const row = getDefaultCurrencyForCountry(data.billingCurrencyCountry);
    setIsLoading(true);
    try {
      await persistCompanyRootSettingsPatch({
        companyId,
        company,
        patch: {
          decimalPlaces: data.decimalPlaces,
          showDrCr: data.showDrCr,
          showCurrencySymbol: data.showCurrencySymbol,
          currencyCode: row.currencyCode,
          currencySymbol: row.symbol,
        },
        reloadLocalCompanyRegistry,
        triggerSync,
      });
      toast({ title: "Success", description: "Currency settings have been updated." });
    } catch (error) {
      console.error("Error updating currency settings:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save currency settings." });
    } finally {
      setIsLoading(false);
    }
  }

  if (companyLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const previewRow = getDefaultCurrencyForCountry(form.watch("billingCurrencyCountry"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currency &amp; Display Settings</CardTitle>
        <CardDescription>
          Configure currency display options for the application.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="billingCurrencyCountry"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Currency (search by country)</FormLabel>
                  <FormControl>
                    <CountryCurrencyCombobox
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Search country or currency"
                    />
                  </FormControl>
                  <FormDescription>
                    Display symbol: {previewRow.symbol} ({previewRow.currencyCode}) — used in vouchers, dashboard, and billing.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="decimalPlaces"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Number of Decimals</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={10} {...field} className="max-w-sm" />
                  </FormControl>
                  <FormDescription>
                    Set the number of decimal places for currency values. Use 0 to allow any number of decimals.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="showDrCr"
              render={({ field }: any) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Show Dr/Cr Suffix
                    </FormLabel>
                    <FormDescription>
                      Display &apos;Dr&apos; or &apos;Cr&apos; next to balance amounts.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="showCurrencySymbol"
              render={({ field }: any) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Show Currency Symbol
                    </FormLabel>
                    <FormDescription>
                      Display the currency symbol next to amounts.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

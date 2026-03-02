"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const CURRENCY_SYMBOL_OPTIONS = [
  { value: "Rs.", label: "Rs." },
  { value: "₹", label: "₹ (Rupee sign)" },
  { value: "$", label: "$" },
  { value: "NPR", label: "NPR" },
] as const;

const currencySettingsSchema = z.object({
  decimalPlaces: z.number().int().min(0).max(10),
  showDrCr: z.boolean(),
  showCurrencySymbol: z.boolean(),
  currencySymbol: z.string(),
});

type CurrencySettingsValues = z.infer<typeof currencySettingsSchema>;

export function CurrencySettings() {
  const { company, companyId, loading: companyLoading } = useCompany();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CurrencySettingsValues>({
    resolver: zodResolver(currencySettingsSchema),
    defaultValues: {
      decimalPlaces: 2,
      showDrCr: true,
      showCurrencySymbol: true,
      currencySymbol: "Rs.",
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        decimalPlaces: company.decimalPlaces ?? 2,
        showDrCr: company.showDrCr ?? true,
        showCurrencySymbol: company.showCurrencySymbol ?? true,
        currencySymbol: company.currencySymbol ?? "Rs.",
      });
    }
  }, [company, form]);

  async function onSubmit(data: CurrencySettingsValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, {
        decimalPlaces: data.decimalPlaces,
        showDrCr: data.showDrCr,
        showCurrencySymbol: data.showCurrencySymbol,
        currencySymbol: data.currencySymbol,
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
                      Display 'Dr' or 'Cr' next to balance amounts.
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
            <FormField
              control={form.control}
              name="currencySymbol"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Currency Symbol</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="max-w-xs">
                        <SelectValue placeholder="Select symbol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRENCY_SYMBOL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Symbol used for amounts in the app and in alerts (e.g. Rs., ₹, $).
                  </FormDescription>
                  <FormMessage />
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

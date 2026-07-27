"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { persistCompanyRootSettingsPatch } from "@/lib/persistCompanyRootSettings";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const displaySettingsSchema = z.object({
  showDebit: z.boolean(),
  showCredit: z.boolean(),
  showBalance: z.boolean(),
  showTotalDebit: z.boolean(),
  showTotalCredit: z.boolean(),
  /** Poori app / DateProvider me AD vs BS vs dono — company-wide reference. */
  calendarDateSystem: z.enum(["AD", "BS", "Both"]),
});

type DisplaySettingsValues = z.infer<typeof displaySettingsSchema>;

const displayDefaults: DisplaySettingsValues = {
  showDebit: true,
  showCredit: true,
  showBalance: true,
  showTotalDebit: true,
  showTotalCredit: true,
  calendarDateSystem: "BS",
};

const displayLabels: { key: keyof DisplaySettingsValues; label: string }[] = [
    { key: "showDebit", label: "Show Debit Column" },
    { key: "showCredit", label: "Show Credit Column" },
    { key: "showBalance", label: "Show Balance Column/Value" },
    { key: "showTotalDebit", label: "Show Total Debit Summary" },
    { key: "showTotalCredit", label: "Show Total Credit Summary" },
];

export function DisplaySettings() {
  const { company, companyId, loading: companyLoading, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<DisplaySettingsValues>({
    resolver: zodResolver(displaySettingsSchema),
    defaultValues: displayDefaults,
  });

  useEffect(() => {
    if (!company) return;
    const cal =
      (company.displaySettings?.calendarDateSystem as "AD" | "BS" | "Both" | undefined) ??
      (company.country !== "Nepal" ? "AD" : "BS");
    form.reset({
      ...displayDefaults,
      ...(company.displaySettings || {}),
      calendarDateSystem: ["AD", "BS", "Both"].includes(cal) ? cal : "BS",
    });
  }, [company, form]);

  async function onSubmit(data: DisplaySettingsValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      // Merge taaki future displaySettings keys na hat jaayein.
      await persistCompanyRootSettingsPatch({
        companyId,
        company,
        patch: {
          displaySettings: { ...(company.displaySettings || {}), ...data },
        },
        reloadLocalCompanyRegistry,
        triggerSync,
      });
      toast({ title: "Success", description: "Display settings have been updated." });
    } catch (error) {
      console.error("Error updating display settings:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save display settings." });
    } finally {
      setIsLoading(false);
    }
  }

  if (companyLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Label &amp; Column Display</CardTitle>
        <CardDescription>
          Choose which financial columns and summaries are visible across the application, and the default calendar
          reference (AD / BS / both) for dates app-wide.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="calendarDateSystem"
              render={({ field }) => (
                <FormItem className="rounded-lg border p-4">
                  <FormLabel className="text-base">System calendar (date reference)</FormLabel>
                  <p className="text-sm text-muted-foreground pb-2">
                    Lists, vouchers, and recurring settings use this for labels and date pickers. BS = Bikram Sambat;
                    Both shows AD and BS where the app supports dual fields.
                  </p>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose calendar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="AD">AD only (Gregorian)</SelectItem>
                      <SelectItem value="BS">BS only (Bikram Sambat)</SelectItem>
                      <SelectItem value="Both">Both AD and BS</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <div className="space-y-4">
              {displayLabels.map(({ key, label }) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }: any) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">{label}</FormLabel>
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
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Display Settings
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

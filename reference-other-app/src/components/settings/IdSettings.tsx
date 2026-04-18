"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useCompany } from "@/hooks/useCompany";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const idSettingsSchema = z.object({
  party: z.boolean(),
  bank: z.boolean(),
  staff: z.boolean(),
  tax: z.boolean(),
  item: z.boolean(),
});

type IdSettingsValues = z.infer<typeof idSettingsSchema>;

const idLabels: { key: keyof IdSettingsValues; label: string }[] = [
    { key: "party", label: "Auto-generate ID for Parties" },
    { key: "bank", label: "Auto-generate ID for Bank/Cash" },
    { key: "staff", label: "Auto-generate ID for Staff" },
    { key: "tax", label: "Auto-generate ID for Taxes" },
    { key: "item", label: "Auto-generate ID for Items" },
];

export function IdSettings() {
  const { company, companyId, loading: companyLoading } = useCompany();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<IdSettingsValues>({
    resolver: zodResolver(idSettingsSchema),
    defaultValues: {
      party: false,
      bank: false,
      staff: false,
      tax: false,
      item: false,
    },
  });

  useEffect(() => {
    if (company?.idSettings) {
      form.reset(company.idSettings);
    }
  }, [company, form]);

  async function onSubmit(data: IdSettingsValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, { idSettings: data });
      toast({ title: "Success", description: "ID settings have been updated." });
    } catch (error) {
      console.error("Error updating ID settings:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save ID settings." });
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
        <CardTitle>Automatic ID Generation</CardTitle>
        <CardDescription>
          Enable or disable automatic ID number generation for new entities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4">
              {idLabels.map(({ key, label }) => (
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
                Save ID Settings
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

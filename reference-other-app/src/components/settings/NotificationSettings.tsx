"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { useUnreadNotificationCount, useUnreadAlertsCount } from "@/hooks/useUnreadNotificationCount";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { Loader2, Bell, CheckCircle, MessageSquare, Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotificationSettings as NotificationSettingsType } from "@/hooks/useCompany";

const schema = z.object({
  approveOn: z.boolean(),
  approveOnEntity: z.boolean(),
  approveOnList: z.boolean(),
  approveOnTransaction: z.boolean(),
  messageOn: z.boolean(),
  messageOnEntity: z.boolean(),
  messageOnList: z.boolean(),
  transactionAlertsOn: z.boolean(),
  transactionAlertsOnEntity: z.boolean(),
  transactionAlertsOnTabs: z.boolean(),
  transactionAlertsOnList: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  approveOn: true,
  approveOnEntity: true,
  approveOnList: true,
  approveOnTransaction: true,
  messageOn: true,
  messageOnEntity: true,
  messageOnList: true,
  transactionAlertsOn: true,
  transactionAlertsOnEntity: true,
  transactionAlertsOnTabs: true,
  transactionAlertsOnList: true,
};

function toFormValues(n: NotificationSettingsType | undefined): FormValues {
  if (!n) return defaultValues;
  return {
    approveOn: n.approve?.on ?? true,
    approveOnEntity: n.approve?.onEntity ?? true,
    approveOnList: n.approve?.onList ?? true,
    approveOnTransaction: n.approve?.onTransaction ?? true,
    messageOn: n.message?.on ?? true,
    messageOnEntity: n.message?.onEntity ?? true,
    messageOnList: n.message?.onList ?? true,
    transactionAlertsOn: n.transactionAlerts?.on ?? true,
    transactionAlertsOnEntity: n.transactionAlerts?.onEntity ?? true,
    transactionAlertsOnTabs: n.transactionAlerts?.onTabs ?? true,
    transactionAlertsOnList: n.transactionAlerts?.onList ?? true,
  };
}

function toNotificationSettings(data: FormValues): NotificationSettingsType {
  return {
    approve: {
      on: data.approveOn,
      onEntity: data.approveOnEntity,
      onList: data.approveOnList,
      onTransaction: data.approveOnTransaction,
    },
    message: {
      on: data.messageOn,
      onEntity: data.messageOnEntity,
      onList: data.messageOnList,
      onTransaction: false, // Messages do not have transactions; option removed from UI
    },
    transactionAlerts: {
      on: data.transactionAlertsOn,
      onEntity: data.transactionAlertsOnEntity,
      onTabs: data.transactionAlertsOnTabs,
      onList: data.transactionAlertsOnList,
    },
  };
}

export function NotificationSettings() {
  const { company, companyId, triggerSync, loading: companyLoading } = useCompany();
  const { vouchers } = useVouchers();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const unapprovedCount = (vouchers || []).filter((v: any) => v.isApproved !== true).length;
  const unreadMessageCount = useUnreadNotificationCount();
  const unreadAlertsCount = useUnreadAlertsCount();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (company?.notificationSettings) {
      form.reset(toFormValues(company.notificationSettings));
    } else {
      form.reset(defaultValues);
    }
  }, [company?.notificationSettings, form]);

  async function onSubmit(data: FormValues) {
    if (!companyId) {
      toast({ variant: "destructive", title: "No company selected." });
      return;
    }
    setIsLoading(true);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, { notificationSettings: toNotificationSettings(data) });
      toast({ title: "Saved", description: "Notification settings updated." });
      triggerSync();
    } catch (error) {
      console.error("Error updating notification settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (companyLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Control where approve and message notifications appear (entity pages, list pages, and transaction rows).
            Only users with the relevant permissions will see these indicators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Pending approval vouchers */}
              <div className="space-y-4">
                <h4 className="text-lg font-normal flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  pending approval vouchers
                  <span className="inline-flex items-center justify-center rounded-md border border-pink-200 dark:border-pink-800 bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-200 text-sm font-normal min-w-[1.5rem] h-6 px-2">
                    {unapprovedCount}
                  </span>
                </h4>
                <p className="text-xs text-muted-foreground">
                  Show pending-approval vouchers to users with Approve Transactions permission.
                </p>
                <div className="grid gap-4 pl-4 border-l-2 border-muted">
                  <FormField
                    control={form.control}
                    name="approveOn"
                    render={({ field }: any) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <FormLabel>Approve notifications on</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("approveOn") && (
                    <>
                      <FormField
                        control={form.control}
                        name="approveOnEntity"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on entity pages (Party, Bank, Staff, etc.)</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="approveOnList"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on list pages</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="approveOnTransaction"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on transactions (pending-approval row in pink)</FormLabel>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Message notifications */}
              <div className="space-y-4">
                <h4 className="text-lg font-normal flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  message notifications
                  <span className="inline-flex items-center justify-center rounded-md border border-pink-200 dark:border-pink-800 bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-200 text-sm font-normal min-w-[1.5rem] h-6 px-2">
                    {unreadMessageCount}
                  </span>
                </h4>
                <p className="text-xs text-muted-foreground">
                  Show message/alerts indicators on the sidebar Messages menu and in the message list.
                </p>
                <div className="grid gap-4 pl-4 border-l-2 border-muted">
                  <FormField
                    control={form.control}
                    name="messageOn"
                    render={({ field }: any) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <FormLabel>Message notifications on</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("messageOn") && (
                    <>
                      <FormField
                        control={form.control}
                        name="messageOnEntity"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on entity (sidebar Messages menu)</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="messageOnList"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on list (message list)</FormLabel>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Edits and bigger amount add alert */}
              <div className="space-y-4">
                <h4 className="text-lg font-normal flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Edits and bigger amount add alert
                  <span className="inline-flex items-center justify-center rounded-md border border-pink-200 dark:border-pink-800 bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-200 text-sm font-normal min-w-[1.5rem] h-6 px-2">
                    {unreadAlertsCount}
                  </span>
                </h4>
                <p className="text-xs text-muted-foreground">
                  Notify company admin in Messages → Alerts when a transaction is deleted, edited, or when a voucher with amount &gt; ₹1,00,000 is added.
                </p>
                <div className="grid gap-4 pl-4 border-l-2 border-muted">
                  <FormField
                    control={form.control}
                    name="transactionAlertsOn"
                    render={({ field }: any) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <FormLabel>Edits and bigger amount add alert on</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("transactionAlertsOn") && (
                    <>
                      <FormField
                        control={form.control}
                        name="transactionAlertsOnEntity"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on entity (sidebar Messages menu)</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transactionAlertsOnTabs"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on tabs (Alerts tab badge)</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="transactionAlertsOnList"
                        render={({ field }: any) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Show on chat account list</FormLabel>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              </div>

              <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

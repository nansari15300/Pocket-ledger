"use client";

import { useState } from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  cnMasterEntityDialogContent,
  masterEntityDialogFormWrapperClassName,
  masterEntityDialogHeaderClassName,
} from "@/lib/masterEntityDialogClasses";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_CLASS, BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { MasterFormTwoColGrid } from "@/components/inter-company/MasterFormLayout";
import { createAdminPanelEntity } from "@/lib/adminPanelCompany/entityClient";
import { ScrollArea } from "@/components/ui/scroll-area";

const formSchema = z.object({
  accountName: z.string().min(2, "Account name must be at least 2 characters."),
  accountType: z.enum(["Bank", "Cash"]),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  openingBalance: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AdminPanelCreateBankDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const isMobile = useIsMobile();
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      accountName: "",
      accountType: "Bank",
      bankName: "",
      accountNumber: "",
      openingBalance: 0,
    },
  });

  const submit = async (values: FormValues, saveAndNew: boolean) => {
    setSaving(true);
    try {
      const { id } = await createAdminPanelEntity("bank_accounts", {
        name: values.accountName,
        accountType: values.accountType,
        bankName: values.bankName ?? "",
        accountNumber: values.accountNumber ?? "",
        openingBalance: values.openingBalance ?? 0,
      });
      toast.success("Bank/Cash account created");
      onCreated?.(id);
      form.reset({
        accountName: "",
        accountType: "Bank",
        bankName: "",
        accountNumber: "",
        openingBalance: 0,
      });
      if (!saveAndNew) onOpenChange(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cnMasterEntityDialogContent(isMobile)}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className={masterEntityDialogHeaderClassName}>
          <DialogTitle>Create a New Bank/Cash Account</DialogTitle>
          <DialogDescription>
            Add a gateway or bank account for Admin Panel Company collections and payments.
          </DialogDescription>
        </DialogHeader>
        <div className={masterEntityDialogFormWrapperClassName}>
          <Form {...form}>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={form.handleSubmit((values) => void submit(values, false))}
            >
              <ScrollArea className="min-h-0 flex-1 px-1">
                <div className="space-y-4 p-1 pb-4">
                  <MasterFormTwoColGrid>
                    <FormField
                      control={form.control}
                      name="accountName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Stripe clearing / Nabil" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="accountType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account type</FormLabel>
                          <FormControl>
                            <RadioGroup
                              className="flex gap-4 pt-2"
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="Bank" />
                                </FormControl>
                                <FormLabel className="font-normal">Bank</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="Cash" />
                                </FormControl>
                                <FormLabel className="font-normal">Cash</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank / gateway</FormLabel>
                          <FormControl>
                            <Input placeholder="Bank or payment gateway" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="accountNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account number</FormLabel>
                          <FormControl>
                            <Input placeholder="Account / merchant id" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="openingBalance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opening balance</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </MasterFormTwoColGrid>
                </div>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

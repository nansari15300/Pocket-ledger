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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { MasterFormTwoColGrid, MasterMobileNoField } from "@/components/inter-company/MasterFormLayout";
import { createAdminPanelEntity } from "@/lib/adminPanelCompany/entityClient";
import { ScrollArea } from "@/components/ui/scroll-area";

const formSchema = z.object({
  name: z.string().min(2, "Party name is required."),
  phone: z.string().optional(),
  email: z.union([z.string().email("Please enter a valid email."), z.literal("")]).optional(),
  address: z.string().optional(),
  openingBalance: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Isolated copy of Create Party dialog chrome + core fields.
 * Saves only to admin_panel_companies via Admin API (no useCompany).
 */
export function AdminPanelCreatePartyDialog({
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
    defaultValues: { name: "", phone: "", email: "", address: "", openingBalance: 0 },
  });

  const submit = async (values: FormValues, saveAndNew: boolean) => {
    setSaving(true);
    try {
      const { id } = await createAdminPanelEntity("parties", {
        name: values.name,
        phone: values.phone ?? "",
        email: values.email ?? "",
        address: values.address ?? "",
        openingBalance: values.openingBalance ?? 0,
      });
      toast.success("Subscriber/party created");
      onCreated?.(id);
      form.reset({ name: "", phone: "", email: "", address: "", openingBalance: 0 });
      if (!saveAndNew) onOpenChange(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save party");
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
          <DialogTitle>Create a New Party</DialogTitle>
          <DialogDescription>
            Add a subscriber party to Admin Panel Company. Automatic parties from payments come in the next phase.
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
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Party name</FormLabel>
                          <FormControl>
                            <Input placeholder="Customer / subscriber name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <MasterMobileNoField control={form.control} name="phone" />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="email@example.com" {...field} />
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
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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

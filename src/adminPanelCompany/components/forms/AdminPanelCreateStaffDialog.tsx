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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  name: z.string().min(2, "Staff name must be at least 2 characters."),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  role: z.string().optional(),
  salary: z.coerce.number().min(0).optional(),
  salaryPeriod: z.enum(["Daily", "Weekly", "Monthly", "Yearly"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AdminPanelCreateStaffDialog({
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
      name: "",
      email: "",
      phone: "",
      address: "",
      role: "accountant",
      salary: 0,
      salaryPeriod: "Monthly",
    },
  });

  const submit = async (values: FormValues, saveAndNew: boolean) => {
    setSaving(true);
    try {
      const { id } = await createAdminPanelEntity("staff", {
        name: values.name,
        email: values.email ?? "",
        phone: values.phone ?? "",
        address: values.address ?? "",
        role: values.role || "accountant",
        salary: values.salary ?? 0,
        salaryPeriod: values.salaryPeriod ?? "Monthly",
      });
      toast.success("Staff created");
      onCreated?.(id);
      form.reset({
        name: "",
        email: "",
        phone: "",
        address: "",
        role: "accountant",
        salary: 0,
        salaryPeriod: "Monthly",
      });
      if (!saveAndNew) onOpenChange(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save staff");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cnMasterEntityDialogContent(isMobile, "sm:max-w-2xl")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className={masterEntityDialogHeaderClassName}>
          <DialogTitle>Create a New Staff Member</DialogTitle>
          <DialogDescription>
            Add Admin Panel Company staff for salary and ledger permissions later.
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
                          <FormLabel>Staff name</FormLabel>
                          <FormControl>
                            <Input placeholder="Employee name" {...field} />
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
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company role</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="accountant">Accountant</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="salary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Salary</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="salaryPeriod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Salary period</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Period" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Daily">Daily</SelectItem>
                              <SelectItem value="Weekly">Weekly</SelectItem>
                              <SelectItem value="Monthly">Monthly</SelectItem>
                              <SelectItem value="Yearly">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
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

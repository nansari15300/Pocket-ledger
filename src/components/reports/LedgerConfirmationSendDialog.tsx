"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listMasterAccountContactOptions,
  type MasterAccountContactChannel,
} from "@/lib/reports/masterAccountContactTier";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName?: string;
  entity: { phone?: string | null; email?: string | null; whatsapp?: boolean };
  actionLabel: string;
  pending?: boolean;
  onConfirm: (channels: MasterAccountContactChannel[]) => void | Promise<void>;
};

export function LedgerConfirmationSendDialog({
  open,
  onOpenChange,
  entityName,
  entity,
  actionLabel,
  pending = false,
  onConfirm,
}: Props) {
  const contactOptions = useMemo(() => listMasterAccountContactOptions(entity), [entity]);
  const [selected, setSelected] = useState<MasterAccountContactChannel[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelected(contactOptions.map((option) => option.id));
  }, [open, contactOptions]);

  const toggleChannel = (id: MasterAccountContactChannel, checked: boolean) => {
    setSelected((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  };

  const canSend = selected.length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {entityName
              ? `Select contact for ${entityName}. On mobile: PDF shares directly. On desktop: PDF downloads and WhatsApp Web opens — attach with 📎.`
              : "Select contact. On mobile: PDF shares directly. On desktop: PDF downloads and WhatsApp Web opens — attach with 📎."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {contactOptions.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => toggleChannel(option.id, value === true)}
                  aria-label={`Send via ${option.label}`}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block break-all text-sm text-muted-foreground">{option.value}</span>
                </span>
              </label>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSend} onClick={() => void onConfirm(selected)}>
            {pending ? "Sending..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

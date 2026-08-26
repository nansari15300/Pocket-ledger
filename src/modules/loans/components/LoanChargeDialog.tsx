"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { CHARGE_TYPES } from "../constants/loanConstants";
import type { Loan } from "../types/loanTypes";
import type { LoanChargeInput } from "../types/loanTransactionTypes";
import { todayIso } from "../utils/loanDateUtils";
import { useVouchers } from "@/hooks/useVouchers";
import { LoanSystemDateField } from "./LoanSystemDateField";
import { LoanVoucherAttachmentsField } from "./LoanVoucherAttachmentsField";

export function LoanChargeDialog({
  open,
  onOpenChange,
  loan,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
  onSubmit: (input: LoanChargeInput) => Promise<void>;
}) {
  const [chargeType, setChargeType] = useState<LoanChargeInput["chargeType"]>("processing_fee");
  const [name, setName] = useState("Processing Fee");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState(loan?.processingFeeAccountId || "");
  const [bankAccountId, setBankAccountId] = useState(loan?.bankAccountId || "");
  const [attachmentFiles, setAttachmentFiles] = useState<(File | string)[]>([]);
  const [busy, setBusy] = useState(false);
  const { processedAccounts, processedExpenseAccounts } = useVouchers();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Loan Charge</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={chargeType} onValueChange={(v) => setChargeType(v as LoanChargeInput["chargeType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHARGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Charge name" />
          <Input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          <div className="space-y-1">
            <Label>Date</Label>
            <LoanSystemDateField value={date} onChange={setDate} />
          </div>
          <div className="space-y-1">
            <Label>Expense account</Label>
            <Combobox
              options={(processedExpenseAccounts || []).map((e: { id: string; name?: string }) => ({ value: e.id, label: String(e.name || e.id) }))}
              value={accountId}
              onChange={setAccountId}
            />
          </div>
          <div className="space-y-1">
            <Label>Bank / Cash</Label>
            <Combobox
              options={(processedAccounts || []).map((a: { id: string; accountName?: string; name?: string }) => ({ value: a.id, label: String(a.accountName || a.name || a.id) }))}
              value={bankAccountId}
              onChange={setBankAccountId}
            />
          </div>
          <LoanVoucherAttachmentsField files={attachmentFiles} setFiles={setAttachmentFiles} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            className={BTN_SAVE_CLASS}
            disabled={busy || !loan}
            onClick={async () => {
              if (!loan) return;
              setBusy(true);
              try {
                await onSubmit({ chargeType, name, amount, date, accountId, bankAccountId, attachmentFiles });
                onOpenChange(false);
                setAttachmentFiles([]);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Posting…" : "Post Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

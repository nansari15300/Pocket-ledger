"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { Loan } from "../types/loanTypes";
import type { LoanPrepaymentInput } from "../types/loanTransactionTypes";
import { todayIso } from "../utils/loanDateUtils";
import { useVouchers } from "@/hooks/useVouchers";
import { LoanSystemDateField } from "./LoanSystemDateField";
import { LoanVoucherAttachmentsField } from "./LoanVoucherAttachmentsField";

export function LoanPrepaymentDialog({
  open,
  onOpenChange,
  loan,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
  onSubmit: (input: LoanPrepaymentInput) => Promise<void>;
}) {
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState<"reduce_emi" | "reduce_tenure">("reduce_tenure");
  const [bankAccountId, setBankAccountId] = useState(loan?.bankAccountId || "");
  const [attachmentFiles, setAttachmentFiles] = useState<(File | string)[]>([]);
  const [busy, setBusy] = useState(false);
  const { processedAccounts } = useVouchers();
  const bankOptions = (processedAccounts || []).map((a: { id: string; accountName?: string; name?: string }) => ({
    value: a.id,
    label: String(a.accountName || a.name || a.id),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prepayment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Outstanding principal: {loan?.outstandingPrincipal ?? 0}. Posted journals are not rewritten.</p>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <LoanSystemDateField value={date} onChange={setDate} />
          </div>
          <div className="space-y-1">
            <Label>Bank / Cash</Label>
            <Combobox options={bankOptions} value={bankAccountId} onChange={setBankAccountId} />
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "reduce_tenure"} onChange={() => setMode("reduce_tenure")} />
              Reduce tenure
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "reduce_emi"} onChange={() => setMode("reduce_emi")} />
              Reduce EMI
            </label>
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
                await onSubmit({ amount, date, bankAccountId, mode, attachmentFiles });
                onOpenChange(false);
                setAttachmentFiles([]);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Posting…" : "Post Prepayment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

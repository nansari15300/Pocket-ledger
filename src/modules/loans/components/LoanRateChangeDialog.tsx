"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { Loan } from "../types/loanTypes";
import type { LoanRateChangeInput } from "../types/loanTransactionTypes";
import { todayIso } from "../utils/loanDateUtils";
import { LoanSystemDateField } from "./LoanSystemDateField";

export function LoanRateChangeDialog({
  open,
  onOpenChange,
  loan,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
  onSubmit: (input: LoanRateChangeInput) => Promise<void>;
}) {
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [newRate, setNewRate] = useState(loan?.interestRate || 0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Interest Rate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">Current rate: {loan?.interestRate}%</p>
          <div className="space-y-1">
            <Label>Effective date</Label>
            <LoanSystemDateField value={effectiveDate} onChange={setEffectiveDate} />
          </div>
          <div className="space-y-1">
            <Label>New rate (% p.a.)</Label>
            <Input type="number" min={0} step="0.01" value={newRate} onChange={(e) => setNewRate(Number(e.target.value) || 0)} />
          </div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
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
                await onSubmit({ effectiveDate, newRate, reason });
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save Rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

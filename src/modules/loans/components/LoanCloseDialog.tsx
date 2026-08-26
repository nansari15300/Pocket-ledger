"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { Loan } from "../types/loanTypes";

export function LoanCloseDialog({
  open,
  onOpenChange,
  loan,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
  onSubmit: (reason: string, force: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const canAuto = !!loan && loan.outstandingPrincipal <= 0 && loan.outstandingInterest <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close Loan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Outstanding principal: {loan?.outstandingPrincipal ?? 0}</p>
          {!canAuto ? <p className="text-amber-700">Loan still has outstanding balances. Manual close requires a reason.</p> : null}
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {!canAuto ? (
            <label className="flex items-center gap-2">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
              Manual close (authorized)
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            className={BTN_SAVE_CLASS}
            disabled={busy || !loan || (!canAuto && (!force || !reason.trim()))}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(reason, force);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Closing…" : "Close Loan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

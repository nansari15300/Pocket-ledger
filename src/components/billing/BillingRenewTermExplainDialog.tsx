"use client";

import { BILLING_TERM_OPTIONS, type SubscriptionTermKey } from "@/lib/subscriptionPlanMath";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type BillingRenewTermStackPreview = {
  planName: string;
  selectedTermLabel: string;
  termDays: number;
  currentExpiryLabel: string;
  newExpiryLabel: string;
  chargeNpr: number;
};

export type BillingRenewTermExplainDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: BillingRenewTermStackPreview;
  daysLeftOnPlan: number | null;
  currencySymbol: string;
  onConfirm: () => void;
};

export function billingTermOptionLabel(term: SubscriptionTermKey): string {
  return BILLING_TERM_OPTIONS.find((o) => o.value === term)?.label ?? term;
}

/**
 * Paid user picks a term: explain stack on current end date + full term charge (no proration table).
 */
export function BillingRenewTermExplainDialog({
  open,
  onOpenChange,
  preview,
  daysLeftOnPlan,
  currencySymbol,
  onConfirm,
}: BillingRenewTermExplainDialogProps) {
  const sym = currencySymbol.trim() || "Rs.";
  const fmt = (n: number) => `${sym} ${n.toFixed(2)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Term: {preview.selectedTermLabel}</DialogTitle>
          <DialogDescription className="text-left text-sm leading-snug pt-1">
            You chose <strong className="text-foreground">{preview.selectedTermLabel}</strong> for{" "}
            <strong className="text-foreground">{preview.planName}</strong>.
            {daysLeftOnPlan != null && daysLeftOnPlan > 0 ? (
              <>
                {" "}
                Your current plan end date stays as it is (
                <strong className="text-foreground">{preview.currentExpiryLabel}</strong>
                ). After payment, about{" "}
                <strong className="tabular-nums text-foreground">{preview.termDays}</strong> day
                {preview.termDays === 1 ? "" : "s"} are added on top of that date.
              </>
            ) : (
              <>
                {" "}
                After payment, about <strong className="tabular-nums text-foreground">{preview.termDays}</strong> day
                {preview.termDays === 1 ? "" : "s"} are added from today.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[9rem]">Item</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-muted-foreground">Plan</TableCell>
                <TableCell className="font-medium">{preview.planName}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Current plan ends</TableCell>
                <TableCell className="text-sm leading-snug">{preview.currentExpiryLabel}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">You are buying</TableCell>
                <TableCell>
                  {preview.selectedTermLabel} (~{preview.termDays} day{preview.termDays === 1 ? "" : "s"})
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">New plan ends (after payment)</TableCell>
                <TableCell className="text-sm font-medium leading-snug">{preview.newExpiryLabel}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">You will be charged</TableCell>
                <TableCell className="tabular-nums text-base font-semibold">{fmt(preview.chargeNpr)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground leading-snug">
          This is the list price for the term you selected. Checkout may round slightly for Stripe / Khalti / eSewa.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" onClick={onConfirm}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

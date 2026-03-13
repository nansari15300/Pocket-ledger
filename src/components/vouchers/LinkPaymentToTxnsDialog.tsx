"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { RotateCcw, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Allocation } from "@/lib/payment-allocation-utils";
import {
  validateAllocations as validateAllocationsUtil,
  autoLink as autoLinkUtil,
  getAllocatedByVoucherId,
  getAllocatedByVoucherIdFromPaymentOuts,
  getOutstanding,
  getAllocationTotal,
  OPENING_BALANCE_VOUCHER_ID,
} from "@/lib/payment-allocation-utils";

const safeToDate = (date: unknown): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof (date as { toDate?: () => Date })?.toDate === "function")
    return (date as { toDate: () => Date }).toDate();
  const parsed = new Date(date as string | number);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export type LinkPaymentVariant = "payment_in" | "payment_out";

export interface LinkPaymentToTxnsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: LinkPaymentVariant;
  partyId: string | null;
  partyName: string;
  /** For payment_in: received amount; for payment_out: paid amount */
  receivedAmount: number;
  existingAllocations?: Allocation[];
  paymentInId?: string | null;
  paymentOutId?: string | null;
  /** When variant=payment_in: optionally link to Payment Out (same account). */
  accountId?: string | null;
  /** When variant=payment_in: show Payment In voucher details at top. */
  paymentInVoucherNumber?: string | null;
  paymentInDate?: unknown;
  /** When variant=payment_out: show Payment Out voucher details at top. */
  paymentOutVoucherNumber?: string | null;
  paymentOutDate?: unknown;
  /** Party opening balance, signed: Dr > 0 (show in Payment In), Cr < 0 (show in Payment Out). */
  partyOpeningBalance?: number;
  /** Called with allocations and the amount (received or paid). */
  onDone: (allocations: Allocation[], amount: number) => void;
}

export function LinkPaymentToTxnsDialog({
  isOpen,
  onOpenChange,
  variant = "payment_in",
  partyId,
  partyName,
  receivedAmount,
  existingAllocations = [],
  paymentInId,
  paymentOutId,
  accountId,
  paymentInVoucherNumber,
  paymentInDate,
  paymentOutVoucherNumber,
  paymentOutDate,
  partyOpeningBalance = 0,
  onDone,
}: LinkPaymentToTxnsDialogProps) {
  const { vouchers } = useVouchers();
  const { formatDate, formatDateBS, formatCurrency, dateSystem } = useDate();
  const isMobile = useIsMobile();
  const effectiveAccountId = accountId ?? null;
  const accountIdStr = effectiveAccountId ? String(effectiveAccountId) : "";


  const isOut = variant === "payment_out";

  // Total consumed from Opening Balance: (1) Payment In/Out allocations to OB + (2) Sale/Purchase openingBalanceAllocated (same party). So linkable = obAmount - this total.
  const totalConsumedFromOB = useMemo(() => {
    if (!partyId || !vouchers?.length) return 0;
    const partyIdStr = String(partyId);
    let fromPayments = 0;
    const payType = isOut ? ["payment_out", "direct_expense"] : ["payment_in", "direct_income"];
    (vouchers as any[]).forEach((v) => {
      if (!payType.includes(v.type) || String((v as any).partyId ?? "") !== partyIdStr) return;
      const allocs = (v.allocations as Allocation[] | undefined) || [];
      allocs.forEach((a) => {
        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) fromPayments += getAllocationTotal(a);
      });
    });
    const fromBillwise = (vouchers as any[]).reduce((sum, v) => {
      if (v.type !== "sale" && v.type !== "sale_service" && v.type !== "purchase" && v.type !== "purchase_service") return sum;
      if (String((v as any).partyId ?? "") !== partyIdStr) return sum;
      return sum + (Number((v as any).openingBalanceAllocated) || 0);
    }, 0);
    return fromPayments + fromBillwise;
  }, [partyId, isOut, vouchers]);

  const partyOB = Number(partyOpeningBalance) || 0;
  const showOBInPaymentIn = partyOB > 0;
  const showOBInPaymentOut = partyOB < 0;
  const obAmount = partyOB > 0 ? partyOB : Math.abs(partyOB);
  const obOutstandingIn = Math.max(0, obAmount - totalConsumedFromOB);
  const obOutstanding = isOut ? (showOBInPaymentOut ? obOutstandingIn : 0) : (showOBInPaymentIn ? obOutstandingIn : 0);

  // Payment In links to Sales (same party) and Payment Outs (contra). Show Opening Balance when OB is Dr (> 0).
  const combinedInList = useMemo(() => {
    if (variant !== "payment_in" || !vouchers?.length || !partyId) return [];
    const paymentInVouchers = (vouchers as any[]).filter(
      (v) => (v.type === "payment_in" || v.type === "direct_income") && (paymentInId == null || v.id !== paymentInId)
    );
    const allocatedByPaymentIns = getAllocatedByVoucherId(paymentInVouchers);
    const allocatedByPurchases = (() => {
      const m = new Map<string, number>();
      for (const v of vouchers as any[]) {
        if (v.type !== "purchase" && v.type !== "purchase_service") continue;
        const allocations = (v.allocations as Allocation[] | undefined) || [];
        for (const a of allocations) {
          if (!a.voucherId) continue;
          m.set(a.voucherId, (m.get(a.voucherId) ?? 0) + getAllocationTotal(a));
        }
      }
      return m;
    })();
    const totalAllocatedTo = (vid: string) => (allocatedByPaymentIns.get(vid) ?? 0) + (allocatedByPurchases.get(vid) ?? 0);
    const salesForParty = (vouchers as any[]).filter(
      (v) =>
        (v.type === "sale" || v.type === "sale_service") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const sales = salesForParty.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocated = totalAllocatedTo(v.id);
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        date: v.date,
        type: "Sale" as const,
        refNo: v.invoiceNumber ?? v.voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers: allocated,
      };
    });
    const hasExistingAlloc = (id: string) => existingAllocations.some((a) => a.voucherId === id && getAllocationTotal(a) > 0);
    const salesFiltered = sales.filter((s) => s.outstanding > 0 || hasExistingAlloc(s.id));
    const paymentOutsForParty = (vouchers as any[]).filter(
      (v) =>
        (v.type === "payment_out" || v.type === "direct_expense") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const paymentOuts = paymentOutsForParty.map((v) => {
      const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
      const allocated = totalAllocatedTo(v.id);
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        date: v.date,
        type: "Payment Out" as const,
        refNo: (v as any).voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers: allocated,
      };
    });
    const paymentOutsFiltered = paymentOuts.filter((p) => p.outstanding > 0 || hasExistingAlloc(p.id));
    const byDate = (a: { date: unknown }, b: { date: unknown }) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    };
    salesFiltered.sort(byDate);
    paymentOutsFiltered.sort(byDate);
    const ob = showOBInPaymentIn && (obOutstandingIn > 0 || hasExistingAlloc(OPENING_BALANCE_VOUCHER_ID)) ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      date: null,
      type: "Opening Balance" as const,
      refNo: "—",
      total: obAmount,
      outstanding: obOutstandingIn,
      allocatedToOthers: totalConsumedFromOB,
    }] : [];
    const combined = [...ob, ...salesFiltered, ...paymentOutsFiltered];
    combined.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
    return combined;
  }, [variant, effectiveAccountId, accountIdStr, partyId, paymentInId, vouchers, partyOB, showOBInPaymentIn, obOutstandingIn, totalConsumedFromOB, existingAllocations]);

  // Payment Out links to Purchases (same party) and Payment Ins (contra). Show Opening Balance when OB is Cr (< 0).
  const combinedOutList = useMemo(() => {
    if (variant !== "payment_out" || !vouchers?.length || !partyId) return [];
    const hasExistingAllocOut = (id: string) => existingAllocations.some((a) => a.voucherId === id && getAllocationTotal(a) > 0);
    const paymentOutVouchers = (vouchers as any[]).filter(
      (v) => (v.type === "payment_out" || v.type === "direct_expense") && (paymentOutId == null || v.id !== paymentOutId)
    );
    const allocatedByPaymentOuts = getAllocatedByVoucherIdFromPaymentOuts(paymentOutVouchers);
    const allocatedBySales = (() => {
      const m = new Map<string, number>();
      for (const v of vouchers as any[]) {
        if (v.type !== "sale" && v.type !== "sale_service") continue;
        const allocations = (v.allocations as Allocation[] | undefined) || [];
        for (const a of allocations) {
          if (!a.voucherId) continue;
          m.set(a.voucherId, (m.get(a.voucherId) ?? 0) + getAllocationTotal(a));
        }
      }
      return m;
    })();
    const totalAllocatedToOut = (vid: string) => (allocatedByPaymentOuts.get(vid) ?? 0) + (allocatedBySales.get(vid) ?? 0);
    const purchasesForParty = (vouchers as any[]).filter(
      (v) =>
        (v.type === "purchase" || v.type === "purchase_service") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const purchases = purchasesForParty.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocated = totalAllocatedToOut(v.id);
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        date: v.date,
        type: "Purchase" as const,
        refNo: (v as any).invoiceNumber ?? v.voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers: allocated,
      };
    });
    const purchasesFiltered = purchases.filter((p) => p.outstanding > 0 || hasExistingAllocOut(p.id));
    const paymentInsForParty = (vouchers as any[]).filter(
      (v) =>
        (v.type === "payment_in" || v.type === "direct_income") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const paymentIns = paymentInsForParty.map((v) => {
      const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
      const allocated = totalAllocatedToOut(v.id);
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        date: v.date,
        type: "Payment In" as const,
        refNo: (v as any).voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers: allocated,
      };
    });
    const paymentInsFiltered = paymentIns.filter((p) => p.outstanding > 0 || hasExistingAllocOut(p.id));
    const byDate = (a: { date: unknown }, b: { date: unknown }) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    };
    purchasesFiltered.sort(byDate);
    paymentInsFiltered.sort(byDate);
    const ob = showOBInPaymentOut && (obOutstandingIn > 0 || hasExistingAllocOut(OPENING_BALANCE_VOUCHER_ID)) ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      date: null,
      type: "Opening Balance" as const,
      refNo: "—",
      total: obAmount,
      outstanding: obOutstandingIn,
      allocatedToOthers: totalConsumedFromOB,
    }] : [];
    const combined = [...ob, ...purchasesFiltered, ...paymentInsFiltered];
    combined.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
    return combined;
  }, [variant, partyId, paymentOutId, vouchers, partyOB, showOBInPaymentOut, obOutstandingIn, totalConsumedFromOB, existingAllocations]);

  const targetList = isOut ? combinedOutList : combinedInList;

  const autoLink = useMemo(() => {
    const currentList = isOut ? combinedOutList : combinedInList;
    return (amount: number) => {
      const forAutoLink = currentList.map((r) => ({
        id: r.id,
        total: r.total,
        allocated: r.total - r.outstanding,
      }));
      return autoLinkUtil(amount, forAutoLink);
    };
  }, [isOut, combinedOutList, combinedInList]);

  const validate = useMemo(() => {
    const currentList = isOut ? combinedOutList : combinedInList;
    return (allocations: Allocation[], amount: number) => {
      const outstandingMap = new Map<string, number>();
      currentList.forEach((r) => outstandingMap.set(r.id, r.outstanding));
      return validateAllocationsUtil(allocations, amount, outstandingMap);
    };
  }, [isOut, combinedOutList, combinedInList]);
  const paymentInDateFormatted = useMemo(() => {
    if (!paymentInDate) return "—";
    const d = safeToDate(paymentInDate);
    if (!d) return "—";
    if (dateSystem === "Both") return `${formatDateBS(d)} (${formatDate(d)})`;
    return dateSystem === "BS" ? formatDateBS(d) : formatDate(d);
  }, [paymentInDate, dateSystem, formatDate, formatDateBS]);
  const paymentOutDateFormatted = useMemo(() => {
    if (!paymentOutDate) return "—";
    const d = safeToDate(paymentOutDate);
    if (!d) return "—";
    if (dateSystem === "Both") return `${formatDateBS(d)} (${formatDate(d)})`;
    return dateSystem === "BS" ? formatDateBS(d) : formatDate(d);
  }, [paymentOutDate, dateSystem, formatDate, formatDateBS]);

  const [received, setReceived] = useState(receivedAmount);
  const [linkedAmounts, setLinkedAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setReceived(receivedAmount);
  }, [receivedAmount, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, number> = {};
    for (const a of existingAllocations) {
      if (a.voucherId && typeof a.amount === "number") initial[a.voucherId] = a.amount;
    }
    setLinkedAmounts(initial);
  }, [isOpen, existingAllocations]);

  const totalLinked = useMemo(
    () => Object.values(linkedAmounts).reduce((s, n) => s + Number(n) || 0, 0),
    [linkedAmounts]
  );
  const remaining = Math.max(0, received - totalLinked);

  const handleAutoLink = () => {
    const allocations = autoLink(received);
    const next: Record<string, number> = {};
    for (const a of allocations) next[a.voucherId] = a.amount;
    setLinkedAmounts(next);
    toast.success(isOut ? "Amount allocated to outstanding purchases." : "Amount allocated to outstanding transactions.");
  };

  const handleReset = () => {
    setLinkedAmounts({});
    toast.info("Allocations cleared.");
  };

  const handleDone = () => {
    const allocations: Allocation[] = Object.entries(linkedAmounts)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([voucherId, amount]) => ({ voucherId, amount: Number(amount) }));
    const cap = Number(receivedAmount) || 0;
    if (totalLinked > cap) {
      toast.error("Total linked amount cannot exceed " + (isOut ? "paid" : "received") + " amount.");
      return;
    }
    const result = validate(allocations, cap);
    if (!result.valid) {
      toast.error(result.error ?? "Invalid allocations.");
      return;
    }
    onDone(allocations, cap);
    onOpenChange(false);
  };

  const setLinkedForVoucher = (voucherId: string, value: string, cap?: number) => {
    let num = parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
    if (cap != null && cap >= 0) num = Math.min(num, cap);
    setLinkedAmounts((prev) => {
      if (num === 0) {
        const { [voucherId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [voucherId]: num };
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-4xl max-h-[85vh] flex flex-col rounded-lg pt-3 px-[3px]",
          isMobile && "left-[2px] right-[2px] translate-x-0 w-auto max-w-none h-[85vh] max-h-[85vh] pt-2"
        )}
        hideCloseButton
      >
        <DialogHeader className="flex-shrink-0 space-y-0.5 text-center sm:text-center">
          {/* Code (1) = Link Payment In/Out to Txns popup — so user can say which popup when reporting */}
          <p className="text-xs text-muted-foreground leading-tight">Link for bill wise (1)</p>
          <DialogTitle className="text-xl leading-tight">
            {isOut ? "Link Payment Out to Txns" : "Link Payment In to Txns"}
          </DialogTitle>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm pt-1 hidden md:flex">
            <span className="text-muted-foreground">{isOut ? "Paid" : "Received"}: <strong className="text-foreground">{formatCurrency(received, { noSuffix: true })}</strong></span>
            <span className="text-muted-foreground">Total linked: <strong className="text-foreground">{formatCurrency(totalLinked, { noSuffix: true })}</strong></span>
            <span className="text-muted-foreground">Balance: <strong className="text-foreground">{formatCurrency(remaining, { noSuffix: true })}</strong></span>
          </div>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* To Voucher: payment details — same table style as LinkAdvances */}
          <p className="text-sm font-medium text-muted-foreground shrink-0 text-center">To Voucher</p>
          <div className="rounded-md border flex-shrink-0 overflow-x-auto">
            <table className="table-row-stripe-7 w-full text-sm border-collapse min-w-[400px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                  <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                  <th className="text-left p-2 font-medium whitespace-nowrap">To</th>
                  <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                  <th className="text-right p-2 font-medium whitespace-nowrap">Linked</th>
                  <th className="text-right p-2 font-medium whitespace-nowrap">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b last:border-b-0">
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{isOut ? paymentOutDateFormatted : paymentInDateFormatted}</td>
                  <td className="p-2 font-medium whitespace-nowrap">{isOut ? (paymentOutVoucherNumber || "—") : (paymentInVoucherNumber || "—")}</td>
                  <td className="p-2 whitespace-nowrap">{partyName || "—"}</td>
                  <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(received, { noSuffix: true })}</td>
                  <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(totalLinked, { noSuffix: true })}</td>
                  <td className="p-2 text-right font-medium whitespace-nowrap">{formatCurrency(remaining, { noSuffix: true })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm font-medium text-muted-foreground shrink-0 pt-1 text-center">From Voucher</p>
          <p className="text-sm text-muted-foreground shrink-0 -mt-0.5 hidden md:block text-center">
            {isOut ? "Cr transactions (same party) (only linkable or already selected)" : "Dr transactions (same party) (only linkable or already selected)"}
          </p>
          <div className="flex-1 min-h-0 border rounded-md overflow-auto scrollbar-slim-dim">
            {targetList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {isOut ? "No purchases or payment in for this party." : "No sales or payment out for this party."}
              </p>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <table className="table-row-stripe-7 w-full text-sm border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 w-10 whitespace-nowrap"></th>
                      <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                      <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                      <th className="text-left p-2 font-medium whitespace-nowrap">From</th>
                      <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                      <th className="text-right p-2 font-medium whitespace-nowrap">Other Linked</th>
                      <th className="text-right p-2 font-medium whitespace-nowrap">Current Link</th>
                      <th className="text-right p-2 font-medium whitespace-nowrap">Linkable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetList.map((row: any) => {
                      const d = safeToDate(row.date);
                      const linked = linkedAmounts[row.id] ?? 0;
                      const otherLinked = row.allocatedToOthers ?? 0;
                      const rowMax = row.outstanding ?? 0;
                      const maxAllowed = Math.min(rowMax, remaining + linked);
                      const cannotAddMore = remaining <= 0 && linked === 0;
                      const rowType = row.type === "Opening Balance" ? "Opening Balance" : (row.type ?? (isOut ? "Purchase" : "Sale")).toLowerCase();
                      const amountSuffix = isOut ? " Cr" : " Dr";
                      return (
                        <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="p-2 w-10 whitespace-nowrap align-middle">
                            <Checkbox
                              checked={linked > 0}
                              disabled={cannotAddMore}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const cap = maxAllowed > 0 ? maxAllowed : rowMax;
                                  const initial = cap > 0 ? (maxAllowed > 0 ? maxAllowed : Math.min(0.01, rowMax)) : 0;
                                  if (initial > 0) setLinkedForVoucher(row.id, String(initial), cap);
                                } else {
                                  setLinkedForVoucher(row.id, "0");
                                }
                              }}
                              title={cannotAddMore ? "Required amount already linked" : linked > 0 ? "Clear this row" : "Include this row"}
                            />
                          </td>
                          <td className="p-2 text-muted-foreground whitespace-nowrap align-middle">
                            {d ? (dateSystem === "AD" ? formatDate(d) : dateSystem === "BS" ? formatDateBS(d) : <span className="whitespace-nowrap">{formatDateBS(d)} ({formatDate(d)})</span>) : "—"}
                          </td>
                          <td className="p-2 font-medium whitespace-nowrap align-middle">{row.id === OPENING_BALANCE_VOUCHER_ID ? "—" : (row.refNo ?? "—")}</td>
                          <td className="p-2 whitespace-nowrap align-middle">{rowType}</td>
                          <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap align-middle tabular-nums">{formatCurrency(row.total ?? 0, { noSuffix: true })}{amountSuffix}</td>
                          <td className="p-2 text-right text-muted-foreground whitespace-nowrap align-middle tabular-nums">{formatCurrency(otherLinked, { noSuffix: true })}{amountSuffix}</td>
                          <td className="p-2 text-right text-muted-foreground whitespace-nowrap align-middle tabular-nums">{formatCurrency(linked, { noSuffix: true })}{amountSuffix}</td>
                          <td className="p-2 text-right font-medium whitespace-nowrap align-middle tabular-nums">{formatCurrency(Math.max(0, rowMax - linked), { noSuffix: true })}{amountSuffix}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 pt-2 border-t flex-wrap justify-between">
            <Button size="sm" onClick={() => onOpenChange(false)} className="h-9 rounded-full shrink-0 bg-orange-500 hover:bg-orange-600 text-white border-0">
              Cancel
            </Button>
            <div className="flex flex-row flex-wrap items-center gap-2 shrink-0">
              <Button type="button" size="sm" onClick={handleAutoLink} className="h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white border-0">
                <Link2 className="h-4 w-4 hidden md:inline-block md:mr-1.5" />
                Auto Link
              </Button>
              <Button type="button" size="sm" onClick={handleReset} className="h-9 rounded-full bg-violet-600 hover:bg-violet-700 text-white border-0">
                <RotateCcw className="h-4 w-4 hidden md:inline-block md:mr-1.5" />
                Reset
              </Button>
              <Button
                onClick={handleDone}
                disabled={totalLinked > (Number(receivedAmount) || 0)}
                className="h-9 rounded-full bg-green-600 hover:bg-green-700 text-white border-0"
              >
                DONE
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

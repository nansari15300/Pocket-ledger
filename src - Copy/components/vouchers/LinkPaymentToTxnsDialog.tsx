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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";
import { X, RotateCcw, HelpCircle, Link2 } from "lucide-react";
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
  const effectiveAccountId = accountId ?? null;
  const accountIdStr = effectiveAccountId ? String(effectiveAccountId) : "";


  const isOut = variant === "payment_out";

  // Total amount already allocated to opening balance by this party's payment vouchers (for outstanding OB row).
  const totalAllocatedToOB = useMemo(() => {
    if (!partyId || !vouchers?.length) return 0;
    const payType = isOut ? ["payment_out", "direct_expense"] : ["payment_in", "direct_income"];
    let sum = 0;
    (vouchers as any[]).forEach((v) => {
      if (!payType.includes(v.type) || String((v as any).partyId ?? "") !== String(partyId)) return;
      const allocs = (v.allocations as Allocation[] | undefined) || [];
      allocs.forEach((a) => {
        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) sum += getAllocationTotal(a);
      });
    });
    return sum;
  }, [partyId, isOut, vouchers]);

  const partyOB = Number(partyOpeningBalance) || 0;
  const showOBInPaymentIn = partyOB > 0;
  const showOBInPaymentOut = partyOB < 0;
  const obAmount = partyOB > 0 ? partyOB : Math.abs(partyOB);
  const obOutstandingIn = Math.max(0, obAmount - totalAllocatedToOB);
  const obOutstanding = isOut ? (showOBInPaymentOut ? obOutstandingIn : 0) : (showOBInPaymentIn ? obOutstandingIn : 0);

  // Payment In links only to Sales (same party). Show Opening Balance row only when OB is Dr (> 0).
  const combinedInList = useMemo(() => {
    if (variant !== "payment_in" || !vouchers?.length || !partyId) return [];
    const paymentInVouchers = (vouchers as any[]).filter(
      (v) => (v.type === "payment_in" || v.type === "direct_income") && (paymentInId == null || v.id !== paymentInId)
    );
    const allocatedToSales = getAllocatedByVoucherId(paymentInVouchers);
    const salesForParty = (vouchers as any[]).filter(
      (v) =>
        (v.type === "sale" || v.type === "sale_service") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const sales = salesForParty.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocated = allocatedToSales.get(v.id) ?? 0;
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        date: v.date,
        type: "Sale" as const,
        refNo: v.invoiceNumber ?? v.voucherNumber ?? "—",
        total,
        outstanding,
      };
    }).filter((s) => s.outstanding > 0);
    sales.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
    const ob = showOBInPaymentIn && obOutstandingIn > 0 ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      date: null,
      type: "Opening Balance" as const,
      refNo: "—",
      total: obAmount,
      outstanding: obOutstandingIn,
    }] : [];
    return [...ob, ...sales];
  }, [variant, effectiveAccountId, accountIdStr, partyId, paymentInId, vouchers, partyOB, showOBInPaymentIn, obOutstandingIn]);

  // Payment Out links only to Purchases (same party). Show Opening Balance row only when OB is Cr (< 0).
  const combinedOutList = useMemo(() => {
    if (variant !== "payment_out" || !vouchers?.length || !partyId) return [];
    const paymentOutVouchers = (vouchers as any[]).filter(
      (v) => (v.type === "payment_out" || v.type === "direct_expense") && (paymentOutId == null || v.id !== paymentOutId)
    );
    const allocatedToPurchases = getAllocatedByVoucherIdFromPaymentOuts(paymentOutVouchers);
    const purchasesForParty = (vouchers as any[]).filter(
      (v) =>
        (v.type === "purchase" || v.type === "purchase_service") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const purchases = purchasesForParty.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocated = allocatedToPurchases.get(v.id) ?? 0;
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        date: v.date,
        type: "Purchase" as const,
        refNo: (v as any).invoiceNumber ?? v.voucherNumber ?? "—",
        total,
        outstanding,
      };
    }).filter((p) => p.outstanding > 0);
    purchases.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
    const ob = showOBInPaymentOut && obOutstandingIn > 0 ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      date: null,
      type: "Opening Balance" as const,
      refNo: "—",
      total: obAmount,
      outstanding: obOutstandingIn,
    }] : [];
    return [...ob, ...purchases];
  }, [variant, partyId, paymentOutId, vouchers, partyOB, showOBInPaymentOut, obOutstandingIn]);

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

  const setLinkedForVoucher = (voucherId: string, value: string) => {
    const num = parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" hideCloseButton>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl">
              {isOut ? "Link Payment Out to Txns" : "Link Payment In to Txns"}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Payment In/Out details at top: header above value, full width */}
          <div className="rounded-md border flex-shrink-0 p-4 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Party</span>
                <span className="text-sm font-medium">{partyName || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Date</span>
                <span className="text-sm">{isOut ? paymentOutDateFormatted : paymentInDateFormatted}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Voucher No.</span>
                <span className="text-sm">{isOut ? (paymentOutVoucherNumber || "—") : (paymentInVoucherNumber || "—")}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <div className="min-w-0" />
                  <span className="text-sm font-medium text-muted-foreground w-[100px] text-right pr-4">{isOut ? "Paid" : "Received"}</span>
                  <div className="min-w-0" />
                  <div className="w-[100px] flex justify-end">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={received || ""}
                      readOnly
                      className="h-7 w-[100px] text-sm text-right tabular-nums px-2 bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                  <span className="whitespace-nowrap min-w-0">Total linked:</span>
                  <span className="tabular-nums font-medium text-foreground text-right w-[100px]">{formatCurrency(totalLinked, { noSuffix: true })}</span>
                  {received > 0 && (
                    <>
                      <span className="whitespace-nowrap min-w-0">Balance:</span>
                      <span className="tabular-nums font-medium text-foreground text-right w-[100px]">{formatCurrency(remaining, { noSuffix: true })}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={handleAutoLink}>
                <Link2 className="h-4 w-4 mr-2" />
                AUTO LINK
              </Button>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5" />
                {isOut ? "Allocate paid amount to purchases & payment ins (oldest first)." : "Allocate received amount to sales & payment outs (oldest first)."}
              </span>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              RESET
            </Button>
          </div>

          <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
            <p className="text-sm font-medium mb-2">{isOut ? "Purchases (same party)" : "Sales (same party)"}</p>
            <ScrollArea className="h-full w-full">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className={cn(dateSystem === "Both" ? "w-[180px]" : "w-[100px]")}>Date</TableHead>
                    <TableHead className="w-[90px]">Type</TableHead>
                    <TableHead className="min-w-0">Ref/Inv No.</TableHead>
                    <TableHead className="text-right w-[110px]">Total</TableHead>
                    <TableHead className="text-right w-[120px]">Linked Amount</TableHead>
                    <TableHead className="text-right w-[110px]">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targetList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {isOut ? "No purchases for this party." : "No sales for this party."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    targetList.map((row: any) => {
                      const d = safeToDate(row.date);
                      const linked = linkedAmounts[row.id] ?? 0;
                      const balanceAfterLink = Math.max(0, (row.outstanding ?? 0) - linked);
                      const rowType = row.type ?? (isOut ? "Purchase" : "Sale");
                      const rowRefNo = row.refNo ?? row.invoiceNumber ?? row.voucherNumber ?? "—";
                      const isOBRow = row.id === OPENING_BALANCE_VOUCHER_ID;
                      const obLinkedStatus = isOBRow && linked > 0 ? formatCurrency(linked, { noSuffix: true }) : null;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className={cn("align-middle", dateSystem === "Both" ? "w-[180px]" : "w-[100px]")}>
                            {d ? (
                              dateSystem === "AD" ? formatDate(d) :
                              dateSystem === "BS" ? formatDateBS(d) :
                              <span className="whitespace-nowrap">{formatDateBS(d)} ({formatDate(d)})</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="align-middle w-[90px]">{rowType}</TableCell>
                          <TableCell className="align-middle min-w-0 truncate">
                            {rowRefNo}
                            {obLinkedStatus != null && (
                              <span className="block text-xs text-muted-foreground mt-0.5">Linked: {obLinkedStatus}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-middle w-[110px] tabular-nums">
                            {formatCurrency(row.total, { noSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right align-middle w-[120px] p-2">
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                min={0}
                                max={row.outstanding}
                                step={0.01}
                                value={linked > 0 ? linked : ""}
                                onChange={(e) => setLinkedForVoucher(row.id, e.target.value)}
                                placeholder="0"
                                className="h-8 w-full min-w-0 text-right tabular-nums"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setLinkedForVoucher(row.id, "0")}
                                title="Reset this row"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-middle w-[110px] font-medium tabular-nums">
                            {formatCurrency(balanceAfterLink, { noSuffix: true })}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          <div className="flex flex-shrink-0 items-center justify-between gap-4 pt-2 border-t">
            <p className="text-xs text-muted-foreground max-w-md">
              Link and unlink are saved when you click Done. You do not need to click Save in the voucher dialog.
            </p>
            <div className="flex items-center gap-4 shrink-0">
              {totalLinked > (Number(receivedAmount) || 0) && (
                <span className="text-sm text-destructive font-medium">
                  Total linked exceeds {isOut ? "paid" : "received"} amount. Reduce linked amounts.
                </span>
              )}
              <Button
                onClick={handleDone}
                disabled={totalLinked > (Number(receivedAmount) || 0)}
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

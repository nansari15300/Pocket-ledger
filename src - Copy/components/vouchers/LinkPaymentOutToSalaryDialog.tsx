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
import { getTaxNetAllocatedByVoucherIdFromPaymentOuts, getAllocationTotal, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";
import type { Allocation } from "@/lib/payment-allocation-utils";
import { Link2, Zap, X, RotateCcw, HelpCircle } from "lucide-react";
import { toast } from "sonner";

function getAddSalaryNetTotal(v: any): number {
  if (!Array.isArray(v.entries) || v.entries.length === 0) return Number(v.total ?? v.amount ?? 0) || 0;
  return v.entries
    .filter((e: any) => (Number(e.credit) || 0) > 0 && !String(e.narration || "").includes("(Staff ID:"))
    .reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);
}

export interface LinkPaymentOutToSalaryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string | null;
  staffName: string;
  paymentOutId: string | null;
  amountPaid: number;
  existingAllocations: Allocation[];
  /** Staff opening balance, signed: Dr > 0 (we owe them), Cr < 0 (they have money with us). Show OB when Dr or Cr so payment out can reduce either. */
  staffOpeningBalance?: number;
  onDone: (allocations: Allocation[]) => void;
}

export function LinkPaymentOutToSalaryDialog({
  isOpen,
  onOpenChange,
  staffId,
  staffName,
  paymentOutId,
  amountPaid,
  existingAllocations,
  staffOpeningBalance = 0,
  onDone,
}: LinkPaymentOutToSalaryDialogProps) {
  const { vouchers } = useVouchers();
  const { formatDate, formatDateBS, formatCurrency, dateSystem } = useDate();
  const [linkedAmounts, setLinkedAmounts] = useState<Record<string, number>>({});

  const totalAllocatedToOB = useMemo(() => {
    if (!staffId || !vouchers?.length) return 0;
    let sum = 0;
    (vouchers as any[]).forEach((v) => {
      if ((v.type !== "payment_out" && v.type !== "direct_expense") || v.staffId !== staffId) return;
      const allocs = (v.allocations as Allocation[] | undefined) || [];
      allocs.forEach((a) => {
        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) sum += getAllocationTotal(a);
      });
    });
    return sum;
  }, [staffId, vouchers]);

  const staffOB = Number(staffOpeningBalance) || 0;
  const showOBRow = staffOB !== 0;
  const obAmount = Math.abs(staffOB);
  const obOutstanding = Math.max(0, obAmount - totalAllocatedToOB);
  const obIsDr = staffOB > 0;

  const salaryVouchersWithOutstanding = useMemo(() => {
    if (!staffId || !vouchers?.length) return [];
    const addSalaryVouchers = vouchers.filter(
      (v: any) => v.type === "journal" && v.subType === "add_salary" && Array.isArray(v.entries) && v.entries.some((e: any) => e.accountId === staffId && (Number(e.credit) || 0) > 0)
    );
    const otherPaymentOuts = vouchers.filter(
      (v: any) => (v.type === "payment_out" || v.type === "direct_expense") && (paymentOutId == null || v.id !== paymentOutId)
    );
    const allocatedMap = getTaxNetAllocatedByVoucherIdFromPaymentOuts(otherPaymentOuts);
    const list = addSalaryVouchers
      .map((v: any) => {
        const netTotal = getAddSalaryNetTotal(v);
        const allocated = allocatedMap.get(v.id)?.net ?? 0;
        const outstanding = Math.max(0, netTotal - allocated);
        return {
          id: v.id,
          voucherNumber: v.voucherNumber ?? "—",
          date: v.date,
          netTotal,
          allocated,
          outstanding,
        };
      })
      .filter((r: any) => r.outstanding > 0)
      .sort((a: any, b: any) => {
        const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
        const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
        return dA - dB;
      });
    const obRow = showOBRow && obOutstanding > 0 ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      voucherNumber: "—",
      date: null,
      netTotal: obAmount,
      allocated: totalAllocatedToOB,
      outstanding: obOutstanding,
      isDr: obIsDr,
    }] : [];
    return [...obRow, ...list];
  }, [staffId, vouchers, paymentOutId, staffOB, showOBRow, obOutstanding, obAmount, obIsDr, totalAllocatedToOB]);

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, number> = {};
    for (const a of existingAllocations) {
      if (a.voucherId && (Number(a.amount) || Number((a as any).netAmount) || 0) > 0) {
        initial[a.voucherId] = Number((a as any).netAmount) || Number(a.amount) || 0;
      }
    }
    setLinkedAmounts(initial);
  }, [isOpen, existingAllocations]);

  const totalLinked = useMemo(
    () => Object.values(linkedAmounts).reduce((s, a) => s + Number(a || 0), 0),
    [linkedAmounts]
  );
  const remaining = Math.max(0, amountPaid - totalLinked);

  const handleAutoLink = () => {
    let toAllocate = remaining;
    const next = { ...linkedAmounts };
    for (const row of salaryVouchersWithOutstanding) {
      if (toAllocate <= 0) break;
      const alloc = Math.min(row.outstanding, toAllocate);
      if (alloc > 0) {
        next[row.id] = (next[row.id] ?? 0) + alloc;
        toAllocate -= alloc;
      }
    }
    setLinkedAmounts(next);
    toast.success("Auto link amounts filled. Review and DONE.");
  };

  const handleReset = () => {
    setLinkedAmounts({});
    toast.info("Allocations cleared.");
  };

  const handleDone = () => {
    const allocations: Allocation[] = Object.entries(linkedAmounts)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([voucherId, amount]) => ({ voucherId, amount: Number(amount), netAmount: Number(amount) }));
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    if (total > amountPaid) {
      toast.error("Total linked cannot exceed amount paid.");
      return;
    }
    for (const row of salaryVouchersWithOutstanding) {
      const amt = Number(linkedAmounts[row.id] ?? 0);
      if (amt > row.outstanding) {
        toast.error(`Link amount for ${row.voucherNumber} cannot exceed outstanding (${formatCurrency(row.outstanding, { noSuffix: true })}).`);
        return;
      }
    }
    onDone(allocations);
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

  const safeToDate = (date: unknown): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (typeof (date as { toDate?: () => Date })?.toDate === "function") return (date as { toDate: () => Date }).toDate();
    const parsed = new Date(date as string | number);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" hideCloseButton>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link to Salary
            </DialogTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Top card: same layout as Payment Out Link to Txns */}
          <div className="rounded-md border flex-shrink-0 p-4 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Staff</span>
                <span className="text-sm font-medium">{staffName || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Amount paid</span>
                <span className="text-sm font-medium tabular-nums">{formatCurrency(amountPaid, { noSuffix: true })}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Total linked</span>
                <span className="text-sm tabular-nums">{formatCurrency(totalLinked, { noSuffix: true })}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Balance</span>
                <span className="text-sm font-medium tabular-nums">{formatCurrency(remaining, { noSuffix: true })}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={handleAutoLink}
              disabled={remaining <= 0 || salaryVouchersWithOutstanding.length === 0}
            >
              <Link2 className="h-4 w-4 mr-2" />
              AUTO LINK
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              RESET
            </Button>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5" />
              Allocate this payment to Add Salary vouchers (oldest first).
            </span>
          </div>
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
            <p className="text-sm font-medium mb-2">Add Salary (same staff)</p>
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
                  {salaryVouchersWithOutstanding.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No outstanding Add Salary vouchers for this staff.
                      </TableCell>
                    </TableRow>
                  ) : (
                    salaryVouchersWithOutstanding.map((row: any) => {
                      const d = safeToDate(row.date);
                      const linked = linkedAmounts[row.id] ?? 0;
                      const balanceAfterLink = Math.max(0, row.outstanding - linked);
                      const dateStr = d
                        ? dateSystem === "AD"
                          ? formatDate(d)
                          : dateSystem === "BS"
                            ? formatDateBS(d)
                            : `${formatDateBS(d)} (${formatDate(d)})`
                        : "—";
                      return (
                        <TableRow key={row.id}>
                          <TableCell className={cn("align-middle", dateSystem === "Both" ? "w-[180px]" : "w-[100px]")}>
                            {dateStr}
                          </TableCell>
                          <TableCell className="align-middle w-[90px]">{row.id === OPENING_BALANCE_VOUCHER_ID ? "Opening Balance" : "Add Salary"}</TableCell>
                          <TableCell className="align-middle min-w-0 truncate">
                            {row.id === OPENING_BALANCE_VOUCHER_ID ? "—" : (row.voucherNumber ?? "—")}
                            {row.id === OPENING_BALANCE_VOUCHER_ID && linked > 0 && (
                              <span className="block text-xs text-muted-foreground mt-0.5">Linked: {formatCurrency(linked, { noSuffix: true })}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-middle w-[110px] tabular-nums">
                            {row.id === OPENING_BALANCE_VOUCHER_ID ? (
                              <span className={row.isDr ? "text-green-600" : "text-red-600"}>
                                {formatCurrency(row.netTotal ?? row.outstanding, { noSuffix: true })} {row.isDr ? "Dr" : "Cr"}
                              </span>
                            ) : (
                              formatCurrency(row.netTotal ?? row.outstanding, { noSuffix: true })
                            )}
                          </TableCell>
                          <TableCell className="text-right align-middle w-[120px] p-2">
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                min={0}
                                max={Math.max(row.outstanding, linked)}
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
                            {row.id === OPENING_BALANCE_VOUCHER_ID ? (
                              <span className={row.isDr ? "text-green-600" : "text-red-600"}>
                                {formatCurrency(balanceAfterLink, { noSuffix: true })} {row.isDr ? "Dr" : "Cr"}
                              </span>
                            ) : (
                              formatCurrency(balanceAfterLink, { noSuffix: true })
                            )}
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
          <div className="flex flex-shrink-0 items-center justify-end gap-4 pt-2 border-t">
            {totalLinked > amountPaid && (
              <span className="text-sm text-destructive font-medium">
                Total linked exceeds amount paid. Reduce linked amounts.
              </span>
            )}
            <Button onClick={handleDone} disabled={totalLinked > amountPaid}>
              DONE
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

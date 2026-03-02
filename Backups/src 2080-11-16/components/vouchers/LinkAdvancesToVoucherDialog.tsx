"use client";

import * as React from "react";
import { useState, useEffect } from "react";
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
import { useAdvancesForSale, useAdvancesForPurchase } from "@/hooks/useAdvancesForVoucher";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { X, Link2, RotateCcw, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import type { Allocation } from "@/lib/payment-allocation-utils";
import { getTaxFromAllocation, getNetFromAllocation, getAllocationTotal, autoLink as autoLinkUtil, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";

const safeToDate = (date: unknown): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof (date as { toDate?: () => Date })?.toDate === "function")
    return (date as { toDate: () => Date }).toDate();
  const parsed = new Date(date as string | number);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export type LinkAdvancesMode = "sale" | "purchase";

export interface LinkAdvancesToVoucherDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LinkAdvancesMode;
  /** The sale or purchase voucher we're linking advances TO */
  targetVoucherId: string;
  targetPartyId: string;
  targetPartyName: string;
  targetLabel?: string;
  /** When set: 'tax'|'net' = link to that portion; 'all' = link to combined (tax+net) for sale/purchase. Default 'net'. */
  balanceKind?: "tax" | "net" | "all";
  /** When balanceKind is set, pass outstanding for that kind (total tax/net - linked for that kind). */
  targetOutstandingOverride?: number;
  /** Party opening balance (for "Opening Balance" linkable row). When > 0, row is shown. */
  partyOpeningBalance?: number;
  /** Called after successfully updating voucher(s) */
  onDone?: () => void;
}

export function LinkAdvancesToVoucherDialog({
  isOpen,
  onOpenChange,
  mode,
  targetVoucherId,
  targetPartyId,
  targetPartyName,
  targetLabel,
  balanceKind = "net",
  targetOutstandingOverride,
  partyOpeningBalance = 0,
  onDone,
}: LinkAdvancesToVoucherDialogProps) {
  const { companyId } = useCompany();
  const { vouchers } = useVouchers();
  const { formatDate, formatDateBS, formatCurrency, dateSystem } = useDate();

  const { paymentInsWithRemaining, saleOutstanding } = useAdvancesForSale(
    mode === "sale" ? targetPartyId : null,
    mode === "sale" ? targetVoucherId : null,
    vouchers
  );
  const { paymentOutsWithRemaining, purchaseOutstanding } = useAdvancesForPurchase(
    mode === "purchase" ? targetPartyId : null,
    mode === "purchase" ? targetVoucherId : null,
    vouchers
  );

  const baseSourceList = mode === "sale" ? paymentInsWithRemaining : paymentOutsWithRemaining;

  const partyOB = Number(partyOpeningBalance) || 0;
  const showOBInSale = partyOB < 0;
  const showOBInPurchase = partyOB > 0;
  const obAmount = Math.abs(partyOB);
  const totalConsumedFromOB = (vouchers as any[]).reduce((sum, v) => {
    if (v.type !== "sale" && v.type !== "sale_service" && v.type !== "purchase" && v.type !== "purchase_service") return sum;
    if (String((v as any).partyId ?? "") !== String(targetPartyId)) return sum;
    return sum + (Number((v as any).openingBalanceAllocated) || 0);
  }, 0);
  const obOutstanding = Math.max(0, obAmount - totalConsumedFromOB);
  const targetVoucher = (vouchers as any[]).find((v) => v.id === targetVoucherId);
  const obAllocatedToTarget = Number(targetVoucher?.openingBalanceAllocated) || 0;
  const showOBRow = (mode === "sale" && showOBInSale) || (mode === "purchase" && showOBInPurchase);
  const obRow = showOBRow && obAmount > 0 && (obOutstanding > 0 || obAllocatedToTarget > 0) ? [{
    id: OPENING_BALANCE_VOUCHER_ID,
    amount: obAmount,
    allocatedTotal: totalConsumedFromOB,
    remaining: obOutstanding,
    date: null,
    voucherNumber: "Opening Balance",
    type: "opening_balance",
  }] : [];
  const sourceList = [...obRow, ...baseSourceList];

  const targetOutstanding = targetOutstandingOverride ?? (mode === "sale" ? saleOutstanding : purchaseOutstanding);

  const [linkedAmounts, setLinkedAmounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Reset when dialog closes
  useEffect(() => {
    if (!isOpen) setLinkedAmounts({});
  }, [isOpen]);

  // Load existing allocations when dialog opens so edit mode shows current links
  useEffect(() => {
    if (!isOpen || !targetVoucherId || !vouchers?.length) return;
    const initial: Record<string, number> = {};
    const targetVoucher = (vouchers as any[]).find((v) => v.id === targetVoucherId);
    const obAllocated = Number(targetVoucher?.openingBalanceAllocated) || 0;
    if (obAllocated > 0) initial[OPENING_BALANCE_VOUCHER_ID] = obAllocated;
    if (mode === "sale") {
      vouchers
        .filter((v) => (v.type === "payment_in" || v.type === "direct_income") && v.partyId === targetPartyId)
        .forEach((v) => {
          const allocations = (v.allocations as Allocation[] | undefined) || [];
          const entry = allocations.find((a) => a.voucherId === targetVoucherId);
          if (!entry) return;
          const amt = balanceKind === "all" ? getAllocationTotal(entry) : balanceKind === "tax" ? getTaxFromAllocation(entry) : getNetFromAllocation(entry);
          if (amt > 0) initial[v.id] = amt;
        });
    } else {
      vouchers
        .filter((v) => (v.type === "payment_out" || v.type === "direct_expense") && v.partyId === targetPartyId)
        .forEach((v) => {
          const allocations = (v.allocations as Allocation[] | undefined) || [];
          const entry = allocations.find((a) => a.voucherId === targetVoucherId);
          if (!entry) return;
          const amt = balanceKind === "all" ? getAllocationTotal(entry) : balanceKind === "tax" ? getTaxFromAllocation(entry) : getNetFromAllocation(entry);
          if (amt > 0) initial[v.id] = amt;
        });
    }
    setLinkedAmounts(initial);
  }, [isOpen, targetVoucherId, targetPartyId, mode, vouchers, balanceKind]);

  const totalLinked = Object.values(linkedAmounts).reduce((s, n) => s + Number(n) || 0, 0);
  const valid = totalLinked <= targetOutstanding && totalLinked >= 0;

  const setLinkedFor = (sourceId: string, value: string) => {
    const num = parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
    setLinkedAmounts((prev) => {
      if (num === 0) {
        const { [sourceId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [sourceId]: num };
    });
  };

  const handleAutoLink = () => {
    const forAutoLink = sourceList.map((r) => ({
      id: r.id,
      total: r.amount,
      allocated: r.amount - r.remaining,
    }));
    const allocations = autoLinkUtil(targetOutstanding, forAutoLink);
    const next: Record<string, number> = {};
    for (const a of allocations) next[a.voucherId] = a.amount;
    setLinkedAmounts(next);
    toast.success(mode === "sale" ? "Amount allocated to payment ins (oldest first)." : "Amount allocated to payment outs (oldest first).");
  };

  const handleReset = () => {
    setLinkedAmounts({});
    toast.info("Allocations cleared.");
  };

  const handleSave = async () => {
    if (!companyId || !valid) return;
    const updates = Object.entries(linkedAmounts).filter(([, amt]) => Number(amt) > 0);
    const voucherPath = `companies/${companyId}/vouchers`;

    // Source voucher IDs that currently have an allocation to this target (from loaded vouchers) – exclude opening_balance
    const sourceVoucherIds =
      mode === "sale"
        ? vouchers
            .filter((v) => (v.type === "payment_in" || v.type === "direct_income") && v.partyId === targetPartyId)
            .filter((v) => ((v.allocations as Allocation[] | undefined) || []).some((a) => a.voucherId === targetVoucherId))
            .map((v) => v.id)
        : vouchers
            .filter((v) => (v.type === "payment_out" || v.type === "direct_expense") && v.partyId === targetPartyId)
            .filter((v) => ((v.allocations as Allocation[] | undefined) || []).some((a) => a.voucherId === targetVoucherId))
            .map((v) => v.id);

    const toRemove = sourceVoucherIds.filter((id) => !(Number(linkedAmounts[id]) > 0));
    const obAmountToSave = Number(linkedAmounts[OPENING_BALANCE_VOUCHER_ID]) || 0;
    if (updates.length === 0 && toRemove.length === 0 && !showOBRow) {
      toast.info("No amount to link.");
      return;
    }
    setSaving(true);
    try {
      // Always persist opening balance allocation when user entered an amount (target is sale/purchase)
      if (showOBRow || obAmountToSave > 0) {
        const targetRef = doc(firestore, voucherPath, targetVoucherId);
        await updateDoc(targetRef, { openingBalanceAllocated: obAmountToSave });
      }
      for (const sourceVoucherId of toRemove) {
        const ref = doc(firestore, voucherPath, sourceVoucherId);
        const snap = await getDoc(ref);
        if (!snap.exists()) continue;
        const data = snap.data();
        const allocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
        const filtered = allocations.filter((a) => a.voucherId !== targetVoucherId);
        await updateDoc(ref, { allocations: filtered });
      }
      for (const [sourceVoucherId, amount] of updates) {
        if (sourceVoucherId === OPENING_BALANCE_VOUCHER_ID) continue;
        const ref = doc(firestore, voucherPath, sourceVoucherId);
        const snap = await getDoc(ref);
        if (!snap.exists()) continue;
        const data = snap.data();
        const allocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
        const idx = allocations.findIndex((a) => a.voucherId === targetVoucherId);
        const existing = idx >= 0 ? allocations[idx] : null;
        const addAmt = Number(amount);
        const prevTax = existing ? getTaxFromAllocation(existing) : 0;
        const prevNet = existing ? getNetFromAllocation(existing) : 0;
        const newTax = balanceKind === "tax" ? prevTax + addAmt : prevTax;
        const newNet = balanceKind === "net" || balanceKind === "all" ? prevNet + addAmt : prevNet;
        const newEntry: Allocation = { voucherId: targetVoucherId, amount: newTax + newNet, taxAmount: newTax, netAmount: newNet };
        if (idx >= 0) allocations[idx] = newEntry;
        else allocations.push(newEntry);
        await updateDoc(ref, { allocations });
      }
      toast.success("Advances linked successfully.");
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to link advances.");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "sale" ? "Link advances to this sale" : "Link advances to this purchase";
  const subLabel = targetLabel || (mode === "sale" ? "Sale" : "Purchase");
  const remainingToLink = Math.max(0, targetOutstanding - totalLinked);
  const sectionTitle = mode === "sale" ? "Payment ins (same party)" : "Payment outs (same party)";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" hideCloseButton>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Top card: same layout as Link Payment Out to Txns */}
          <div className="rounded-md border flex-shrink-0 p-4 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Party</span>
                <span className="text-sm font-medium">{targetPartyName || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">{mode === "sale" ? "Sale" : "Purchase"}</span>
                <span className="text-sm">{subLabel || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Outstanding</span>
                <span className="text-sm font-medium tabular-nums">{formatCurrency(targetOutstanding, { noSuffix: true })}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <div className="min-w-0" />
                  <span className="text-sm font-medium text-muted-foreground w-[100px] text-right pr-4">Total linked</span>
                  <div className="min-w-0" />
                  <span className="tabular-nums font-medium text-foreground text-right w-[100px]">{formatCurrency(totalLinked, { noSuffix: true })}</span>
                  <span className="whitespace-nowrap min-w-0">Balance</span>
                  <span className="tabular-nums font-medium text-foreground text-right w-[100px]">{formatCurrency(remainingToLink, { noSuffix: true })}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <Button type="button" size="sm" onClick={handleAutoLink} disabled={targetOutstanding <= 0 || sourceList.length === 0}>
              <Link2 className="h-4 w-4 mr-2" />
              AUTO LINK
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              RESET
            </Button>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5" />
              {mode === "sale"
                ? "Allocate outstanding to payment ins (oldest first)."
                : "Allocate outstanding to payment outs (oldest first)."}
            </span>
          </div>

          <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
            <p className="text-sm font-medium mb-2">{sectionTitle}</p>
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
                  {sourceList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No advances (same party) to link.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sourceList.map((row) => {
                      const d = safeToDate(row.date);
                      const linked = linkedAmounts[row.id] ?? 0;
                      const balanceAfterLink = Math.max(0, row.remaining - linked);
                      const rowType = row.id === OPENING_BALANCE_VOUCHER_ID || row.type === "opening_balance" ? "Opening Balance" : row.type === "payment_in" || row.type === "direct_income" ? "payment in" : row.type === "payment_out" || row.type === "direct_expense" ? "payment out" : row.type;
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
                            {isOBRow ? "—" : (row.voucherNumber ?? "—")}
                            {obLinkedStatus != null && (
                              <span className="block text-xs text-muted-foreground mt-2 min-h-[8px]">Linked: {obLinkedStatus}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right align-middle w-[110px] tabular-nums">
                            {formatCurrency(row.amount, { noSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right align-middle w-[120px] p-2">
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                min={0}
                                max={row.id === OPENING_BALANCE_VOUCHER_ID ? row.amount : row.remaining}
                                step={0.01}
                                value={linked > 0 ? linked : ""}
                                onChange={(e) => setLinkedFor(row.id, e.target.value)}
                                placeholder="0"
                                className="h-8 w-full min-w-0 text-right tabular-nums"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setLinkedFor(row.id, "0")}
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
            <span className="text-sm text-muted-foreground">
              Total linked: <strong>{formatCurrency(totalLinked, { noSuffix: true })}</strong>
              {targetOutstanding > 0 && (
                <> · Must be ≤ {formatCurrency(targetOutstanding, { noSuffix: true })}</>
              )}
            </span>
            <Button onClick={handleSave} disabled={!valid || saving}>
              {saving ? "Saving..." : "DONE"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

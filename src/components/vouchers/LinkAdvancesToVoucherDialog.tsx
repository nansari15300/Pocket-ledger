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
import { useVouchers } from "@/hooks/useVouchers";
import { useAdvancesForSale, useAdvancesForPurchase } from "@/hooks/useAdvancesForVoucher";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Link2, RotateCcw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Checkbox } from "@/components/ui/checkbox";
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

/** Params for applying bill-wise allocations to server (used by voucher form on Save when saveMode is 'local'). */
export type ApplyAdvancesAllocationsParams = {
  companyId: string;
  mode: LinkAdvancesMode;
  targetVoucherId: string;
  targetPartyId: string;
  balanceKind?: "tax" | "net" | "all";
  linkedAmounts: Record<string, number>;
  vouchers: any[];
  showOBRow: boolean;
};

/** Persist bill-wise link allocations to Firestore. Call from voucher form after saving the voucher when using local-only link dialog. */
export async function applyAdvancesAllocationsToServer(params: ApplyAdvancesAllocationsParams): Promise<void> {
  const { companyId, mode, targetVoucherId, targetPartyId, balanceKind = "net", linkedAmounts, vouchers, showOBRow } = params;
  const voucherPath = `companies/${companyId}/vouchers`;
  const updates = Object.entries(linkedAmounts).filter(([, amt]) => Number(amt) > 0);
  const obAmountToSave = Number(linkedAmounts[OPENING_BALANCE_VOUCHER_ID]) || 0;

  // Fetch target voucher from Firestore so we derive toRemove from its allocations (Sale↔Purchase: opposite voucher may be missing from vouchers array)
  const targetRef = doc(firestore, voucherPath, targetVoucherId);
  const targetSnap = await getDoc(targetRef);
  const targetAllocations: Allocation[] = targetSnap.exists()
    ? (Array.isArray(targetSnap.data()?.allocations) ? [...targetSnap.data()!.allocations] : [])
    : [];
  const toRemoveFromTarget = targetAllocations.filter((a) => a.voucherId && !(Number(linkedAmounts[a.voucherId]) > 0)).map((a) => a.voucherId);
  const toRemove = toRemoveFromTarget.length > 0 ? toRemoveFromTarget : (() => {
    const crTypes = ["payment_in", "direct_income", "purchase", "purchase_service"];
    const drTypes = ["payment_out", "direct_expense", "sale", "sale_service"];
    const sourceTypes = mode === "sale" ? crTypes : drTypes;
    return (vouchers as any[])
      .filter((v) => sourceTypes.includes(v.type) && String((v as any).partyId ?? "") === String(targetPartyId))
      .filter((v) => ((v.allocations as Allocation[] | undefined) || []).some((a) => a.voucherId === targetVoucherId))
      .filter((v) => !(Number(linkedAmounts[v.id]) > 0))
      .map((v) => v.id);
  })();

  if (updates.length === 0 && toRemove.length === 0 && !showOBRow) return;
  if (showOBRow || obAmountToSave > 0) {
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
  // Bilateral unlink: remove from target voucher’s allocations so opposite voucher (Sale/Pur) shows unlinked after Save
  if (toRemove.length > 0 && targetSnap.exists()) {
    const targetData = targetSnap.data();
    const currentTargetAllocations: Allocation[] = Array.isArray(targetData?.allocations) ? [...targetData.allocations] : [];
    const toRemoveSet = new Set(toRemove);
    const filteredTarget = currentTargetAllocations.filter((a) => !toRemoveSet.has(a.voucherId));
    if (filteredTarget.length !== currentTargetAllocations.length) {
      await updateDoc(targetRef, { allocations: filteredTarget });
    }
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
}

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
  /** When using onConfirm: pass sale/purchase total so dialog can cap linking correctly after user unticks (like spend wise requiredAmount). */
  targetTotalAmount?: number;
  /** Party opening balance (for "Opening Balance" linkable row). When > 0, row is shown. */
  partyOpeningBalance?: number;
  /** Called after successfully updating voucher(s) when saveMode is 'server'. */
  onDone?: () => void;
  /** When provided: DONE only passes allocations to parent (no server save). Server save when user clicks Save on voucher form. */
  onConfirm?: (payload: { linkedAmounts: Record<string, number> }) => void;
  /** When using onConfirm: optional initial state (e.g. pending allocations from form). */
  initialLinkedAmounts?: Record<string, number>;
  /** Optional: pass vouchers from form to ensure full list (Sale/Pur/Payment In/Out) for bill-wise link. */
  vouchersOverride?: any[];
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
  targetTotalAmount,
  partyOpeningBalance = 0,
  onDone,
  onConfirm,
  initialLinkedAmounts,
  vouchersOverride,
}: LinkAdvancesToVoucherDialogProps) {
  const { companyId } = useCompany();
  const { vouchers: vouchersFromContext } = useVouchers();
  const vouchers = vouchersOverride && vouchersOverride.length > 0 ? vouchersOverride : vouchersFromContext;
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
  // Consumed by sale/purchase: openingBalanceAllocated on their vouchers
  const totalConsumedFromOBByBillwise = (vouchers as any[]).reduce((sum, v) => {
    if (v.type !== "sale" && v.type !== "sale_service" && v.type !== "purchase" && v.type !== "purchase_service") return sum;
    if (String((v as any).partyId ?? "") !== String(targetPartyId)) return sum;
    return sum + (Number((v as any).openingBalanceAllocated) || 0);
  }, 0);
  // Dr OB (partyOB > 0) is consumed when Payment In links to it; Cr OB when Payment Out links. So count correct payment type.
  const payTypesOB = partyOB > 0 ? ["payment_in", "direct_income"] : ["payment_out", "direct_expense"];
  const totalConsumedFromOBByPayments = (vouchers as any[]).reduce((sum, v) => {
    if (!payTypesOB.includes(v.type) || String((v as any).partyId ?? "") !== String(targetPartyId)) return sum;
    const allocs = (v.allocations as Allocation[] | undefined) || [];
    const toOB = allocs.filter((a) => a.voucherId === OPENING_BALANCE_VOUCHER_ID).reduce((s, a) => s + getAllocationTotal(a), 0);
    return sum + toOB;
  }, 0);
  const totalConsumedFromOB = totalConsumedFromOBByBillwise + totalConsumedFromOBByPayments;
  const obOutstanding = Math.max(0, obAmount - totalConsumedFromOB);
  const targetVoucher = (vouchers as any[]).find((v) => v.id === targetVoucherId);
  const obAllocatedToTarget = Number(targetVoucher?.openingBalanceAllocated) || 0;
  const showOBRow = (mode === "sale" && showOBInSale) || (mode === "purchase" && showOBInPurchase);
  // Other Linked for OB = amount linked to other vouchers (not current); Current Link = obAllocatedToTarget; Linkable = obOutstanding. Hide row when linkable 0 and no current link.
  const obAllocatedToOthers = Math.max(0, totalConsumedFromOB - obAllocatedToTarget);
  const obRow = showOBRow && obAmount > 0 && (obOutstanding > 0 || obAllocatedToTarget > 0) ? [{
    id: OPENING_BALANCE_VOUCHER_ID,
    amount: obAmount,
    allocatedTotal: totalConsumedFromOB,
    remaining: obOutstanding,
    allocatedToOthers: obAllocatedToOthers,
    date: null,
    voucherNumber: "Opening Balance",
    type: "opening_balance",
  }] : [];
  const sourceList = [...obRow, ...baseSourceList];

  const targetOutstandingFromParent = targetOutstandingOverride ?? (mode === "sale" ? saleOutstanding : purchaseOutstanding);
  const targetOutstanding = onConfirm && targetTotalAmount != null
    ? Math.max(0, targetTotalAmount)
    : targetOutstandingFromParent;

  const [linkedAmounts, setLinkedAmounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // When onConfirm is set: DONE keeps data local (no server write); parent saves on voucher Save. Otherwise DONE runs handleSave.
  useEffect(() => {
    if (!isOpen) setLinkedAmounts({});
  }, [isOpen]);

  // Load existing allocations when dialog opens: use initialLinkedAmounts if provided (from form's effective view or pending), else from vouchers.
  // Form passes effective linked amounts so edit link page shows correct tick even when vouchers are stale.
  useEffect(() => {
    if (!isOpen) return;
    if (initialLinkedAmounts !== undefined && initialLinkedAmounts !== null) {
      setLinkedAmounts(initialLinkedAmounts);
      return;
    }
    if (!targetVoucherId) {
      setLinkedAmounts({});
      return;
    }
    if (!vouchers?.length) return;
    const initial: Record<string, number> = {};
    const targetVoucher = (vouchers as any[]).find((v) => v.id === targetVoucherId);
    const obAllocated = Number(targetVoucher?.openingBalanceAllocated) || 0;
    if (obAllocated > 0) initial[OPENING_BALANCE_VOUCHER_ID] = obAllocated;
    const crTypes = ["payment_in", "direct_income", "purchase", "purchase_service"];
    const drTypes = ["payment_out", "direct_expense", "sale", "sale_service"];
    const srcTypes = mode === "sale" ? crTypes : drTypes;
    (vouchers as any[])
      .filter((v) => srcTypes.includes(v.type) && String((v as any).partyId ?? "") === String(targetPartyId))
      .forEach((v) => {
        const allocations = (v.allocations as Allocation[] | undefined) || [];
        const entry = allocations.find((a) => a.voucherId === targetVoucherId);
        if (!entry) return;
        const amt = balanceKind === "all" ? getAllocationTotal(entry) : balanceKind === "tax" ? getTaxFromAllocation(entry) : getNetFromAllocation(entry);
        if (amt > 0) initial[v.id] = amt;
      });
    setLinkedAmounts(initial);
  }, [isOpen, targetVoucherId, targetPartyId, mode, vouchers, balanceKind, initialLinkedAmounts]);

  const totalLinked = Object.values(linkedAmounts).reduce((s, n) => s + Number(n) || 0, 0);
  const valid = totalLinked <= targetOutstanding && totalLinked >= 0;

  const setLinkedFor = (sourceId: string, value: string, cap?: number) => {
    let num = parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;
    if (cap != null && cap >= 0) num = Math.min(num, cap);
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
    // Reset is immediate by request; clear local draft allocations directly.
    setLinkedAmounts({});
    toast.info("Allocations cleared.");
  };

  const handleDone = () => {
    if (onConfirm) {
      onConfirm({ linkedAmounts });
      onOpenChange(false);
    } else {
      handleSave();
    }
  };

  const handleSave = async () => {
    if (!companyId || !valid) return;
    const updates = Object.entries(linkedAmounts).filter(([, amt]) => Number(amt) > 0);
    const voucherPath = `companies/${companyId}/vouchers`;

    // Source voucher IDs that currently have an allocation to this target — same types as dialog (sale: Cr incl. purchase; purchase: Dr incl. sale)
    const crTypes = ["payment_in", "direct_income", "purchase", "purchase_service"];
    const drTypes = ["payment_out", "direct_expense", "sale", "sale_service"];
    const sourceTypes = mode === "sale" ? crTypes : drTypes;
    const sourceVoucherIds = (vouchers as any[])
      .filter((v) => sourceTypes.includes(v.type) && String((v as any).partyId ?? "") === String(targetPartyId))
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
      // Unlink from source vouchers (remove their allocation to this target)
      for (const sourceVoucherId of toRemove) {
        const ref = doc(firestore, voucherPath, sourceVoucherId);
        const snap = await getDoc(ref);
        if (!snap.exists()) continue;
        const data = snap.data();
        const allocations: Allocation[] = Array.isArray(data?.allocations) ? [...data.allocations] : [];
        const filtered = allocations.filter((a) => a.voucherId !== targetVoucherId);
        await updateDoc(ref, { allocations: filtered });
      }
      // Bilateral unlink: also remove from TARGET voucher’s allocations any entry pointing to removed sources (so other voucher’s “Link for bill wise” view updates)
      if (toRemove.length > 0) {
        const targetRef = doc(firestore, voucherPath, targetVoucherId);
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists()) {
          const targetData = targetSnap.data();
          const targetAllocations: Allocation[] = Array.isArray(targetData?.allocations) ? [...targetData.allocations] : [];
          const toRemoveSet = new Set(toRemove);
          const filteredTarget = targetAllocations.filter((a) => !toRemoveSet.has(a.voucherId));
          if (filteredTarget.length !== targetAllocations.length) {
            await updateDoc(targetRef, { allocations: filteredTarget });
          }
        }
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

  const title = mode === "sale" ? "Link payment to this sale" : "Link payment to this purchase";
  const subLabel = targetLabel || (mode === "sale" ? "Sale" : "Purchase");
  const remainingToLink = Math.max(0, targetOutstanding - totalLinked);
  const sectionTitle = mode === "sale" ? "Cr transactions (same party)" : "Dr transactions (same party)";
  const isMobile = useIsMobile();
  const targetVoucherDate = safeToDate((targetVoucher as any)?.date);

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
          {/* Code (2) = Link payment to this Sale/Purchase popup — so user can say which popup when reporting */}
          <p className="text-xs text-muted-foreground leading-tight">Link for bill wise (2)</p>
          <DialogTitle className="text-xl leading-tight">{title}</DialogTitle>
          {targetOutstanding > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm pt-1 hidden md:flex">
              <span className="text-muted-foreground">Required: <strong className="text-foreground">{formatCurrency(targetOutstanding)}</strong></span>
              <span className="text-muted-foreground">Selected: <strong className="text-foreground">{formatCurrency(totalLinked)}</strong></span>
              <span className="text-muted-foreground">
                Balance: {remainingToLink === 0 ? <strong className="text-green-600">Settled</strong> : <strong className="text-foreground">{formatCurrency(remainingToLink)}</strong>}
              </span>
              {totalLinked < targetOutstanding && totalLinked > 0 && (
                <span className="text-amber-600 font-medium">Choose more</span>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* To Voucher: same header as From Voucher; Linkable column shown as Balance */}
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
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{targetVoucherDate ? formatDate(targetVoucherDate) : "—"}</td>
                  <td className="p-2 font-medium whitespace-nowrap">{(targetVoucher as any)?.voucherNumber ?? subLabel ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap">{targetPartyName || "—"}</td>
                  <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(targetOutstanding, { noSuffix: true })}</td>
                  <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(totalLinked, { noSuffix: true })}</td>
                  <td className="p-2 text-right font-medium whitespace-nowrap">{formatCurrency(remainingToLink, { noSuffix: true })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm font-medium text-muted-foreground shrink-0 pt-1 text-center">From Voucher</p>
          <p className="text-sm text-muted-foreground shrink-0 -mt-0.5 hidden md:block text-center">{sectionTitle} (only linkable or already selected)</p>
          {/* Same scroll container as spend wise: horizontal + vertical, thin dim scrollbar */}
          <div className="flex-1 min-h-0 border rounded-md overflow-auto scrollbar-slim-dim">
            {sourceList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No advances (same party) to link.</p>
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
                    {sourceList.filter((row) => {
                      const linked = linkedAmounts[row.id] ?? 0;
                      const linkable = Math.max(0, row.remaining - linked);
                      return linkable > 0 || linked > 0;
                    }).map((row) => {
                      const d = safeToDate(row.date);
                      const linked = linkedAmounts[row.id] ?? 0;
                      const allocatedToOthers = (row as { allocatedToOthers?: number }).allocatedToOthers ?? 0;
                      const otherLinked = allocatedToOthers;
                      const rowType = row.id === OPENING_BALANCE_VOUCHER_ID || row.type === "opening_balance" ? "Opening Balance" : row.type === "payment_in" || row.type === "direct_income" ? "payment in" : row.type === "payment_out" || row.type === "direct_expense" ? "payment out" : row.type === "purchase" || row.type === "purchase_service" ? "purchase" : row.type === "sale" || row.type === "sale_service" ? "sale" : row.type;
                      const isOBRow = row.id === OPENING_BALANCE_VOUCHER_ID;
                      const rowMax = isOBRow ? row.amount : row.remaining;
                      const maxAllowed = Math.min(rowMax, remainingToLink + linked);
                      // When required amount is already met, disable tick for rows not yet selected (only already-linked rows can be unticked)
                      const cannotAddMore = remainingToLink <= 0 && linked === 0;
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
                                  if (initial > 0) setLinkedFor(row.id, String(initial), cap);
                                } else {
                                  setLinkedFor(row.id, "0");
                                }
                              }}
                              title={cannotAddMore ? "Required amount already linked" : linked > 0 ? "Clear this row" : "Include this row"}
                            />
                          </td>
                          <td className="p-2 text-muted-foreground whitespace-nowrap align-middle">
                            {d ? (dateSystem === "AD" ? formatDate(d) : dateSystem === "BS" ? formatDateBS(d) : <span className="whitespace-nowrap">{formatDateBS(d)} ({formatDate(d)})</span>) : "—"}
                          </td>
                          <td className="p-2 font-medium whitespace-nowrap align-middle">{isOBRow ? "—" : (row.voucherNumber ?? "—")}</td>
                          <td className="p-2 whitespace-nowrap align-middle">{rowType}</td>
                          <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap align-middle tabular-nums">{formatCurrency(row.amount, { noSuffix: true })} Dr</td>
                          <td className="p-2 text-right text-muted-foreground whitespace-nowrap align-middle tabular-nums">{formatCurrency(otherLinked, { noSuffix: true })} Dr</td>
                          <td className="p-2 text-right text-muted-foreground whitespace-nowrap align-middle tabular-nums">{formatCurrency(linked, { noSuffix: true })} Dr</td>
                          <td className="p-2 text-right font-medium whitespace-nowrap align-middle tabular-nums">{formatCurrency(Math.max(0, row.remaining - linked), { noSuffix: true })} Dr</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {totalLinked < targetOutstanding && totalLinked > 0 && (
            <p className="text-sm text-amber-600 font-medium px-1">Selected total is less than required. Choose more vouchers to cover the amount.</p>
          )}
          <div className="flex flex-shrink-0 items-center gap-2 pt-2 border-t flex-wrap justify-between">
            <Button size="sm" onClick={() => onOpenChange(false)} className="h-9 rounded-full shrink-0 bg-orange-500 hover:bg-orange-600 text-white border-0">
              Cancel
            </Button>
            <div className="flex flex-row flex-wrap items-center gap-2 shrink-0">
              <Button type="button" size="sm" onClick={handleAutoLink} disabled={targetOutstanding <= 0 || sourceList.length === 0} className="h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white border-0">
                <Link2 className="h-4 w-4 hidden md:inline-block md:mr-1.5" />
                Auto Link
              </Button>
              <Button type="button" size="sm" onClick={handleReset} className="h-9 rounded-full bg-violet-600 hover:bg-violet-700 text-white border-0">
                <RotateCcw className="h-4 w-4 hidden md:inline-block md:mr-1.5" />
                Reset
              </Button>
              <Button onClick={handleDone} disabled={saving || (!onConfirm && !valid)} className="h-9 rounded-full bg-green-600 hover:bg-green-700 text-white border-0">
                {saving ? "Saving..." : "DONE"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

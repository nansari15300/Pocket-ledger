"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";

const safeToDate = (date: unknown): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof (date as { toDate?: () => Date })?.toDate === "function")
    return (date as { toDate: () => Date }).toDate();
  const parsed = new Date(date as string | number);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export interface LinkPaymentInToPaymentOutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  /** All vouchers (payment_in for this account will be filtered inside). */
  vouchers: any[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  /** Names for party/staff/tax/income for particulars. */
  names?: Record<string, string>;
  /** Required amount (Payment Out amount). When set, shows "Choose more" if selected total < this. */
  requiredAmount?: number;
  /** When editing, exclude this Payment Out from "already linked" sum so we don't double-count. */
  currentVoucherId?: string | null;
  /** When editing, amount already linked by this voucher to each Payment In id (so Linked column shows total including current). */
  currentVoucherLinkedAmounts?: Record<string, number>;
  /** When set, show only this voucher in the list (e.g. current voucher only). */
  filterToVoucherId?: string | null;
  /** When true, show list as read-only (no selection, only Close). */
  displayOnly?: boolean;
  /** Account name to show in title so user knows which account the link is for. */
  accountName?: string | null;
  /** When displayOnly is true: show "in voucher" or "payment out" in title. */
  displayOnlyVariant?: 'in' | 'out';
  /** When provided (e.g. from Payment Out form), show current voucher (Payment Out) at top — "To Voucher (current voucher)". */
  currentVoucherSummary?: { voucherNumber: string; date: Date | null; from: string; amount: number; linkedTotal: number };
}

export function LinkPaymentInToPaymentOutDialog({
  isOpen,
  onOpenChange,
  accountId,
  vouchers,
  selectedIds,
  onConfirm,
  names = {},
  requiredAmount = 0,
  currentVoucherId,
  currentVoucherLinkedAmounts = {},
  filterToVoucherId,
  displayOnly = false,
  accountName,
  displayOnlyVariant = 'in',
  currentVoucherSummary,
}: LinkPaymentInToPaymentOutDialogProps) {
  const { formatDate, formatCurrency } = useDate();
  const [checked, setChecked] = React.useState<Set<string>>(new Set(selectedIds));
  /** Order in which user ticked rows: first-ticked gets allocation first. */
  const [selectedOrder, setSelectedOrder] = React.useState<string[]>(selectedIds?.length ? [...selectedIds] : []);

  const prevOpenRef = React.useRef(false);
  React.useEffect(() => {
    const ids = Array.isArray(selectedIds) ? selectedIds : [];
    const deduped = [...new Set(ids)];
    const justOpened = isOpen && !prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (!isOpen) return;
    if (!justOpened) return;
    if (requiredAmount > 0 && paymentInList.length > 0 && deduped.length > 0) {
      const ordered = paymentInList.filter((r) => deduped.includes(r.id));
      let sum = 0;
      const minimal: string[] = [];
      for (const row of ordered) {
        minimal.push(row.id);
        sum += row.linkable;
        if (sum >= requiredAmount) break;
      }
      setChecked(new Set(minimal));
      setSelectedOrder(minimal);
    } else {
      setChecked(new Set(deduped));
      setSelectedOrder(deduped.length ? [...deduped] : []);
    }
  }, [selectedIds, isOpen]);

  const linkedAmountByPaymentInId = React.useMemo(() => {
    const map = new Map<string, number>();
    vouchers
      .filter(
        (v: any) => {
          const isOutForAccount =
            (v.type === "payment_out" && v.accountId === accountId) ||
            (v.type === "direct_expense" && v.accountId === accountId) ||
            (v.type === "contra" && v.fromAccountId === accountId);
          return (
            isOutForAccount &&
            Array.isArray(v.linkedPaymentInIds) &&
            v.linkedPaymentInIds.length > 0 &&
            v.id !== currentVoucherId &&
            !v.isDeleted
          );
        }
      )
      .forEach((po: any) => {
        const poAmt = Number(po.total ?? po.amount ?? 0) || 0;
        const ids = po.linkedPaymentInIds as string[];
        const amounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
        ids.forEach((piId: string) => {
          const add = amounts?.[piId] != null ? Number(amounts[piId]) : poAmt / ids.length;
          map.set(piId, (map.get(piId) ?? 0) + add);
        });
      });
    return map;
  }, [vouchers, accountId, currentVoucherId]);

  /** In-flow vouchers for this account: Payment In, Direct Income, and Contra (where this account receives). */
  const isInVoucherForAccount = (v: any) =>
    (v.type === "payment_in" && v.accountId === accountId) ||
    (v.type === "direct_income" && v.accountId === accountId) ||
    (v.type === "contra" && v.toAccountId === accountId);

  const paymentInList = React.useMemo(() => {
    return vouchers
      .filter((v) => isInVoucherForAccount(v) && !v.isDeleted)
      .map((v) => {
        const date = safeToDate(v.date);
        const amount = Number(v.total ?? v.amount ?? 0);
        const fromOthers = linkedAmountByPaymentInId.get(v.id) ?? 0;
        const fromCurrent = Number(currentVoucherLinkedAmounts[v.id]) || 0;
        const alreadyLinked = fromOthers + fromCurrent;
        const linkable = Math.max(0, amount - alreadyLinked);
        const from =
          v.type === "contra"
            ? (names[v.fromAccountId] ?? "—")
            : names[v.partyId] ||
              names[v.staffId] ||
              names[v.taxAccountId] ||
              names[v.incomeAccountId] ||
              v.payeeName ||
              "—";
        return { id: v.id, voucherNumber: v.voucherNumber ?? "—", date, amount, alreadyLinked, linkable, from };
      })
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }, [vouchers, accountId, names, linkedAmountByPaymentInId, currentVoucherLinkedAmounts]);

  /** When filterToVoucherId is set, show only that voucher (e.g. current voucher only). */
  const paymentInListFiltered = React.useMemo(() => {
    if (!filterToVoucherId) return paymentInList;
    return paymentInList.filter((r) => r.id === filterToVoucherId);
  }, [paymentInList, filterToVoucherId]);

  /** Add new: hide linkable 0. Edit: show linkable 0 only if already linked (in selectedIds). */
  const displayList = React.useMemo(() => {
    const isEdit = currentVoucherId != null && currentVoucherId !== "";
    const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
    const list = paymentInListFiltered;
    if (!isEdit) return list.filter((r) => r.linkable > 0);
    return list.filter((r) => r.linkable > 0 || selectedSet.has(r.id));
  }, [paymentInListFiltered, currentVoucherId, selectedIds]);

  /** Tentative allocation: include already-linked-from-current first, then distribute remaining requiredAmount in selection order. */
  const tentativeLinkedByRowId = React.useMemo(() => {
    const out: Record<string, number> = {};
    if (requiredAmount <= 0 || displayOnly) return out;
    const byId = new Map(paymentInListFiltered.map((r) => [r.id, r]));
    const ordered = selectedOrder.filter((id) => checked.has(id)).map((id) => byId.get(id)).filter(Boolean) as typeof paymentInList;
    let allocated = 0;
    for (const row of ordered) {
      const currentAmt = Number(currentVoucherLinkedAmounts[row.id]) || 0;
      if (currentAmt > 0) {
        out[row.id] = currentAmt;
        allocated += currentAmt;
      }
    }
    let remaining = Math.max(0, requiredAmount - allocated);
    for (const row of ordered) {
      if (remaining <= 0) break;
      const already = out[row.id] ?? 0;
      const take = Math.min(row.linkable, remaining);
      if (take > 0) {
        out[row.id] = already + take;
        remaining -= take;
      }
    }
    return out;
  }, [paymentInListFiltered, checked, requiredAmount, selectedOrder, displayOnly, currentVoucherLinkedAmounts]);

  /** Amount we are linking from current selection (capped by required). */
  const selectedTotal = React.useMemo(() => {
    return Object.values(tentativeLinkedByRowId).reduce((s, v) => s + v, 0);
  }, [tentativeLinkedByRowId]);

  const needsMore = requiredAmount > 0 && selectedTotal < requiredAmount;
  const selectionFull = requiredAmount > 0 && selectedTotal >= requiredAmount;

  const handleToggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedOrder((order) => order.filter((x) => x !== id));
      } else {
        if (selectionFull) return prev;
        next.add(id);
        setSelectedOrder((order) => (order.includes(id) ? order : [...order, id]));
      }
      return next;
    });
  };

  const handleAutoLink = () => {
    const byDateAsc = [...paymentInList].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
    let sum = 0;
    const ids: string[] = [];
    for (const row of byDateAsc) {
      if (sum >= requiredAmount) break;
      if (row.linkable <= 0) continue;
      ids.push(row.id);
      sum += row.linkable;
    }
    setChecked(new Set(ids));
    setSelectedOrder(ids);
  };

  const handleConfirm = () => {
    const ids = selectedOrder.filter((id) => checked.has(id));
    onConfirm([...new Set(ids)]);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl md:max-w-[54.6rem] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{displayOnly ? `Current voucher ${displayOnlyVariant === 'out' ? 'payment out' : 'in voucher'}${accountName ? ` from ${accountName}` : ""}` : `Select Payment In / Direct Income / Contra (in)${accountName ? ` from ${accountName}` : ""}`}</DialogTitle>
          {!displayOnly && (
          <p className="text-sm text-muted-foreground">
            Tick which Payment In, Direct Income or Contra (in) vouchers this payment is spending from. Amount will be linked from selected vouchers.
          </p>
          )}
          {!displayOnly && requiredAmount > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-sm pt-1">
              <span className="text-muted-foreground">Required: <strong className="text-foreground">{formatCurrency(requiredAmount)}</strong></span>
              <span className="text-muted-foreground">Selected: <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong></span>
              {needsMore && (
                <span className="text-amber-600 font-medium">Choose more</span>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={handleAutoLink}>
                Auto Link
              </Button>
            </div>
          )}
        </DialogHeader>
        {/* To Voucher (current voucher): the Payment Out we're editing — show at top like Payment In dialog. */}
        {currentVoucherSummary && !displayOnly && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 shrink-0">
            <p className="text-sm font-medium text-muted-foreground">To Voucher (current voucher)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[400px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">To</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Linked on current</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b last:border-b-0">
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{currentVoucherSummary.date ? formatDate(currentVoucherSummary.date) : "—"}</td>
                    <td className="p-2 font-medium whitespace-nowrap">{currentVoucherSummary.voucherNumber}</td>
                    <td className="p-2 whitespace-nowrap">{currentVoucherSummary.from}</td>
                    <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(currentVoucherSummary.amount)} Dr</td>
                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(currentVoucherSummary.linkedTotal)} Dr</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {currentVoucherSummary && !displayOnly && (
          <p className="text-sm font-medium text-muted-foreground shrink-0 pt-1">From Voucher — Payment In / Direct Income / Contra (in) of this account (only linkable or already selected)</p>
        )}
        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          <div className="p-0 min-w-0 max-w-full overflow-x-auto">
            {displayList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {paymentInListFiltered.length === 0
                  ? (filterToVoucherId ? "Current voucher not found for this account." : "No Payment In, Direct Income or Contra (in) found for this account.")
                  : "No linkable amount remaining."}
              </p>
            ) : (
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 w-10 whitespace-nowrap"></th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">From</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Linked</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Linkable</th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.map((row) => (
                    <tr
                      key={row.id}
                      role={displayOnly ? undefined : "button"}
                      onClick={displayOnly ? undefined : () => !(selectionFull && !checked.has(row.id)) && handleToggle(row.id)}
                      className={cn(
                        "border-b last:border-b-0",
                        !displayOnly && "hover:bg-muted/50 cursor-pointer",
                        checked.has(row.id) && "bg-muted/30",
                        !displayOnly && selectionFull && !checked.has(row.id) && "cursor-not-allowed opacity-70"
                      )}
                    >
                      <td className="p-2 w-10 whitespace-nowrap" onClick={(e) => displayOnly ? undefined : e.stopPropagation()}>
                        {!displayOnly && (
                        <Checkbox
                          checked={checked.has(row.id)}
                          onCheckedChange={() => handleToggle(row.id)}
                          disabled={!checked.has(row.id) && selectionFull}
                        />
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? formatDate(row.date) : "—"}</td>
                      <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                      <td className="p-2 whitespace-nowrap">{row.from}</td>
                      <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(row.amount)}</td>
                      <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency((row.alreadyLinked ?? 0) - (Number(currentVoucherLinkedAmounts[row.id]) || 0) + (tentativeLinkedByRowId[row.id] ?? 0))}</td>
                      <td className="p-2 text-right font-medium whitespace-nowrap">{formatCurrency(Math.max(0, row.linkable + (Number(currentVoucherLinkedAmounts[row.id]) || 0) - (tentativeLinkedByRowId[row.id] ?? 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ScrollArea>
        {!displayOnly && needsMore && (
          <p className="text-sm text-amber-600 font-medium px-1">Selected total is less than required. Choose more vouchers to cover the amount.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {displayOnly ? "Close" : "Cancel"}
          </Button>
          {!displayOnly && <Button onClick={handleConfirm}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

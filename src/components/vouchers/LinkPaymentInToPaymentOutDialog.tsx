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
    if (justOpened && requiredAmount > 0 && paymentInList.length > 0 && deduped.length > 0) {
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
  }, [selectedIds, isOpen, requiredAmount]);

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
        const alreadyLinked = linkedAmountByPaymentInId.get(v.id) ?? 0;
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
  }, [vouchers, accountId, names, linkedAmountByPaymentInId]);

  /** Add new: hide linkable 0. Edit: show linkable 0 only if already linked (in selectedIds). */
  const displayList = React.useMemo(() => {
    const isEdit = currentVoucherId != null && currentVoucherId !== "";
    const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);
    if (!isEdit) return paymentInList.filter((r) => r.linkable > 0);
    return paymentInList.filter((r) => r.linkable > 0 || selectedSet.has(r.id));
  }, [paymentInList, currentVoucherId, selectedIds]);

  const selectedTotal = React.useMemo(() => {
    return paymentInList.filter((r) => checked.has(r.id)).reduce((sum, r) => sum + r.linkable, 0);
  }, [paymentInList, checked]);

  /** Tentative allocation: requiredAmount distributed in selection order (first-ticked first), then by linkable. */
  const tentativeLinkedByRowId = React.useMemo(() => {
    const out: Record<string, number> = {};
    if (requiredAmount <= 0) return out;
    const byId = new Map(paymentInList.map((r) => [r.id, r]));
    const ordered = selectedOrder.filter((id) => checked.has(id)).map((id) => byId.get(id)).filter(Boolean) as typeof paymentInList;
    let remaining = requiredAmount;
    for (const row of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(row.linkable, remaining);
      if (take > 0) out[row.id] = take;
      remaining -= take;
    }
    return out;
  }, [paymentInList, checked, requiredAmount, selectedOrder]);

  const needsMore = requiredAmount > 0 && selectedTotal < requiredAmount;

  const handleToggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedOrder((order) => order.filter((x) => x !== id));
      } else {
        next.add(id);
        setSelectedOrder((order) => (order.includes(id) ? order : [...order, id]));
      }
      return next;
    });
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
          <DialogTitle>Select Payment In / Direct Income / Contra (in)</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tick which Payment In, Direct Income or Contra (in) vouchers this payment is spending from. Amount will be linked from selected vouchers.
          </p>
          {requiredAmount > 0 && (
            <div className="flex items-center gap-4 text-sm pt-1">
              <span className="text-muted-foreground">Required: <strong className="text-foreground">{formatCurrency(requiredAmount)}</strong></span>
              <span className="text-muted-foreground">Selected: <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong></span>
              {needsMore && (
                <span className="text-amber-600 font-medium">Choose more</span>
              )}
            </div>
          )}
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          <div className="p-0 min-w-0 max-w-full overflow-x-auto">
            {displayList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {paymentInList.length === 0
                  ? "No Payment In, Direct Income or Contra (in) found for this account."
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
                      role="button"
                      onClick={() => handleToggle(row.id)}
                      className={cn(
                        "border-b last:border-b-0 hover:bg-muted/50 cursor-pointer",
                        checked.has(row.id) && "bg-muted/30"
                      )}
                    >
                      <td className="p-2 w-10 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked.has(row.id)}
                          onCheckedChange={() => handleToggle(row.id)}
                        />
                      </td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? formatDate(row.date) : "—"}</td>
                      <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                      <td className="p-2 whitespace-nowrap">{row.from}</td>
                      <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(row.amount)}</td>
                      <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(tentativeLinkedByRowId[row.id] ?? 0)}</td>
                      <td className="p-2 text-right font-medium whitespace-nowrap">{formatCurrency(Math.max(0, row.linkable - (tentativeLinkedByRowId[row.id] ?? 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ScrollArea>
        {needsMore && (
          <p className="text-sm text-amber-600 font-medium px-1">Selected total is less than required. Choose more vouchers to cover the amount.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

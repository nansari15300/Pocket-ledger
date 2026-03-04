"use client";

import * as React from "react";
import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pencil, Link2, History, CheckCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays } from "date-fns";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import usePermissions from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { getAllocationTotal } from "@/lib/payment-allocation-utils";
import type { Item } from "@/components/items/types";
import { motion } from "framer-motion";

export type Context =
  | "party"
  | "group"
  | "daybook"
  | "account"
  | "staff"
  | "tax"
  | "tax_group"
  | "item"
  | "expense"
  | "note"
  | "other";

export type Transaction = Record<string, any>;

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === "function") return date.toDate();
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const getConversionFactor = (
  item: Item | undefined,
  displayUnit: string | undefined
): number => {
  if (!item || !displayUnit) return 1;
  const conversions = (item.unitConversions || []) as any[];
  if (conversions.length === 0) return 1;
  const smallestUnit =
    conversions.length > 0
      ? conversions[conversions.length - 1].toUnit
      : (item as any).openingBalanceUnit || "";
  if (displayUnit === smallestUnit) return 1;
  let factor = 1;
  let currentUnit = displayUnit;
  let attempts = 0;
  while (currentUnit !== smallestUnit && currentUnit && attempts < 10) {
    const conv = conversions.find((c: any) => c.fromUnit === currentUnit);
    if (!conv) return 1;
    factor *= Number(conv.conversionFactor) || 1;
    currentUnit = conv.toUnit;
    attempts++;
  }
  return factor > 0 ? factor : 1;
};

export const formatQuantity = (val: number) =>
  Math.abs(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getDisplayType = (t: any) => {
  if (!t.type) return "";
  if (t.type === "journal" && t.subType === "add_salary") return "Add Salary";
  return t.type.replace(/_/g, " ");
};

export const getParticularsText = (t: any, names: Record<string, string> = {}) => {
  const getName = (id: string | undefined) => (id ? (names[id] || "—") : "N/A");
  if (t.type === "sale") {
    const partyName = getName(t.partyId);
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `To: ${partyName} (via ${accountName})` : `To: ${partyName}`;
  }
  if (t.type === "purchase") {
    const partyName = getName(t.partyId);
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `From: ${partyName} (via ${accountName})` : `From: ${partyName}`;
  }
  if (t.type === "payment_in") {
    const payeeName = names[t.partyId] || names[t.staffId] || names[t.taxAccountId] || names[t.incomeAccountId] || t.payeeName || "N/A";
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `From: ${payeeName} (via ${accountName})` : `From: ${payeeName}`;
  }
  if (t.type === "payment_out") {
    const payeeName = names[t.partyId] || names[t.staffId] || names[t.taxAccountId] || names[t.expenseAccountId] || t.payeeName || "N/A";
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `To: ${payeeName} (via ${accountName})` : `To: ${payeeName}`;
  }
  if (t.type === "contra") return `${getName(t.fromAccountId)} to ${getName(t.toAccountId)}`;
  if (t.type === "direct_income") {
    const incomeAccountName = getName(t.incomeAccountId);
    const accountName = getName(t.accountId);
    return accountName && accountName !== "N/A" ? `By: ${incomeAccountName} (via ${accountName})` : `By: ${incomeAccountName}`;
  }
  if (t.type === "direct_expense") {
    const toAccountId = t.toAccountId || t.expenseAccountId;
    const toAccountName = getName(toAccountId);
    const accountName = getName(t.fromAccountId || t.accountId);
    return accountName && accountName !== "N/A" ? `To: ${toAccountName} (via ${accountName})` : `To: ${toAccountName}`;
  }
  if (t.type === "journal" && Array.isArray(t.entries)) {
    const dr = t.entries.filter((e: any) => e.debit > 0).map((e: any) => `Dr: ${getName(e.accountId)}`);
    const cr = t.entries.filter((e: any) => e.credit > 0).map((e: any) => `Cr: ${getName(e.accountId)}`);
    return [...dr, ...cr].join(", ");
  }
  if (t.type === "note") return `Note for: ${getName(t.entityId)}`;
  return t.narration || "";
};

/** One account / opposite side only (for mobile card - no "From/To X (via Y)"). */
export const getOppositeAccountLabel = (
  t: any,
  names: Record<string, string> = {},
  context?: Context,
  contextId?: string,
  groupEntityType?: "party" | "account" | "staff" | "tax" | "expense" | "item"
): string => {
  const getName = (id: string | undefined) => (id ? (names[id] || "—") : "N/A");
  if (context === "item" && (t.type === "sale" || t.type === "purchase")) {
    return getName(t.partyId);
  }
  // Party context: show opposite/counter account (bank, expense, etc.) not the current party
  if (context === "party" && contextId) {
    const partyInTx = t.partyId === contextId || (t.type === "journal" && Array.isArray(t.entries) && t.entries.some((e: any) => e?.accountId === contextId));
    if (partyInTx) {
      if (t.type === "sale") return getName(t.salesAccountId || "sales_account") || "Sales Account";
      if (t.type === "purchase") return getName(t.purchaseAccountId || "purchase_account") || "Purchase Account";
      if (t.type === "payment_in") return getName(t.accountId) || "Payment In";
      if (t.type === "payment_out") return getName(t.accountId) || getName(t.fromAccountId) || "Payment Out";
      if (t.type === "direct_income") return getName(t.accountId) || "Direct Income";
      if (t.type === "direct_expense") return getName(t.fromAccountId) || getName(t.accountId) || "Direct Expense";
      if (t.type === "contra") return getName(t.fromAccountId) || getName(t.toAccountId);
      if (t.type === "journal" && Array.isArray(t.entries)) {
        const partyEntry = t.entries.find((e: any) => e?.accountId === contextId);
        const oppositeSide = partyEntry ? ((Number(partyEntry?.debit) || 0) > 0 ? "credit" : "debit") : "debit";
        const oppositeEntry = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId && (Number(e?.[oppositeSide]) || 0) > 0);
        if (oppositeEntry?.accountId) return getName(oppositeEntry.accountId);
        const anyOther = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId);
        if (anyOther?.accountId) return getName(anyOther.accountId);
        return "Journal";
      }
      if (t.type === "note") return getName(t.entityId);
    }
  }
  // Tax group: sale/purchase show party (opposite of tax), not Sales/Purchase account
  if (context === "group" && groupEntityType === "tax" && (t.type === "sale" || t.type === "purchase")) {
    return getName(t.partyId);
  }
  // Group context: sale/purchase show Sales/Purchase account (party group, etc.)
  if (context === "group" && (t.type === "sale" || t.type === "purchase")) {
    if (t.type === "sale") return getName(t.salesAccountId || "sales_account") || "Sales Account";
    if (t.type === "purchase") return getName(t.purchaseAccountId || "purchase_account") || "Purchase Account";
  }
  // Account group: show opposite (party/staff/tax/income/expense) for payments, like bank details
  if (context === "group" && groupEntityType === "account") {
    if (t.type === "payment_in") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.incomeAccountId && getName(t.incomeAccountId)) || t.payeeName || "N/A";
    if (t.type === "payment_out") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.expenseAccountId && getName(t.expenseAccountId)) || t.payeeName || "N/A";
    if (t.type === "direct_income") return getName(t.incomeAccountId);
    if (t.type === "direct_expense") return getName(t.toAccountId || t.expenseAccountId);
    if (t.type === "contra") return getName(t.fromAccountId) || getName(t.toAccountId);
    if (t.type === "journal" && Array.isArray(t.entries)) {
      const parts = t.entries.slice(0, 2).map((e: any) => getName(e.accountId));
      return parts.join(", ") || "Journal";
    }
  }
  // Account (bank) context: show opposite account - Sales/Purchase for sale/purchase, party for payments, etc.
  const accountInTx = context === "account" && contextId && (
    t.accountId === contextId ||
    (t.type === "contra" && (t.fromAccountId === contextId || t.toAccountId === contextId)) ||
    (t.type === "journal" && Array.isArray(t.entries) && t.entries.some((e: any) => e?.accountId === contextId))
  );
  if (accountInTx) {
    if (t.type === "sale") return getName(t.salesAccountId || "sales_account") || "Sales Account";
    if (t.type === "purchase") return getName(t.purchaseAccountId || "purchase_account") || "Purchase Account";
    if (t.type === "payment_in") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.incomeAccountId && getName(t.incomeAccountId)) || t.payeeName || "N/A";
    if (t.type === "payment_out") return (t.partyId && getName(t.partyId)) || (t.staffId && getName(t.staffId)) || (t.taxAccountId && getName(t.taxAccountId)) || (t.expenseAccountId && getName(t.expenseAccountId)) || t.payeeName || "N/A";
    if (t.type === "direct_income") return getName(t.incomeAccountId);
    if (t.type === "direct_expense") return getName(t.toAccountId || t.expenseAccountId);
    if (t.type === "contra") return getName(t.fromAccountId === contextId ? t.toAccountId : t.fromAccountId);
    if (t.type === "journal" && Array.isArray(t.entries)) {
      const accountEntry = t.entries.find((e: any) => e?.accountId === contextId);
      const oppositeSide = accountEntry ? ((Number(accountEntry?.debit) || 0) > 0 ? "credit" : "debit") : "debit";
      const oppositeEntry = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId && (Number(e?.[oppositeSide]) || 0) > 0);
      if (oppositeEntry?.accountId) return getName(oppositeEntry.accountId);
      const anyOther = t.entries.find((e: any) => e?.accountId && e.accountId !== contextId);
      if (anyOther?.accountId) return getName(anyOther.accountId);
      return "Journal";
    }
  }
  const isStaffContext =
    context === "staff" ||
    (context === "group" && (t?.subType === "add_salary" || !!t?.staffId));
  const staffId = isStaffContext ? contextId : undefined;
  const taxId = t.taxAccountId as string | undefined;

  if (isStaffContext) {
    const isTaxLikeId = (id: string | undefined) => {
      if (!id) return false;
      if (taxId && id === taxId) return true;
      const label = (names[id] || "").toLowerCase();
      return label.includes("tax") || label.includes("tds") || label.includes("vat");
    };
    const pickFirstValidId = (ids: Array<string | undefined>) =>
      ids.find((id) => id && id !== staffId && !isTaxLikeId(id));

    // Payment in/out: show bank account (opposite of staff)
    if (t.type === "payment_in" || t.type === "payment_out") {
      const bankId = t.type === "payment_in" ? t.accountId : (t.fromAccountId || t.accountId);
      if (bankId) return getName(bankId);
      const oppositeId = pickFirstValidId([
        t.accountId,
        t.fromAccountId,
        t.toAccountId,
        t.expenseAccountId,
        t.incomeAccountId,
        t.partyId,
      ]);
      return oppositeId ? getName(oppositeId) : t.payeeName || "N/A";
    }

    if (t.type === "journal" && t.subType === "add_salary" && Array.isArray(t.entries)) {
      const nonStaffEntries = t.entries.filter((e: any) => e?.accountId && e.accountId !== staffId);
      const expenseEntry =
        nonStaffEntries.find((e: any) => (Number(e?.debit) || 0) > 0 && !isTaxLikeId(e.accountId)) ||
        nonStaffEntries.find((e: any) => (Number(e?.debit) || 0) > 0) ||
        nonStaffEntries.find((e: any) => !isTaxLikeId(e.accountId)) ||
        nonStaffEntries[0];
      if (expenseEntry?.accountId) return getName(expenseEntry.accountId);
      return "Add Salary";
    }

    if (t.type === "journal" && Array.isArray(t.entries)) {
      const selectedEntry = t.entries.find((e: any) => e?.accountId === staffId);
      const preferredSide = (Number(selectedEntry?.credit) || 0) > 0 ? "debit" : "credit";
      const nonStaffEntries = t.entries.filter((e: any) => e?.accountId && e.accountId !== staffId);
      const oppositeEntry =
        nonStaffEntries.find((e: any) => (Number(e?.[preferredSide]) || 0) > 0 && !isTaxLikeId(e.accountId)) ||
        nonStaffEntries.find((e: any) => !isTaxLikeId(e.accountId)) ||
        nonStaffEntries[0];
      if (oppositeEntry?.accountId) return getName(oppositeEntry.accountId);
    }
  }

  if (t.type === "sale") return getName(t.partyId);
  if (t.type === "purchase") return getName(t.partyId);
  // Tax context: for payment_in/out, opposite is the bank; for add_salary, opposite is the expense account
  const isTaxContext = context === "tax" || context === "tax_group";
  if (isTaxContext && t.type === "journal" && t.subType === "add_salary" && Array.isArray(t.entries)) {
    const expenseEntry = t.entries.find((e: any) => (Number(e?.debit) || 0) > 0);
    if (expenseEntry?.accountId) return getName(expenseEntry.accountId);
  }
  if (isTaxContext && (t.type === "payment_in" || t.type === "payment_out")) {
    // payment_in: Dr Bank (accountId), Cr Tax → opposite = bank received into
    // payment_out: Dr Tax, Cr Bank (fromAccountId for direct_expense; accountId for payment_out)
    const bankId = t.type === "payment_in" ? t.accountId : (t.fromAccountId || t.accountId);
    if (bankId) return getName(bankId);
  }
  if (t.type === "payment_in") {
    return names[t.partyId] || names[t.staffId] || names[t.taxAccountId] || names[t.incomeAccountId] || t.payeeName || getName(t.accountId) || "N/A";
  }
  if (t.type === "payment_out") {
    return names[t.partyId] || names[t.staffId] || names[t.taxAccountId] || names[t.expenseAccountId] || names[t.toAccountId] || t.payeeName || getName(t.accountId) || "N/A";
  }
  if (t.type === "contra") return getName(t.toAccountId) || getName(t.fromAccountId);
  if (t.type === "direct_income") return getName(t.incomeAccountId);
  if (t.type === "direct_expense") return getName(t.toAccountId || t.expenseAccountId);
  if (t.type === "journal" && Array.isArray(t.entries)) {
    const parts = t.entries.slice(0, 2).map((e: any) => getName(e.accountId));
    return parts.join(", ") || "Journal";
  }
  if (t.type === "note") return getName(t.entityId);
  return t.narration || "";
};

const isStatusJournalOrNote = (t: any) =>
  t.type === "journal" || t.type === "note";

const isStatusJournalOrNoteOrContra = (t: any) =>
  t.type === "journal" || t.type === "note" || t.type === "contra";

/** context: on staff/group or tax ledger, Add Salary shows Paid/Unpaid/Partial/Overdue (like party), not "Journal". */
export const getStatusLabel = (t: any, context?: string) => {
  const isStaffContext = context === "staff" || context === "group";
  const isTaxContext = context === "tax" || context === "tax_group";
  const isAddSalary = t.type === "journal" && t.subType === "add_salary";
  
  // Always show real status for Add Salary transactions if paymentStatus exists
  if (isAddSalary) {
    const status = (t as any).paymentStatus;
    if (status === "paid") return "Paid";
    if (status === "unpaid") return "Unpaid";
    if (status === "partially_paid") return "Partial";
    if (status === "overdue" || (t as any).isOverdue) return "Overdue";
    // If no paymentStatus but has allocations, check payment status
    const allocations = (t.allocations as any[] | undefined) || [];
    const linkedFrom = (t.linkedFromVoucherNos as string[] | undefined) || [];
    const linkedTo = (t.linkedToVoucherNos as string[] | undefined) || [];
    if (allocations.length > 0 || linkedFrom.length > 0 || linkedTo.length > 0) {
      // Has payment links, check if fully paid
      const amount = Number(t.amount ?? t.total ?? t.debit ?? t.credit ?? 0) || 0;
      if (amount > 0) {
        const totalLinked = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
        if (totalLinked >= amount) return "Paid";
        if (totalLinked > 0) return "Partial";
      }
    }
    // Default to Unpaid if no payment status info
    return "Unpaid";
  }
  
  if (isStaffContext && (t.type === "payment_out" || t.type === "direct_expense")) {
    const amountPaid = Number(t.amount ?? t.total ?? 0) || 0;
    const allocations = (t.allocations as any[] | undefined) || [];
    const totalLinked = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
    if (amountPaid <= 0) return "Unpaid";
    if (totalLinked >= amountPaid) return "Paid";
    if (totalLinked > 0) return "Partial";
    return "Unpaid";
  }
  if (t.type === "contra") return "Contra";
  if (isStatusJournalOrNote(t)) return t.type === "journal" ? "Journal" : "Note";
  const status = (t as any).paymentStatus;
  if (status === "paid") return "Paid";
  if (status === "unpaid") return "Unpaid";
  if (status === "partially_paid") return "Partial";
  if (status === "overdue" || (t as any).isOverdue) return "Overdue";
  return "";
};

/** Days overdue (today - dueDate). Returns 0 if not overdue or no dueDate. */
const getOverdueDays = (t: any): number => {
  if (!(t.isOverdue || t.paymentStatus === "overdue")) return 0;
  const due = safeToDate(t.dueDate);
  if (!due) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueOnly = new Date(due);
  dueOnly.setHours(0, 0, 0, 0);
  if (today <= dueOnly) return 0;
  return differenceInDays(today, dueOnly);
};

/** Status detail: payment show "to PUR-1", purchase/sale show "from PYMT-7". More than one link => "Multi link". No link => "" (only Unpaid badge). */
export const getStatusDetail = (t: any) => {
  const from = (t.linkedFromVoucherNos as string[] | undefined) || [];
  const to = (t.linkedToVoucherNos as string[] | undefined) || [];
  if (from.length === 0 && to.length === 0) return "";
  const isPaymentOrDirect = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(t.type);
  const isSaleOrPurchase = t.type === "sale" || t.type === "purchase";
  const isAddSalary = t.type === "journal" && t.subType === "add_salary";
  if (isPaymentOrDirect) {
    if (to.length > 1) return "Multi link";
    return to.length ? `to ${to[0]}` : "";
  }
  if (isSaleOrPurchase || isAddSalary) {
    if (from.length > 1) return "Multi link";
    return from.length ? `from ${from[0]}` : "";
  }
  if (to.length > 1 || from.length > 1) return "Multi link";
  if (to.length) return `to ${to[0]}`;
  if (from.length) return `from ${from[0]}`;
  return "";
};

export const TransactionRow = React.memo(
  ({
    transaction,
    showNarration,
    userNames,
    journalAccountNames,
    accountNames,
    context,
    contextId,
    groupEntityType,
    stockView,
    displayUnit,
    item,
    onRowClick,
    onAddLink,
    onHistoryVoucher,
    onApproveVoucher,
    onRowSelect,
    isSelected,
    getDisplayValue,
    isTaxContext,
    isBalanceMasked,
    hideBalanceColumn,
    hideStatusColumn,
    visibleColumns,
    useOutstandingForBalance,
    isBillWise,
    ensureMinGaps = false,
    showFileColumn = false,
    isSpendWiseChild = false,
    isSpendWiseGroupFirst = false,
    isSpendWiseGroupLast = false,
    spendWiseRunningBalance,
    spendWiseGroupColorIndex,
        ? dateCols + 1 + 1 + (context === "daybook" ? 1 : 0) + (context === "item" ? 1 : 0) + (context !== "note" ? 1 : 0) + (showFileColumn ? 1 : 0) + 1 + 1

        : (showCol("date") ? dateCols : 0) +
          (showCol("type") ? 1 : 0) +
          (showCol("voucherNo") ? 1 : 0) +
          (context === "daybook" ? 1 : 0) +
          (context === "item" ? 1 : 0) +
          (showCol("user") && context !== "note" ? 1 : 0) +
          (showFileColumn ? 1 : 0) +

          (showCol("dr") ? 1 : 0) +
          (showCol("cr") ? 1 : 0);
    const statusDetailText = getStatusDetail(transaction);
    const showNarrationRow =
      showNarration &&
      (narrationText || (showCol("status") && !hideStatusColumn && statusDetailText));
    const spendWiseBorderLast = isSpendWiseGroupLast && !showNarrationRow && hasSpendWiseColor && cn(
      "[&>td]:border-b [&>td]:border-solid [&>td]:pb-1",
      !isSpendWiseGroupFirst && "[&>td]:border-t-0",
      swColor === "green" && "[&>td]:border-b-green-500 [&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td]:border-b-pink-500 [&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td]:border-b-blue-500 [&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l [&>td:last-child]:border-r",
      "[&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-br-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
    );
    const spendWiseBorderLastNarr = isSpendWiseGroupLast && showNarrationRow && hasSpendWiseColor && cn(
      "[&>td]:border-b-0 [&>td]:border-solid",
      !isSpendWiseGroupFirst && "[&>td]:border-t-0",
      swColor === "green" && "[&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l [&>td:last-child]:border-r"
    );
    const narrationColSpan = colsThroughCredit + (hideStatusColumn || !showCol("status") ? 1 : 0);
        layout={animateLayout ? "position" : false}
        initial={false}
        exit={{ transition: { duration: 0 } }}
        transition={
          isRowAnimationEnabled && animateLayout
            ? { duration: rowAnimationDuration, ease: "easeInOut" }
            : { duration: 0 }
        }
        style={isRowAnimationEnabled && animateLayout ? { isolation: "isolate", willChange: "transform" } : undefined}

        onClick={() => onRowSelect?.(transaction)}
        className={cn(
          "transaction-main-row min-h-[28px] cursor-pointer",
          isSpendWiseChild && "pl-6 text-sm [&>td]:py-1",
          isSpendWiseChild && !isSelected && "bg-muted/20 [&>td]:bg-muted/20",
          spendWiseMainInset,
          spendWiseBorderFirst,
          spendWiseBorderLast,
          spendWiseBorderLastNarr,
          spendWiseBorderMid,
          isNote && !isSelected && "bg-amber-50 [&>td]:bg-amber-50 hover:bg-amber-100 [&>td]:hover:bg-amber-100",
          isPaid && !isSelected && "opacity-75 bg-muted/20 [&>td]:bg-muted/20",
          isPendingApproval && !isSelected && "bg-pink-100 dark:bg-pink-950/40 [&>td]:bg-pink-100 [&>td]:dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50 [&>td]:hover:bg-pink-200 [&>td]:dark:hover:bg-pink-950/50 outline outline-1 outline-black/30 dark:outline-white/30 outline-offset-0",
          isSelected &&
            "[&>td]:!transition-none [&>td]:bg-primary/10 [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden",
          isSelected &&
            "[&>td]:[box-shadow:inset_0_2px_0_0_hsl(var(--primary))]",
          isSelected && !showNarrationRow && "[&>td]:[box-shadow:inset_0_2px_0_0_hsl(var(--primary)),inset_0_-2px_0_0_hsl(var(--primary))]",
          isSelected &&
            "[&>td:first-child]:[box-shadow:inset_2px_0_0_0_hsl(var(--primary)),inset_0_2px_0_0_hsl(var(--primary))]",
          isSelected && !showNarrationRow && "[&>td:first-child]:[box-shadow:inset_2px_0_0_0_hsl(var(--primary)),inset_0_2px_0_0_hsl(var(--primary)),inset_0_-2px_0_0_hsl(var(--primary))]",
          isSelected &&
            "[&>td:last-child]:[box-shadow:inset_-2px_0_0_0_hsl(var(--primary)),inset_0_2px_0_0_hsl(var(--primary))]",
          isSelected && !showNarrationRow && "[&>td:last-child]:[box-shadow:inset_-2px_0_0_0_hsl(var(--primary)),inset_0_2px_0_0_hsl(var(--primary)),inset_0_-2px_0_0_hsl(var(--primary))]",
          isSelected && !showNarrationRow && "[&>td:first-child]:rounded-tl-xl [&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-tr-xl [&>td:last-child]:rounded-br-xl",
          isSelected && showNarrationRow && "[&>td:first-child]:rounded-tl-xl [&>td:last-child]:rounded-tr-xl",
          showNarrationRow && isBillWise && "[&>td]:pb-0.5",
          !showNarrationRow && "md:[&>td]:pb-1",

          showNarration &&
            (narrationText || (!hideStatusColumn && getStatusDetail(transaction)))
            ? "border-b-0"
            : (isSpendWiseGroupFirst || isSpendWiseChild || isSpendWiseGroupLast)
              ? "border-b-0"
              : "border-b"
        )}
      >
        {mainRowContent}
      </motion.tr>
    );

    const isOverdueForSubRow = (() => {
      const lbl = getStatusLabel(transaction, context);
      return lbl === "Overdue" || (transaction as any).isOverdue || (transaction as any).paymentStatus === "overdue";
    })();
    const overdueDaysForSubRow = isOverdueForSubRow ? getOverdueDays(transaction) : 0;
    const subRowStatusText = [statusDetailText, overdueDaysForSubRow > 0 ? `${overdueDaysForSubRow} day${overdueDaysForSubRow === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
    const NarrationRow = showNarrationRow ? (
      <motion.tr
        layout={animateLayout ? "position" : false}
        initial={false}
        exit={{ transition: { duration: 0 } }}
        transition={
          isRowAnimationEnabled && animateLayout
            ? { duration: rowAnimationDuration, ease: "easeInOut" }
            : { duration: 0 }
        }
        style={isRowAnimationEnabled && animateLayout ? { isolation: "isolate", willChange: "transform" } : undefined}

        role="button"
        tabIndex={-1}
        onClick={() => onRowSelect?.(transaction)}
        className={cn(
          "narration-row border-b cursor-pointer",
          isBillWise && "-mt-1.5",
          spendWiseNarrInset,
          isSpendWiseGroupLast && cn(
            "[&>td]:border-b [&>td]:border-t-0 [&>td]:border-solid [&>td]:pb-0.5",
            swColor === "green" && "[&>td]:border-b-green-500 [&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
            swColor === "pink" && "[&>td]:border-b-pink-500 [&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
            swColor === "blue" && "[&>td]:border-b-blue-500 [&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
            "[&>td:first-child]:border-l [&>td:last-child]:border-r",
            "[&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-br-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
          ),
          (isSpendWiseGroupFirst || isSpendWiseChild) && !isSpendWiseGroupLast && cn(
            "[&>td]:border-t-0 [&>td]:border-b-0 [&>td]:border-solid",
            swColor === "green" && "[&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
            swColor === "pink" && "[&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
            swColor === "blue" && "[&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
            "[&>td:first-child]:border-l [&>td:last-child]:border-r"
          ),
          isPendingApproval && !isSelected && "bg-pink-100 dark:bg-pink-950/40 [&>td]:bg-pink-100 [&>td]:dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50 [&>td]:hover:bg-pink-200 [&>td]:dark:hover:bg-pink-950/50",
          isSelected
            ? "[&>td]:!transition-none [&>td]:bg-primary/10 [&>td]:[box-shadow:inset_0_-2px_0_0_hsl(var(--primary))] [&>td:first-child]:[box-shadow:inset_2px_0_0_0_hsl(var(--primary)),inset_0_-2px_0_0_hsl(var(--primary))] [&>td:last-child]:[box-shadow:inset_-2px_0_0_0_hsl(var(--primary)),inset_0_-2px_0_0_hsl(var(--primary))] [&>td:first-child]:rounded-bl-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:rounded-br-xl [&>td:last-child]:overflow-hidden"
            : isSpendWiseChild && "bg-muted/20 [&>td]:bg-muted/20",
          isNote && !isSelected && "bg-amber-50 hover:bg-amber-100 [&>td]:bg-amber-50 [&>td]:hover:bg-amber-100",
          isPaid && !isSelected && "opacity-75 bg-muted/20 [&>td]:bg-muted/20",
          !isSelected && !isPendingApproval && !isSpendWiseChild && !isNote && !isPaid && "hover:bg-muted/20 [&>td]:hover:bg-muted/20",
          "md:[&>td]:pb-1"
        )}
      >
        <TableCell
          colSpan={narrationFullColSpan}
          className={cn(
            "px-3 text-[11px] italic leading-tight align-top whitespace-normal break-words w-full min-w-0 overflow-hidden",
            isPendingApproval && !isSelected ? "text-pink-950 dark:text-pink-100" : "text-muted-foreground",
            isBillWise ? "pt-0.5 pb-0.5" : "py-0",
            inSpendWiseGroup && "pr-[10px]"
          )}
        >
          {narrationText || (isBillWise && subRowStatusText) ? (
            <span className="block min-w-0 overflow-hidden break-words" style={{ overflowWrap: "anywhere" }}>
              <span className="font-semibold not-italic">{narrationLabel}:</span> {narrationText || ""}
              {isBillWise && subRowStatusText ? (
                <span className={cn("ml-2 not-italic", isOverdueForSubRow && overdueDaysForSubRow > 0 ? "text-red-600 font-medium" : "text-muted-foreground")}>
                  ({subRowStatusText})
                </span>
              ) : null}
            </span>
          ) : null}
        </TableCell>
      </motion.tr>

    ) : null;

    return (
      <>
        {MainRow}
        {NarrationRow}
      </>
    );
  }
);
TransactionRow.displayName = "TransactionRow";

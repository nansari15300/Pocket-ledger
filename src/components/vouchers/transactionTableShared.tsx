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
  }: any) => {
    const isSpendWiseInGroup = isSpendWiseGroupFirst || isSpendWiseGroupLast || isSpendWiseChild || (transaction as any)._spendWiseGroupFirst;
    const hasSpendWiseColor = typeof spendWiseGroupColorIndex === "number";
    const swColor = hasSpendWiseColor && (spendWiseGroupColorIndex === 1 ? "green" : spendWiseGroupColorIndex === 2 ? "pink" : "blue");
    const spendWiseBorderFirst = isSpendWiseGroupFirst && hasSpendWiseColor && cn(
      "[&>td]:border-t [&>td]:border-b-0 [&>td]:border-solid",
      swColor === "green" && "[&>td]:border-t-green-500 [&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td]:border-t-pink-500 [&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td]:border-t-blue-500 [&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l [&>td:last-child]:border-r",
      "[&>td:first-child]:rounded-tl-xl [&>td:last-child]:rounded-tr-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
    );
    const spendWiseBorderMid = !isSpendWiseGroupFirst && !isSpendWiseGroupLast && isSpendWiseInGroup && hasSpendWiseColor && cn(
      "[&>td]:border-t-0 [&>td]:border-b-0 [&>td]:border-solid",
      swColor === "green" && "[&>td:first-child]:border-l-green-500 [&>td:last-child]:border-r-green-500",
      swColor === "pink" && "[&>td:first-child]:border-l-pink-500 [&>td:last-child]:border-r-pink-500",
      swColor === "blue" && "[&>td:first-child]:border-l-blue-500 [&>td:last-child]:border-r-blue-500",
      "[&>td:first-child]:border-l [&>td:last-child]:border-r"
    );
    const showCol = (key: string) => visibleColumns == null || visibleColumns[key] !== false;
    const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
    const { company } = useCompany();
    const { user, customUser } = useAuth();
    const currentUserUid = user?.uid ?? null;
    const currentUserDisplayName = customUser?.displayName || user?.displayName || user?.email || null;
    const { can } = usePermissions();
    const isNote = context === "note";
    const { settings: animationSettings } = useAnimationSettings();
    const isRowAnimationEnabled = animationSettings?.rows?.enabled === true;
    const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;

    const d = safeToDate(transaction.date);
    let debit = transaction.debit;
    let credit = transaction.credit;
    let balance = transaction.balance;
    if (typeof spendWiseRunningBalance === "number") balance = spendWiseRunningBalance;
    const spendWiseLinkedAmount = (transaction as any)._spendWiseLinkedAmount;
    if (isSpendWiseChild && typeof spendWiseLinkedAmount === "number" && spendWiseLinkedAmount > 0) {
      const isOutflow = (transaction.type === "payment_out" || transaction.type === "direct_expense") || (Number(transaction.credit) > 0);
      if (isOutflow) {
        debit = 0;
        credit = spendWiseLinkedAmount;
      } else {
        debit = spendWiseLinkedAmount;
        credit = 0;
      }
    }
    if (context === "item" && stockView === "qty" && item) {
      const factor = getConversionFactor(item, displayUnit);
      debit = debit / factor;
      credit = credit / factor;
      balance = balance / factor;
    }

    const formatBalanceCell = (value: number) => {
      const isItemQty = context === "item" && stockView === "qty";
      if (isItemQty)
        return `${formatQuantity(value)} ${displayUnit || ""}`;
      const absValue = Math.abs(value);
      const suffix = value >= 0 ? "Dr" : "Cr";
      return (
        <span className={cn("font-bold", value >= 0 ? "text-green-700" : "text-red-700")}>
          {formatCurrency(absValue, { noSuffix: true, context: "transaction" })} {suffix}
        </span>
      );
    };

    const getOutstandingBalanceDisplay = () => {
      const out = Number((transaction as any).outstanding) || 0;
      const isCreditSide = ["sale", "payment_in", "direct_income"].includes(transaction.type);
      const value = isCreditSide ? out : -out;
      return formatBalanceCell(value);
    };

    const formatAmountCell = (val: number) => {
      if (val === 0) return "-";
      if (context === "item" && stockView === "qty")
        return `${formatQuantity(val)} ${displayUnit || ""}`;
      return getDisplayValue(val);
    };

    // Show whatever user info is available for visible transaction rows.
    const resolvedUserName = userNames && transaction.userId ? userNames[transaction.userId] : null;
    const displayName =
      (resolvedUserName && resolvedUserName !== "Unknown" && resolvedUserName !== "N/A" ? resolvedUserName : null) ||
      transaction.userDisplayName ||
      transaction.userName ||
      (transaction.userId === currentUserUid ? (currentUserDisplayName || "You") : null) ||
      "N/A";
    const names = { ...journalAccountNames, ...userNames, ...(accountNames || {}) };

    const mainRowContent = (
      <>
        {showCol("date") &&
          (dateSystem === "Both" ? (
            <>
              <TableCell className={ensureMinGaps ? "min-w-[95px] px-[5px]" : undefined}>{d ? formatDateBS(d) : ""}</TableCell>
              <TableCell className={ensureMinGaps ? "min-w-[95px] px-[5px]" : undefined}>{d ? formatDate(d) : ""}</TableCell>
            </>
          ) : (
            <TableCell className={ensureMinGaps ? "min-w-[95px] px-[5px]" : undefined}>{d ? (dateSystem === "AD" ? formatDate(d) : formatDateBS(d)) : ""}</TableCell>
          ))}
        {showCol("type") && (
          <TableCell className={cn("align-middle", ensureMinGaps && "min-w-[75px] px-[5px]")}>
            <Badge variant="outline" className="inline-flex h-6 items-center rounded-xl px-2.5 font-medium">
              {getDisplayType(transaction)}
            </Badge>
          </TableCell>
        )}
        {showCol("voucherNo") && <TableCell className={ensureMinGaps ? "min-w-[105px] px-[5px]" : undefined}>{transaction.voucherNumber}</TableCell>}
        {context === "daybook" && (
          <TableCell className="max-w-[200px] truncate">
            {getParticularsText(transaction, names)}
          </TableCell>
        )}
        {context === "item" && (
          <TableCell className="max-w-[180px] truncate text-muted-foreground">
            {getOppositeAccountLabel(transaction, names, context, contextId, groupEntityType)}
          </TableCell>
        )}
        {showCol("user") && context !== "note" && <TableCell className={ensureMinGaps ? "min-w-[85px] px-[5px]" : undefined}>{displayName}</TableCell>}
        {showFileColumn && (
          <TableCell className={cn("text-center", ensureMinGaps && "min-w-[44px] px-[5px]")}>
            {Array.isArray(transaction.fileUrls) && transaction.fileUrls.length > 0 ? (
              <CheckCircle className="h-4 w-4 text-green-600 inline" aria-label="Has attachment" />
            ) : (
              "-"
            )}
          </TableCell>
        )}
        {showCol("dr") && (
          <TableCell className={cn("text-right text-green-600", ensureMinGaps && "min-w-[100px] px-[5px]")}>{formatAmountCell(debit)}</TableCell>
        )}
        {showCol("cr") && (
          <TableCell className={cn("text-right text-red-600", ensureMinGaps && "min-w-[100px] px-[5px]")}>{formatAmountCell(credit)}</TableCell>
        )}
        {showCol("status") && !hideStatusColumn &&
          (() => {
            const isDashboardAddSalary =
              context === "daybook" &&
              transaction.type === "journal" &&
              transaction.subType === "add_salary";
            const statusLabel = isDashboardAddSalary ? "Salary" : getStatusLabel(transaction, context);
            const useNeutralBadge = ["Journal", "Note", "Contra", "Salary"].includes(statusLabel);
            const paidByLabel = statusLabel === "Paid";
            const unpaidByLabel = statusLabel === "Partial" || statusLabel === "Unpaid";
            const statusDetailText = getStatusDetail(transaction);
            const isOverdueRow = statusLabel === "Overdue" || (transaction as any).isOverdue || (transaction as any).paymentStatus === "overdue";
            const overdueDays = isOverdueRow ? getOverdueDays(transaction) : 0;
            return (
              <TableCell className={cn("text-center", isBillWise ? "align-middle" : "align-baseline", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                <div className={cn("flex items-center justify-center gap-[1px] leading-tight", !isBillWise && "flex-col")}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "inline-flex h-[22px] font-semibold shrink-0",
                      useNeutralBadge
                        ? "text-muted-foreground border-muted-foreground/40"
                        : paidByLabel || (transaction as any).paymentStatus === "paid"
                          ? "text-green-600 border-green-600/50"
                          : unpaidByLabel ||
                              (transaction as any).paymentStatus === "unpaid" ||
                              (transaction as any).paymentStatus === "partially_paid" ||
                              (transaction as any).isOverdue ||
                              (transaction as any).paymentStatus === "overdue"
                            ? "text-red-600 border-red-600/50"
                            : "text-muted-foreground"
                    )}
                  >
                    {statusLabel || "-"}
                  </Badge>
                  {!isBillWise && statusDetailText && (
                    <span className="text-[10px] text-muted-foreground">{statusDetailText}</span>
                  )}
                  {!isBillWise && isOverdueRow && overdueDays > 0 && (
                    <span className="text-[10px] text-red-600 font-medium">{overdueDays} {overdueDays === 1 ? "day" : "days"}</span>
                  )}
                </div>
              </TableCell>
            );
          })()}
        {showCol("runningBalance") && !hideBalanceColumn &&
          (() => {
            const out = Number((transaction as any).outstanding) || 0;
            const isCreditSide = ["sale", "payment_in", "direct_income"].includes(transaction.type);
            const isStaffPaymentOut = (context === "staff" || context === "group") && (transaction.type === "payment_out" || transaction.type === "direct_expense");
            const displayValue = useOutstandingForBalance
              ? (isTaxContext ? (isCreditSide ? out : -out) : (isStaffPaymentOut ? out : (isCreditSide ? out : -out)))
              : balance;
            return (
              <TableCell
                className={cn(
                  "text-right font-semibold",
                  displayValue >= 0 ? "text-green-600" : "text-red-600",
                  ensureMinGaps && "min-w-[115px] px-[5px]"
                )}
              >
                {isBalanceMasked
                  ? "*****"
                  : useOutstandingForBalance
                    ? formatBalanceCell(displayValue)
                    : formatBalanceCell(balance)}
              </TableCell>
            );
          })()}
        <TableCell
          className="w-10 p-1 text-center align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {(() => {
                const isSalePurchase = ["sale", "purchase", "sale_service", "purchase_service"].includes(transaction.type);
                const isPaymentLinkable = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(transaction.type);
                const showAddLink = can('add_link') && onAddLink && (
                  (isSalePurchase || isPaymentLinkable) &&
                  (context === "party" || context === "staff" || !!transaction.partyId || !!transaction.staffId)
                );
                return showAddLink ? (
                  <DropdownMenuItem onClick={() => onAddLink?.(transaction)} className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" />
                    Add Link
                  </DropdownMenuItem>
                ) : null;
              })()}
              {can("approve_transactions") &&
                company?.notificationSettings?.approve?.on !== false &&
                company?.notificationSettings?.approve?.onTransaction !== false &&
                (transaction as any).isApproved !== true && (
                  <DropdownMenuItem onClick={() => onApproveVoucher?.(transaction)} className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Approve
                  </DropdownMenuItem>
                )}
              <DropdownMenuItem onClick={() => onRowClick?.(transaction)} className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              {can('view_voucher_history') && onHistoryVoucher && (
                <DropdownMenuItem onClick={() => onHistoryVoucher?.(transaction)} className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  History
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </>
    );

    const isPaid = (transaction as any).paymentStatus === "paid";
    const isPendingApproval = (transaction as any).isApproved !== true;
    const narrationText =
      transaction.type === "note" ? transaction.title : transaction.narration;
    const narrationLabel = transaction.type === "note" ? "Title" : "Narration";
    const dateCols = dateSystem === "Both" ? 2 : 1;
    const colsThroughCredit =
      visibleColumns == null
        ? dateCols + 1 + 1 + (context === "daybook" ? 1 : 0) + (context !== "note" ? 1 : 0) + 1 + 1
        : (showCol("date") ? dateCols : 0) +
          (showCol("type") ? 1 : 0) +
          (showCol("voucherNo") ? 1 : 0) +
          (context === "daybook" ? 1 : 0) +
          (showCol("user") && context !== "note" ? 1 : 0) +
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

    const inSpendWiseGroup = hasSpendWiseColor && (isSpendWiseGroupFirst || isSpendWiseGroupLast || isSpendWiseChild);
    const spendWiseMainInset = inSpendWiseGroup && cn(
      "[&>td:first-child]:pl-[6px] [&>td:last-child]:pr-[6px]",
      isSpendWiseGroupFirst && "[&>td]:pt-[6px]",
      isSpendWiseGroupLast && !showNarrationRow && "[&>td]:pb-[6px]",
      !isSpendWiseGroupFirst && "[&>td]:pt-[3px]"
    );
    const spendWiseNarrInset = inSpendWiseGroup && cn(
      "[&>td:first-child]:pl-[6px] [&>td:last-child]:pr-[6px]",
      isSpendWiseGroupLast && "[&>td]:pb-[6px]",
      !isSpendWiseGroupLast && "[&>td]:pb-[3px]"
    );

    const MainRow = (
      <motion.tr
        initial={{ opacity: 0, y: isRowAnimationEnabled ? 8 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: isRowAnimationEnabled ? -8 : 0 }}
        transition={{
          duration: isRowAnimationEnabled ? rowAnimationDuration : 0,
          ease: "easeOut",
        }}
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
            "[&>td]:bg-primary/10 [&>td]:border-t-2 [&>td]:border-primary [&>td:first-child]:border-l-2 [&>td:first-child]:border-primary [&>td:first-child]:overflow-hidden [&>td:last-child]:border-r-2 [&>td:last-child]:border-primary [&>td:last-child]:overflow-hidden",
          isSelected && !showNarrationRow && "[&>td]:border-b-2 [&>td]:border-b-primary [&>td:first-child]:rounded-tl-xl [&>td:first-child]:rounded-bl-xl [&>td:last-child]:rounded-tr-xl [&>td:last-child]:rounded-br-xl",
          isSelected && showNarrationRow && "[&>td]:border-b-0 [&>td:first-child]:rounded-tl-xl [&>td:last-child]:rounded-tr-xl",
          showNarrationRow && isBillWise && "[&>td]:pb-0.5",
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
      <tr
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
            ? "[&>td]:bg-primary/10 [&>td]:border-t-0 [&>td]:border-b-2 [&>td]:border-primary [&>td:first-child]:border-l-2 [&>td:first-child]:border-primary [&>td:first-child]:rounded-bl-xl [&>td:first-child]:overflow-hidden [&>td:last-child]:border-r-2 [&>td:last-child]:border-primary [&>td:last-child]:rounded-br-xl [&>td:last-child]:overflow-hidden"
            : isSpendWiseChild && "bg-muted/20 [&>td]:bg-muted/20",
          isNote && !isSelected && "bg-amber-50 hover:bg-amber-100 [&>td]:bg-amber-50 [&>td]:hover:bg-amber-100",
          isPaid && !isSelected && "opacity-75 bg-muted/20 [&>td]:bg-muted/20",
          !isSelected && !isPendingApproval && !isSpendWiseChild && !isNote && !isPaid && "hover:bg-muted/20 [&>td]:hover:bg-muted/20"
        )}
      >
        <TableCell
          colSpan={narrationColSpan}
          className={cn("px-3 text-[11px] italic text-muted-foreground leading-tight align-top whitespace-normal break-words w-full", isBillWise ? "pt-0.5 pb-0.5" : "py-0")}
        >
          {narrationText ? (
            <span>
              <span className="font-semibold not-italic">{narrationLabel}:</span> {narrationText}
            </span>
          ) : null}
        </TableCell>
        {showCol("status") && !hideStatusColumn && (
          <TableCell className={cn("py-0 px-2 text-[10px] whitespace-nowrap text-center leading-tight", isBillWise ? "pt-0.5 pb-0.5 align-top" : "py-0 align-top", isBillWise && subRowStatusText && "text-muted-foreground", isBillWise && isOverdueForSubRow && overdueDaysForSubRow > 0 && "text-red-600 font-medium")}>
            {isBillWise ? subRowStatusText : ""}
          </TableCell>
        )}
        {showCol("runningBalance") && !hideBalanceColumn && <TableCell className="py-0 w-10 p-0" />}
        <TableCell className="py-0 w-10 p-0" />
      </tr>
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

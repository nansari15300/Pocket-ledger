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
  getAllocationTotal,
  OPENING_BALANCE_VOUCHER_ID,
} from "@/lib/payment-allocation-utils";
import { getInterCompanyEntityBillWiseAmount } from "@/lib/interCompany/interCompanyLedgerAmounts";

const safeToDate = (date: unknown): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof (date as { toDate?: () => Date })?.toDate === "function")
    return (date as { toDate: () => Date }).toDate();
  const parsed = new Date(date as string | number);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// Keep party bill-wise journal linking consistent by deriving party-side debit/credit from journal entries.
const getJournalPartyAmount = (voucher: any, partyId: string) => {
  if (voucher?.type !== "journal" || !Array.isArray(voucher?.entries)) return null;
  const partyEntry = voucher.entries.find((e: any) => String(e?.accountId ?? "") === String(partyId));
  if (!partyEntry) return null;
  const debit = Number((partyEntry as any)?.debit) || 0;
  const credit = Number((partyEntry as any)?.credit) || 0;
  const total = debit > 0 ? debit : credit;
  if (total <= 0) return null;
  return { debit, credit, total };
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
  /** Bill-wise ledger: opening row par jo remaining linkable hai — Journal link dialog me OB row ke liye. */
  partyOpeningBalanceOutstanding?: number;
  /** Ledger books opening signed (Dr + / Cr −) — Journal link me master lookup miss par fallback. */
  ledgerBooksOpeningBalanceSigned?: number;
  /** When set (e.g. from Journal form), use this as dialog title instead of "Link Payment In/Out to Txns". */
  dialogTitle?: string;
  /** When true (Journal link dialog): Other Linked = sum from opposite-side vouchers only. Dr rows ← Cr sources; Cr rows ← Dr sources. */
  isJournalLinkDialog?: boolean;
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
  partyOpeningBalanceOutstanding,
  ledgerBooksOpeningBalanceSigned,
  dialogTitle: dialogTitleOverride,
  isJournalLinkDialog = false,
  onDone,
}: LinkPaymentToTxnsDialogProps) {
  const { vouchers, vouchersAll, processedPartiesForSelection, processedParties, processedStaff } = useVouchers();
  const vouchersForAllocations = (vouchersAll && vouchersAll.length > 0) ? vouchersAll : (vouchers || []);
  const { formatDate, formatDateBS, formatCurrency, dateSystem } = useDate();
  const isMobile = useIsMobile();
  const effectiveAccountId = accountId ?? null;
  const accountIdStr = effectiveAccountId ? String(effectiveAccountId) : "";


  const isOut = variant === "payment_out";
  // Prevent self-link: when Journal opens this dialog, same voucher must never appear in From list.
  const currentVoucherIdStr = String(paymentInId ?? paymentOutId ?? "");

  // Journal link: partyId = jis account ki line link ho rahi — usi ka books opening (Dr + / Cr −) master se dhoondo.
  const accountBooksOpeningSigned = useMemo(() => {
    if (!partyId) return 0;
    const id = String(partyId);
    const asNum = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const ledger = asNum(ledgerBooksOpeningBalanceSigned);
    if (Math.abs(ledger) > 1e-6) return ledger;
    const prop = asNum(partyOpeningBalance);
    if (Math.abs(prop) > 1e-6) return prop;
    const party =
      (processedPartiesForSelection || []).find((p) => String(p.id) === id) ||
      (processedParties || []).find((p) => String(p.id) === id);
    if (party) return asNum(party.openingBalance);
    const staffRow = (processedStaff || []).find((s) => String(s.id) === id);
    if (staffRow) return asNum(staffRow.openingBalance);
    return 0;
  }, [
    partyId,
    ledgerBooksOpeningBalanceSigned,
    partyOpeningBalance,
    processedPartiesForSelection,
    processedParties,
    processedStaff,
  ]);

  const partyOB = isJournalLinkDialog
    ? accountBooksOpeningSigned
    : Number.isFinite(Number(partyOpeningBalance))
      ? Number(partyOpeningBalance)
      : 0;

  // Total consumed from Opening Balance: (1) Payment In/Out + (2) Sale/Purchase openingBalanceAllocated + (3) Journal allocations to OB (same party). Use vouchersForAllocations so OB Dr/Cr both track correctly.
  const totalConsumedFromOB = useMemo(() => {
    if (!partyId || !vouchersForAllocations?.length) return 0;
    const partyIdStr = String(partyId);
    const voucherTouchesParty = (v: any) =>
      String((v as any)?.partyId ?? "") === partyIdStr ||
      (Array.isArray((v as any)?.entries) && (v as any).entries.some((e: any) => String(e?.accountId ?? "") === partyIdStr));
    let fromPayments = 0;
    // Journal link: Dr OB ← payment_in; Cr OB ← payment_out (variant se independent, Dr→Cr jaisa mirror).
    const payType = isJournalLinkDialog
      ? partyOB > 0
        ? ["payment_in", "direct_income"]
        : partyOB < 0
          ? ["payment_out", "direct_expense"]
          : isOut
            ? ["payment_out", "direct_expense"]
            : ["payment_in", "direct_income"]
      : isOut
        ? ["payment_out", "direct_expense"]
        : ["payment_in", "direct_income"];
    (vouchersForAllocations as any[]).forEach((v) => {
      if (!payType.includes(v.type) || String((v as any).partyId ?? "") !== partyIdStr) return;
      const allocs = (v.allocations as Allocation[] | undefined) || [];
      allocs.forEach((a) => {
        if (String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID) fromPayments += getAllocationTotal(a);
      });
    });
    const fromBillwise = (vouchersForAllocations as any[]).reduce((sum, v) => {
      if (v.type !== "sale" && v.type !== "sale_service" && v.type !== "purchase" && v.type !== "purchase_service") return sum;
      if (String((v as any).partyId ?? "") !== partyIdStr) return sum;
      return sum + (Number((v as any).openingBalanceAllocated) || 0);
    }, 0);
    const fromJournals = (vouchersForAllocations as any[]).reduce((sum, v) => {
      if (v.type !== "journal" || !voucherTouchesParty(v)) return sum;
      const allocs = (v.allocations as Allocation[] | undefined) || [];
      return sum + allocs
        .filter((a) => String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID && (!(a as any).linkedAccountId || String((a as any).linkedAccountId) === partyIdStr))
        .reduce((s, a) => s + getAllocationTotal(a), 0);
    }, 0);
    return fromPayments + fromBillwise + fromJournals;
  }, [partyId, isOut, vouchersForAllocations, isJournalLinkDialog, partyOB]);

  const showOBInPaymentIn = partyOB > 0;
  const showOBInPaymentOut = partyOB < 0;
  const obAmount = partyOB > 0 ? partyOB : Math.abs(partyOB);
  const obOutstandingIn = Math.max(0, obAmount - totalConsumedFromOB);
  const obOutstanding = isOut ? (showOBInPaymentOut ? obOutstandingIn : 0) : (showOBInPaymentIn ? obOutstandingIn : 0);
  // Current voucher's allocation to OB — exclude from "Other Linked" so edit mode doesn't double-count.
  const currentVoucherAllocToOB = useMemo(() => {
    if (!currentVoucherIdStr || !vouchers?.length) return 0;
    const v = (vouchers as any[]).find((x: any) => String(x?.id ?? "") === currentVoucherIdStr);
    if (!v) return 0;
    const allocs = (v.allocations as Allocation[] | undefined) || [];
    return allocs
      .filter((a) => a.voucherId === OPENING_BALANCE_VOUCHER_ID)
      .reduce((s, a) => s + getAllocationTotal(a), 0);
  }, [currentVoucherIdStr, vouchers]);
  const obAllocatedToOthers = Math.max(0, totalConsumedFromOB - currentVoucherAllocToOB);
  // Remaining linkable: bill-wise prop > 0 ho to wahi, warna isi account ke consumed se calc.
  const effectiveObRemaining =
    typeof partyOpeningBalanceOutstanding === "number" && partyOpeningBalanceOutstanding > 0
      ? partyOpeningBalanceOutstanding
      : obOutstandingIn;
  const billWiseObRemaining =
    effectiveObRemaining > 0 ? effectiveObRemaining : null;
  const openingBalanceRowOutstanding = (_side: "payment_in" | "payment_out") => {
    if (effectiveObRemaining > 0) {
      return Math.max(0, effectiveObRemaining + currentVoucherAllocToOB);
    }
    return Math.max(0, obAmount - obAllocatedToOthers);
  };
  /**
   * Book Opening / OB: sirf jab linkable > 0, ya current voucher pe pehle se link ho
   * (edit me unlink ke liye). Linkable 0 + koi current link nahi → list me mat dikhao.
   */
  const shouldIncludeOpeningBalanceRow = (
    side: "payment_in" | "payment_out",
    hasExisting: (id: string) => boolean
  ) => {
    if (hasExisting(OPENING_BALANCE_VOUCHER_ID)) return true;
    if (openingBalanceRowOutstanding(side) <= 0) return false;
    if (isJournalLinkDialog) {
      // Cr OB → Cr list (payment_out); Dr OB → Dr list (payment_in)
      if (side === "payment_out") return partyOB < 0 || partyOB === 0;
      return partyOB > 0 || partyOB === 0;
    }
    const showSide = side === "payment_out" ? showOBInPaymentOut : showOBInPaymentIn;
    return showSide;
  };
  // Amount column: books opening gross; linkable alag column.
  const openingBalanceGrossTotal = (_side: "payment_in" | "payment_out") => {
    if (obAmount > 0) return obAmount;
    const outstanding = openingBalanceRowOutstanding(_side);
    return Math.max(obAmount, outstanding + obAllocatedToOthers, outstanding);
  };
  const openingBalanceRowLabel = isJournalLinkDialog ? ("Book Opening" as const) : ("Opening Balance" as const);

  // Payment In links to Sales (same party) and Payment Outs (contra). Show Opening Balance when OB is Dr (> 0).
  const combinedInList = useMemo(() => {
    if (variant !== "payment_in" || !vouchers?.length || !partyId) return [];
    // Match party by explicit partyId OR by journal entry account id so manual journals become linkable.
    const voucherTouchesParty = (v: any) =>
      String((v as any)?.partyId ?? "") === String(partyId) ||
      (Array.isArray((v as any)?.entries) &&
        (v as any).entries.some((e: any) => String(e?.accountId ?? "") === String(partyId)));
    // Reusable guard so current voucher (edit context) never becomes a source row for itself.
    const isCurrentVoucher = (v: any) => currentVoucherIdStr && String((v as any)?.id ?? "") === currentVoucherIdStr;
    const paymentInVouchers = (vouchersForAllocations as any[]).filter(
      (v) => (v.type === "payment_in" || v.type === "direct_income") && !isCurrentVoucher(v)
    );
    const allocatedByPaymentIns = getAllocatedByVoucherId(paymentInVouchers);
    const allocatedByBillWiseVouchers = (() => {
      const m = new Map<string, number>();
      for (const v of vouchersForAllocations as any[]) {
        if (isCurrentVoucher(v)) continue;
        if (
          v.type !== "sale" &&
          v.type !== "sale_service" &&
          v.type !== "purchase" &&
          v.type !== "purchase_service" &&
          v.type !== "journal" &&
          v.type !== "inter_company"
        ) continue;
        const allocations = (v.allocations as Allocation[] | undefined) || [];
        for (const a of allocations) {
          const key = String(a.voucherId ?? "");
          if (!key) continue;
          m.set(key, (m.get(key) ?? 0) + getAllocationTotal(a));
        }
      }
      return m;
    })();
    const totalAllocatedTo = (vid: string) => (allocatedByPaymentIns.get(String(vid)) ?? 0) + (allocatedByBillWiseVouchers.get(String(vid)) ?? 0);
    const getFreshTarget = (v: any) => (vouchersForAllocations as any[]).find((x: any) => String(x?.id ?? "") === String(v?.id ?? "")) ?? v;
    // Other Linked = target ke allocations ka sum (OB, JRNL, Sale, Pur, etc. sab) — multi-linked amount sahi aaye.
    const getAllocatedToOthersFromTarget = (targetVoucher: any, vid: string): number => {
      const fromTarget = (targetVoucher?.allocations as Allocation[] | undefined) || [];
      const targetSum = fromTarget.reduce((sum, a) => {
        const srcId = String(a.voucherId ?? "");
        if (!srcId || srcId === currentVoucherIdStr) return sum;
        if (partyId && (a as any).linkedAccountId && String((a as any).linkedAccountId) !== String(partyId)) return sum;
        return sum + getAllocationTotal(a);
      }, 0);
      const sourceSum = totalAllocatedTo(vid);
      const obInAllocations = fromTarget
        .filter((a) => String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID)
        .reduce((s, a) => s + getAllocationTotal(a), 0);
      const targetObAlloc = Math.max(0, (Number(targetVoucher?.openingBalanceAllocated) || 0) - obInAllocations);
      return Math.max(targetSum, sourceSum) + targetObAlloc;
    };
    const hasExistingAlloc = (id: string) => existingAllocations.some((a) => a.voucherId === id && getAllocationTotal(a) > 0);
    const salesForParty = (vouchers as any[]).filter(
      (v) =>
        !isCurrentVoucher(v) &&
        (v.type === "sale" || v.type === "sale_service") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const sales = salesForParty.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocatedToOthers = getAllocatedToOthersFromTarget(getFreshTarget(v), v.id);
      // Linkable = Amount - Other Linked; table shows (outstanding - linked) where linked includes Current Link
      const outstanding = Math.max(0, total - allocatedToOthers);
      return {
        id: v.id,
        date: v.date,
        type: "Sale" as const,
        refNo: v.invoiceNumber ?? v.voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers,
      };
    });
    // Show only linkable (outstanding > 0) or already selected rows.
    const salesFiltered = sales.filter((s) => s.outstanding > 0 || hasExistingAlloc(s.id));
    const paymentOutsForParty = (vouchers as any[]).filter(
      (v) =>
        !isCurrentVoucher(v) &&
        (v.type === "payment_out" || v.type === "direct_expense") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const paymentOuts = paymentOutsForParty.map((v) => {
      const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
      const allocatedToOthers = getAllocatedToOthersFromTarget(getFreshTarget(v), v.id);
      const outstanding = Math.max(0, total - allocatedToOthers);
      return {
        id: v.id,
        date: v.date,
        type: "Payment Out" as const,
        refNo: (v as any).voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers,
      };
    });
    const paymentOutsFiltered = paymentOuts.filter((p) => p.outstanding > 0 || hasExistingAlloc(p.id));
    // Payment In should link against Dr-side journals for the same party.
    const journalDrRows = (vouchers as any[])
      .filter((v) => {
        if (isCurrentVoucher(v) || v.type !== "journal") return false;
        if (!isJournalLinkDialog) return voucherTouchesParty(v);
        // Journal bill-wise: sirf jahan is party ki Dr entry ho — Cr-only ya counterparty lines exclude.
        const partyAmount = getJournalPartyAmount(v, String(partyId));
        return !!partyAmount && partyAmount.debit > 0;
      })
      .map((v) => {
        const partyAmount = getJournalPartyAmount(v, String(partyId));
        if (!partyAmount || partyAmount.debit <= 0) return null;
        const allocatedToOthers = getAllocatedToOthersFromTarget(getFreshTarget(v), v.id);
        const outstanding = Math.max(0, partyAmount.total - allocatedToOthers);
        return {
          id: v.id,
          date: v.date,
          type: "Journal (Dr)" as const,
          refNo: (v as any).voucherNumber ?? "—",
          total: partyAmount.total,
          outstanding,
          allocatedToOthers,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
    const journalsDrFiltered = journalDrRows.filter((j) => j.outstanding > 0 || hasExistingAlloc(j.id));
    // Cr source (Payment In / Journal Cr) → Dr IC vouchers same party.
    const icDrRows = (vouchers as any[])
      .filter((v) => !isCurrentVoucher(v) && v.type === "inter_company")
      .map((v) => {
        const partyAmount = getInterCompanyEntityBillWiseAmount(v, String(partyId), "party");
        if (!partyAmount || partyAmount.debit <= 0) return null;
        const allocatedToOthers = getAllocatedToOthersFromTarget(getFreshTarget(v), v.id);
        const outstanding = Math.max(0, partyAmount.total - allocatedToOthers);
        return {
          id: v.id,
          date: v.date,
          type: "Inter Company (Dr)" as const,
          refNo: (v as any).voucherNumber ?? "—",
          total: partyAmount.total,
          outstanding,
          allocatedToOthers,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
    const icDrFiltered = icDrRows.filter((j) => j.outstanding > 0 || hasExistingAlloc(j.id));
    const byDate = (a: { date: unknown }, b: { date: unknown }) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    };
    salesFiltered.sort(byDate);
    paymentOutsFiltered.sort(byDate);
    const ob = shouldIncludeOpeningBalanceRow("payment_in", hasExistingAlloc) ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      date: null,
      type: openingBalanceRowLabel,
      refNo: "—",
      total: openingBalanceGrossTotal("payment_in"),
      outstanding: openingBalanceRowOutstanding("payment_in"),
      allocatedToOthers: obAllocatedToOthers,
    }] : [];
    const combined = [...ob, ...salesFiltered, ...paymentOutsFiltered, ...journalsDrFiltered, ...icDrFiltered];
    combined.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
    return combined;
  }, [variant, effectiveAccountId, accountIdStr, partyId, vouchers, vouchersForAllocations, partyOB, showOBInPaymentIn, obOutstandingIn, totalConsumedFromOB, obAllocatedToOthers, obAmount, existingAllocations, currentVoucherIdStr, isJournalLinkDialog, partyOpeningBalanceOutstanding, currentVoucherAllocToOB, billWiseObRemaining]);

  // Payment Out links to Purchases (same party) and Payment Ins (contra). Show Opening Balance when OB is Cr (< 0).
  const combinedOutList = useMemo(() => {
    if (variant !== "payment_out" || !vouchers?.length || !partyId) return [];
    // Match party by explicit partyId OR by journal entry account id so manual journals become linkable.
    const voucherTouchesParty = (v: any) =>
      String((v as any)?.partyId ?? "") === String(partyId) ||
      (Array.isArray((v as any)?.entries) &&
        (v as any).entries.some((e: any) => String(e?.accountId ?? "") === String(partyId)));
    // Reusable guard so current voucher (edit context) never becomes a source row for itself.
    const isCurrentVoucher = (v: any) => currentVoucherIdStr && String((v as any)?.id ?? "") === currentVoucherIdStr;
    const hasExistingAllocOut = (id: string) => existingAllocations.some((a) => a.voucherId === id && getAllocationTotal(a) > 0);
    const paymentOutVouchers = (vouchersForAllocations as any[]).filter(
      (v) => (v.type === "payment_out" || v.type === "direct_expense") && !isCurrentVoucher(v)
    );
    const paymentInVouchersOut = (vouchersForAllocations as any[]).filter(
      (v) => (v.type === "payment_in" || v.type === "direct_income") && !isCurrentVoucher(v)
    );
    const allocatedByPaymentOuts = getAllocatedByVoucherIdFromPaymentOuts(paymentOutVouchers);
    const allocatedByPaymentInsOut = getAllocatedByVoucherId(paymentInVouchersOut);
    const allocatedByBillWiseVouchers = (() => {
      const m = new Map<string, number>();
      for (const v of vouchersForAllocations as any[]) {
        if (isCurrentVoucher(v)) continue;
        if (
          v.type !== "sale" &&
          v.type !== "sale_service" &&
          v.type !== "purchase" &&
          v.type !== "purchase_service" &&
          v.type !== "journal" &&
          v.type !== "inter_company"
        ) continue;
        const allocations = (v.allocations as Allocation[] | undefined) || [];
        for (const a of allocations) {
          const key = String(a.voucherId ?? "");
          if (!key) continue;
          m.set(key, (m.get(key) ?? 0) + getAllocationTotal(a));
        }
      }
      return m;
    })();
    const totalAllocatedToOut = (vid: string) =>
      (allocatedByPaymentOuts.get(String(vid)) ?? 0) +
      (allocatedByPaymentInsOut.get(String(vid)) ?? 0) +
      (allocatedByBillWiseVouchers.get(String(vid)) ?? 0);
    const getFreshTargetOut = (v: any) => (vouchersForAllocations as any[]).find((x: any) => String(x?.id ?? "") === String(v?.id ?? "")) ?? v;
    // Other Linked = target ke allocations ka sum (OB, JRNL, Sale, Pur, etc. sab) — multi-linked amount sahi aaye.
    const getAllocatedToOthersFromTargetOut = (targetVoucher: any, vid: string): number => {
      const fromTarget = (targetVoucher?.allocations as Allocation[] | undefined) || [];
      const targetSum = fromTarget.reduce((sum, a) => {
        const srcId = String(a.voucherId ?? "");
        if (!srcId || srcId === currentVoucherIdStr) return sum;
        if (partyId && (a as any).linkedAccountId && String((a as any).linkedAccountId) !== String(partyId)) return sum;
        return sum + getAllocationTotal(a);
      }, 0);
      const sourceSum = totalAllocatedToOut(vid);
      const obInAllocations = fromTarget
        .filter((a) => String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID)
        .reduce((s, a) => s + getAllocationTotal(a), 0);
      const targetObAlloc = Math.max(0, (Number(targetVoucher?.openingBalanceAllocated) || 0) - obInAllocations);
      return Math.max(targetSum, sourceSum) + targetObAlloc;
    };
    const purchasesForParty = (vouchers as any[]).filter(
      (v) =>
        !isCurrentVoucher(v) &&
        (v.type === "purchase" || v.type === "purchase_service") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const purchases = purchasesForParty.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocatedToOthers = getAllocatedToOthersFromTargetOut(getFreshTargetOut(v), v.id);
      const outstanding = Math.max(0, total - allocatedToOthers);
      return {
        id: v.id,
        date: v.date,
        type: "Purchase" as const,
        refNo: (v as any).invoiceNumber ?? v.voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers,
      };
    });
    // Show only linkable (outstanding > 0) or already selected rows.
    const purchasesFiltered = purchases.filter((p) => p.outstanding > 0 || hasExistingAllocOut(p.id));
    const paymentInsForParty = (vouchers as any[]).filter(
      (v) =>
        !isCurrentVoucher(v) &&
        (v.type === "payment_in" || v.type === "direct_income") &&
        String((v as any).partyId ?? "") === String(partyId)
    );
    const paymentIns = paymentInsForParty.map((v) => {
      const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
      const allocatedToOthers = getAllocatedToOthersFromTargetOut(getFreshTargetOut(v), v.id);
      const outstanding = Math.max(0, total - allocatedToOthers);
      return {
        id: v.id,
        date: v.date,
        type: "Payment In" as const,
        refNo: (v as any).voucherNumber ?? "—",
        total,
        outstanding,
        allocatedToOthers,
      };
    });
    const paymentInsFiltered = paymentIns.filter((p) => p.outstanding > 0 || hasExistingAllocOut(p.id));
    // Payment Out should link against Cr-side journals for the same party.
    const journalCrRows = (vouchers as any[])
      .filter((v) => {
        if (isCurrentVoucher(v) || v.type !== "journal") return false;
        if (!isJournalLinkDialog) return voucherTouchesParty(v);
        // Journal bill-wise: sirf jahan is party ki Cr entry ho — Dr-only ya counterparty lines exclude.
        const partyAmount = getJournalPartyAmount(v, String(partyId));
        return !!partyAmount && partyAmount.credit > 0;
      })
      .map((v) => {
        const partyAmount = getJournalPartyAmount(v, String(partyId));
        if (!partyAmount || partyAmount.credit <= 0) return null;
        const allocatedToOthers = getAllocatedToOthersFromTargetOut(getFreshTargetOut(v), v.id);
        const outstanding = Math.max(0, partyAmount.total - allocatedToOthers);
        return {
          id: v.id,
          date: v.date,
          type: "Journal (Cr)" as const,
          refNo: (v as any).voucherNumber ?? "—",
          total: partyAmount.total,
          outstanding,
          allocatedToOthers,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
    const journalsCrFiltered = journalCrRows.filter((j) => j.outstanding > 0 || hasExistingAllocOut(j.id));
    // Dr source (Payment Out / Journal Dr) → Cr IC vouchers same party.
    const icCrRows = (vouchers as any[])
      .filter((v) => !isCurrentVoucher(v) && v.type === "inter_company")
      .map((v) => {
        const partyAmount = getInterCompanyEntityBillWiseAmount(v, String(partyId), "party");
        if (!partyAmount || partyAmount.credit <= 0) return null;
        const allocatedToOthers = getAllocatedToOthersFromTargetOut(getFreshTargetOut(v), v.id);
        const outstanding = Math.max(0, partyAmount.total - allocatedToOthers);
        return {
          id: v.id,
          date: v.date,
          type: "Inter Company (Cr)" as const,
          refNo: (v as any).voucherNumber ?? "—",
          total: partyAmount.total,
          outstanding,
          allocatedToOthers,
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
    const icCrFiltered = icCrRows.filter((j) => j.outstanding > 0 || hasExistingAllocOut(j.id));
    const byDate = (a: { date: unknown }, b: { date: unknown }) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    };
    purchasesFiltered.sort(byDate);
    paymentInsFiltered.sort(byDate);
    const ob = shouldIncludeOpeningBalanceRow("payment_out", hasExistingAllocOut) ? [{
      id: OPENING_BALANCE_VOUCHER_ID,
      date: null,
      type: openingBalanceRowLabel,
      refNo: "—",
      total: openingBalanceGrossTotal("payment_out"),
      outstanding: openingBalanceRowOutstanding("payment_out"),
      allocatedToOthers: obAllocatedToOthers,
    }] : [];
    const combined = [...ob, ...purchasesFiltered, ...paymentInsFiltered, ...journalsCrFiltered, ...icCrFiltered];
    combined.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
    return combined;
  }, [variant, partyId, vouchers, vouchersForAllocations, partyOB, showOBInPaymentOut, obOutstandingIn, totalConsumedFromOB, obAllocatedToOthers, obAmount, existingAllocations, currentVoucherIdStr, isJournalLinkDialog, partyOpeningBalanceOutstanding, currentVoucherAllocToOB, billWiseObRemaining]);

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
      if (!a.voucherId) continue;
      const total = getAllocationTotal(a);
      if (total > 0) initial[a.voucherId] = total;
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
          <p className="text-xs text-muted-foreground leading-tight">Link for bill wise (1)</p>
          <DialogTitle className="text-xl leading-tight">
            {dialogTitleOverride ?? (isOut ? "Link Payment Out to Linkable Cr Txns" : "Link Payment In to Linkable Dr Txns")}
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
                      const rowType =
                        row.type === "Book Opening" || row.type === "Opening Balance"
                          ? row.type
                          : (row.type ?? (isOut ? "Purchase" : "Sale")).toLowerCase();
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

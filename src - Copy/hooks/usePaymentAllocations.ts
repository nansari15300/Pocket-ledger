"use client";

import { useMemo } from "react";
import {
  getAllocatedByVoucherId,
  getAllocatedByVoucherIdFromPaymentOuts,
  getOutstanding,
  validateAllocations as validateAllocationsUtil,
  autoLink as autoLinkUtil,
  type Allocation,
} from "@/lib/payment-allocation-utils";

export type SaleWithOutstanding = {
  id: string;
  total: number;
  allocated: number;
  outstanding: number;
  date?: unknown;
  voucherNumber?: string;
  invoiceNumber?: string;
  dueDate?: unknown;
  type: string;
};

/**
 * Hook for payment allocation: party's sales, outstanding per voucher, auto-link, validate.
 * When editing a payment_in (currentPaymentInId), that voucher's allocations are excluded
 * from "allocated" so outstanding reflects state before this payment.
 */
export function usePaymentAllocations(
  partyId: string | null | undefined,
  vouchers: any[],
  currentPaymentInId?: string | null
) {
  return useMemo(() => {
    if (!partyId || !vouchers?.length) {
      return {
        outstandingByVoucherId: new Map<string, number>(),
        allocatedToVoucherId: new Map<string, number>(),
        salesWithOutstanding: [] as SaleWithOutstanding[],
        autoLink: (_received: number) => [] as Allocation[],
        validate: (_allocations: Allocation[], _received: number) => ({ valid: true as const }),
      };
    }

    // All payment_in/direct_income vouchers except the one we're editing
    const paymentInVouchers = vouchers.filter(
      (v) =>
        (v.type === "payment_in" || v.type === "direct_income") &&
        (currentPaymentInId == null || v.id !== currentPaymentInId)
    );

    const allocatedMap = getAllocatedByVoucherId(paymentInVouchers);

    // Party's sales (and optionally purchase for payable side later)
    const partySales = vouchers.filter(
      (v) => (v.type === "sale" || v.type === "sale_service") && v.partyId === partyId
    );

    const salesWithOutstanding: SaleWithOutstanding[] = partySales.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocated = allocatedMap.get(v.id) ?? 0;
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        total,
        allocated,
        outstanding,
        date: v.date,
        voucherNumber: v.voucherNumber,
        invoiceNumber: v.invoiceNumber ?? v.voucherNumber,
        dueDate: v.dueDate,
        type: v.type,
      };
    });

    // Sort by date ascending (oldest first) for auto-link FIFO
    salesWithOutstanding.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });

    const outstandingByVoucherId = new Map<string, number>();
    salesWithOutstanding.forEach((s) => outstandingByVoucherId.set(s.id, s.outstanding));

    const autoLink = (receivedAmount: number) =>
      autoLinkUtil(receivedAmount, salesWithOutstanding);

    const validate = (allocations: Allocation[], receivedAmount: number) =>
      validateAllocationsUtil(allocations, receivedAmount, outstandingByVoucherId);

    return {
      outstandingByVoucherId,
      allocatedToVoucherId: allocatedMap,
      salesWithOutstanding,
      autoLink,
      validate,
    };
  }, [partyId, vouchers, currentPaymentInId]);
}

export type PurchaseWithOutstanding = {
  id: string;
  total: number;
  allocated: number;
  outstanding: number;
  date?: unknown;
  voucherNumber?: string;
  type: string;
};

/**
 * Hook for payment_out allocation: party's purchases, outstanding per voucher, auto-link, validate.
 */
export function usePaymentOutAllocations(
  partyId: string | null | undefined,
  vouchers: any[],
  currentPaymentOutId?: string | null
) {
  return useMemo(() => {
    if (!partyId || !vouchers?.length) {
      return {
        outstandingByVoucherId: new Map<string, number>(),
        allocatedToVoucherId: new Map<string, number>(),
        purchasesWithOutstanding: [] as PurchaseWithOutstanding[],
        autoLink: (_paid: number) => [] as Allocation[],
        validate: (_allocations: Allocation[], _paid: number) => ({ valid: true as const }),
      };
    }

    const paymentOutVouchers = vouchers.filter(
      (v) =>
        (v.type === "payment_out" || v.type === "direct_expense") &&
        (currentPaymentOutId == null || v.id !== currentPaymentOutId)
    );
    const allocatedMap = getAllocatedByVoucherIdFromPaymentOuts(paymentOutVouchers);

    const partyPurchases = vouchers.filter(
      (v) => (v.type === "purchase" || v.type === "purchase_service") && v.partyId === partyId
    );

    const purchasesWithOutstanding: PurchaseWithOutstanding[] = partyPurchases.map((v) => {
      const total = Number(v.total ?? v.amount ?? 0);
      const allocated = allocatedMap.get(v.id) ?? 0;
      const outstanding = getOutstanding(total, allocated);
      return {
        id: v.id,
        total,
        allocated,
        outstanding,
        date: v.date,
        voucherNumber: v.voucherNumber,
        type: v.type,
      };
    });

    purchasesWithOutstanding.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });

    const outstandingByVoucherId = new Map<string, number>();
    purchasesWithOutstanding.forEach((s) => outstandingByVoucherId.set(s.id, s.outstanding));

    const autoLink = (paidAmount: number) =>
      autoLinkUtil(paidAmount, purchasesWithOutstanding);

    const validate = (allocations: Allocation[], paidAmount: number) =>
      validateAllocationsUtil(allocations, paidAmount, outstandingByVoucherId);

    return {
      outstandingByVoucherId,
      allocatedToVoucherId: allocatedMap,
      purchasesWithOutstanding,
      autoLink,
      validate,
    };
  }, [partyId, vouchers, currentPaymentOutId]);
}

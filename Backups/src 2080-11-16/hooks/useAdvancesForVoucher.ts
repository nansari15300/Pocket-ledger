"use client";

import { useMemo } from "react";
import {
  getAllocatedByVoucherId,
  getAllocatedByVoucherIdFromPaymentOuts,
  getPaymentInRemaining,
  getPaymentOutRemaining,
  getOutstanding,
  type Allocation,
} from "@/lib/payment-allocation-utils";

export type PaymentInWithRemaining = {
  id: string;
  amount: number;
  allocatedTotal: number;
  remaining: number;
  date?: unknown;
  voucherNumber?: string;
  type: string;
};

export type PaymentOutWithRemaining = {
  id: string;
  amount: number;
  allocatedTotal: number;
  remaining: number;
  date?: unknown;
  voucherNumber?: string;
  type: string;
};

/**
 * For "Link advances TO this sale": payment_ins for party with remaining amount; sale outstanding.
 * Same account = same partyId.
 */
export function useAdvancesForSale(
  partyId: string | null | undefined,
  targetSaleId: string | null | undefined,
  vouchers: any[]
) {
  return useMemo(() => {
    if (!partyId || !vouchers?.length) {
      return { paymentInsWithRemaining: [] as PaymentInWithRemaining[], saleOutstanding: 0 };
    }

    const paymentInVouchers = vouchers.filter(
      (v) => (v.type === "payment_in" || v.type === "direct_income") && v.partyId === partyId
    );
    const allocatedToSales = getAllocatedByVoucherId(paymentInVouchers);

    const saleOutstanding = (() => {
      if (!targetSaleId) return 0;
      const sale = vouchers.find((v) => v.id === targetSaleId && (v.type === "sale" || v.type === "sale_service"));
      if (!sale) return 0;
      const total = Number(sale.total ?? sale.amount ?? 0);
      const allocated = allocatedToSales.get(targetSaleId) ?? 0;
      return getOutstanding(total, allocated);
    })();

    const paymentInsWithRemaining: PaymentInWithRemaining[] = paymentInVouchers.map((v) => {
      const amount = Number(v.amount ?? v.total ?? 0);
      const remaining = getPaymentInRemaining(v);
      const allocations = (v.allocations as Allocation[] | undefined) || [];
      const allocatedTotal = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return {
        id: v.id,
        amount,
        allocatedTotal,
        remaining,
        date: v.date,
        voucherNumber: v.voucherNumber,
        type: v.type,
      };
    });

    paymentInsWithRemaining.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });

    return { paymentInsWithRemaining, saleOutstanding };
  }, [partyId, targetSaleId, vouchers]);
}

/**
 * For "Link advances TO this purchase": payment_outs for party with remaining amount; purchase outstanding.
 * Same account = same partyId.
 */
export function useAdvancesForPurchase(
  partyId: string | null | undefined,
  targetPurchaseId: string | null | undefined,
  vouchers: any[]
) {
  return useMemo(() => {
    if (!partyId || !vouchers?.length) {
      return { paymentOutsWithRemaining: [] as PaymentOutWithRemaining[], purchaseOutstanding: 0 };
    }

    const paymentOutVouchers = vouchers.filter(
      (v) => (v.type === "payment_out" || v.type === "direct_expense") && v.partyId === partyId
    );
    const allocatedToPurchases = getAllocatedByVoucherIdFromPaymentOuts(paymentOutVouchers);

    const purchaseOutstanding = (() => {
      if (!targetPurchaseId) return 0;
      const purchase = vouchers.find((v) => v.id === targetPurchaseId && (v.type === "purchase" || v.type === "purchase_service"));
      if (!purchase) return 0;
      const total = Number(purchase.total ?? purchase.amount ?? 0);
      const allocated = allocatedToPurchases.get(targetPurchaseId) ?? 0;
      return getOutstanding(total, allocated);
    })();

    const paymentOutsWithRemaining: PaymentOutWithRemaining[] = paymentOutVouchers.map((v) => {
      const amount = Number(v.amount ?? v.total ?? 0);
      const remaining = getPaymentOutRemaining(v);
      const allocations = (v.allocations as Allocation[] | undefined) || [];
      const allocatedTotal = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return {
        id: v.id,
        amount,
        allocatedTotal,
        remaining,
        date: v.date,
        voucherNumber: v.voucherNumber,
        type: v.type,
      };
    });

    paymentOutsWithRemaining.sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });

    return { paymentOutsWithRemaining, purchaseOutstanding };
  }, [partyId, targetPurchaseId, vouchers]);
}

/**
 * Payment_outs for same accountId (for Payment In linking to Payment Out - e.g. refunds).
 */
export function usePaymentOutsByAccount(
  accountId: string | null | undefined,
  vouchers: any[]
) {
  return useMemo(() => {
    if (!accountId || !vouchers?.length) {
      return [] as PaymentOutWithRemaining[];
    }

    const accountIdStr = String(accountId);
    const paymentOutVouchers = vouchers.filter(
      (v) => (v.type === "payment_out" || v.type === "direct_expense") && String(v.accountId ?? "") === accountIdStr
    );

    return paymentOutVouchers.map((v) => {
      const amount = Number(v.amount ?? v.total ?? 0);
      const remaining = getPaymentOutRemaining(v);
      const allocations = (v.allocations as Allocation[] | undefined) || [];
      const allocatedTotal = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return {
        id: v.id,
        amount,
        allocatedTotal,
        remaining,
        date: v.date,
        voucherNumber: v.voucherNumber,
        type: v.type,
      };
    }).sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
  }, [accountId, vouchers]);
}

/**
 * Payment_ins for same accountId (for Payment Out linking to Payment In - within same account).
 */
export function usePaymentInsByAccount(
  accountId: string | null | undefined,
  partyId: string | null | undefined,
  currentPaymentOutId: string | null | undefined,
  vouchers: any[]
) {
  return useMemo(() => {
    if (!accountId || !vouchers?.length) {
      return [] as PaymentInWithRemaining[];
    }

    const accountIdStr = String(accountId);
    const paymentInVouchers = vouchers.filter(
      (v) =>
        (v.type === "payment_in" || v.type === "direct_income") &&
        String(v.accountId ?? "") === accountIdStr &&
        (currentPaymentOutId == null || v.id !== currentPaymentOutId)
    );

    return paymentInVouchers.map((v) => {
      const amount = Number(v.amount ?? v.total ?? 0);
      const remaining = getPaymentInRemaining(v);
      const allocations = (v.allocations as Allocation[] | undefined) || [];
      const allocatedTotal = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return {
        id: v.id,
        amount,
        allocatedTotal,
        remaining,
        date: v.date,
        voucherNumber: v.voucherNumber,
        type: v.type,
      };
    }).filter((p) => p.remaining > 0).sort((a, b) => {
      const dA = a.date ? new Date((a.date as any)?.toDate?.() ?? a.date).getTime() : 0;
      const dB = b.date ? new Date((b.date as any)?.toDate?.() ?? b.date).getTime() : 0;
      return dA - dB;
    });
  }, [accountId, partyId, currentPaymentOutId, vouchers]);
}

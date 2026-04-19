"use client";

import { doc, getDoc, updateDoc, collection, getCountFromServer } from "firebase/firestore";
import { increment } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { numericEntitlement, companyStorageIsLocal, type PlanId } from "@/config/plans";
import { getPlanFromPlans } from "@/hooks/useLivePlans";
import { readCachedPlansRecord, defaultPlansRecordFallback } from "@/lib/plansCatalogCache";
import { isLikelyOfflineFirestoreError } from "@/lib/localVoucherOutbox";

const BYTES_PER_GB = 1e9;

export type UsageDelta = {
  attachmentsBytes?: number;
  storageBytes?: number;
};

export async function getCompanyUsage(
  companyId: string
): Promise<{ attachmentsUsedBytes: number; storageUsedBytes: number }> {
  // Offline / local-only company: Firestore read throw kare to voucher+file save poora fail ho jata tha — limit check ke liye 0 maan lo.
  try {
    const ref = doc(firestore, "companies", companyId);
    const snap = await getDoc(ref);
    const data = snap.data();
    return {
      attachmentsUsedBytes: Number(data?.attachmentsUsedBytes ?? 0),
      storageUsedBytes: Number(data?.storageUsedBytes ?? 0),
    };
  } catch (e) {
    console.warn("[storageUsage] getCompanyUsage fallback (offline or no company doc)", e);
    return { attachmentsUsedBytes: 0, storageUsedBytes: 0 };
  }
}

/**
 * Check if adding more bytes would exceed plan limits. Use before upload.
 */
export async function checkStorageLimit(
  companyId: string,
  planId: PlanId | string | undefined,
  delta: UsageDelta,
  /** Local company → `*Local` GB caps (admin Plans); missing `storageOption` treated as local app-wide. */
  storageOption?: string | null
): Promise<{ allowed: boolean; message?: string }> {
  const merged = getPlanFromPlans(readCachedPlansRecord() ?? defaultPlansRecordFallback(), (planId as PlanId) || undefined);
  const useLocal = companyStorageIsLocal(storageOption);
  const maxAttachmentsGB = numericEntitlement(merged.entitlements, "maxAttachmentsGB", useLocal);
  const maxStorageGB = numericEntitlement(merged.entitlements, "maxStorageGB", useLocal);

  const usage = await getCompanyUsage(companyId);
  const addAtt = Math.max(0, delta.attachmentsBytes ?? 0);
  const addStor = Math.max(0, delta.storageBytes ?? 0);

  const newAttachmentsBytes = usage.attachmentsUsedBytes + addAtt;
  const newStorageBytes = usage.storageUsedBytes + addStor;
  const limitAttachmentsBytes = maxAttachmentsGB * BYTES_PER_GB;
  const limitStorageBytes = maxStorageGB * BYTES_PER_GB;

  if (newAttachmentsBytes > limitAttachmentsBytes) {
    return {
      allowed: false,
      message: `Attachments limit reached (${(limitAttachmentsBytes / BYTES_PER_GB).toFixed(1)} GB). Upgrade to add more.`,
    };
  }
  if (newStorageBytes > limitStorageBytes) {
    return {
      allowed: false,
      message: `Storage limit reached (${(limitStorageBytes / BYTES_PER_GB).toFixed(1)} GB). Upgrade to add more.`,
    };
  }
  return { allowed: true };
}

/**
 * Increment company usage after successful upload. Call after uploadBytes.
 */
export async function incrementCompanyStorage(
  companyId: string,
  delta: UsageDelta
): Promise<void> {
  const att = Math.max(0, Math.round(delta.attachmentsBytes ?? 0));
  const stor = Math.max(0, Math.round(delta.storageBytes ?? 0));
  if (att === 0 && stor === 0) return;

  const ref = doc(firestore, "companies", companyId);
  const updates: Record<string, unknown> = {};
  if (att > 0) updates.attachmentsUsedBytes = increment(att);
  if (stor > 0) updates.storageUsedBytes = increment(stor);
  if (Object.keys(updates).length === 0) return;

  try {
    await updateDoc(ref, updates as any);
  } catch (error: any) {
    // Shared roles may not have company document update access in rules.
    // Do not block voucher save if usage counters cannot be incremented.
    if (error?.code === "permission-denied" || error?.code === "PERMISSION_DENIED") {
      console.warn("[storageUsage] Skipped increment due to insufficient permissions.");
      return;
    }
    // Offline / unavailable: local file queue + SQLite save chalna chahiye; usage counter baad me sync ho sakta hai.
    if (isLikelyOfflineFirestoreError(error)) {
      console.warn("[storageUsage] Skipped increment (offline/unavailable).");
      return;
    }
    throw error;
  }
}

/**
 * Decrement company usage after file delete. Pass positive bytes to subtract.
 */
export async function decrementCompanyStorage(
  companyId: string,
  delta: UsageDelta
): Promise<void> {
  const att = Math.max(0, Math.round(delta.attachmentsBytes ?? 0));
  const stor = Math.max(0, Math.round(delta.storageBytes ?? 0));
  if (att === 0 && stor === 0) return;

  const ref = doc(firestore, "companies", companyId);
  const updates: Record<string, unknown> = {};
  if (att > 0) updates.attachmentsUsedBytes = increment(-att);
  if (stor > 0) updates.storageUsedBytes = increment(-stor);
  if (Object.keys(updates).length === 0) return;

  try {
    await updateDoc(ref, updates as any);
  } catch (error: any) {
    // Non-owner/shared roles may fail this update; do not break user flow.
    if (error?.code === "permission-denied" || error?.code === "PERMISSION_DENIED") {
      console.warn("[storageUsage] Skipped decrement due to insufficient permissions.");
      return;
    }
    if (isLikelyOfflineFirestoreError(error)) {
      console.warn("[storageUsage] Skipped decrement (offline/unavailable).");
      return;
    }
    throw error;
  }
}

export function bytesToGB(bytes: number): number {
  return bytes / BYTES_PER_GB;
}

export function formatGB(bytes: number): string {
  return bytesToGB(bytes).toFixed(2);
}

/** Average document size (bytes) per collection for Firestore size estimation (vouchers data, parties, items, etc.) */
const AVG_DOC_BYTES: Record<string, number> = {
  vouchers: 2200,
  parties: 750,
  staff: 600,
  bank_accounts: 450,
  taxes: 350,
  expense_accounts: 350,
  items: 700,
  unassigned_documents: 450,
  groups: 280,
  staff_groups: 200,
  tax_groups: 200,
  expense_groups: 200,
  account_groups: 200,
  item_groups: 200,
};

/** Company doc itself (~settings, name, planId, etc.) */
const AVG_COMPANY_DOC_BYTES = 1200;

/**
 * Estimate Firestore storage used by one company (vouchers, parties, items, etc.).
 * Uses document count × average size per collection. Run per company, then sum for user-wise total.
 */
export async function estimateCompanyFirestoreBytes(companyId: string): Promise<number> {
  const base = (path: string) => collection(firestore, "companies", companyId, path);
  const collections = Object.keys(AVG_DOC_BYTES);
  let total = AVG_COMPANY_DOC_BYTES; // company doc
  await Promise.all(
    collections.map(async (path) => {
      try {
        const snap = await getCountFromServer(base(path));
        const count = snap.data().count ?? 0;
        total += count * (AVG_DOC_BYTES[path] ?? 0);
      } catch {
        // collection may not exist or no access; skip
      }
    })
  );
  return total;
}

/**
 * Estimate total Firestore storage for multiple companies (e.g. all companies of a user).
 * Returns total bytes across all companies.
 */
export async function estimateUserFirestoreBytes(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  const results = await Promise.all(companyIds.map((id) => estimateCompanyFirestoreBytes(id)));
  return results.reduce((a, b) => a + b, 0);
}

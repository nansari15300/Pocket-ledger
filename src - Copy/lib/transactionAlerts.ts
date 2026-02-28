"use client";

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Company } from "@/hooks/useCompany";

const ONE_LAKH = 100000;

export type TransactionAlertKind = "deleted" | "edited" | "large_amount";

export type TransactionAlertPayload = {
  kind: TransactionAlertKind;
  voucherId?: string;
  voucherNumber?: string;
  voucherType?: string;
  amount?: number;
  performedByUserId?: string;
  performedByEmail?: string;
  performedByName?: string;
  /** For kind "edited": list of what changed, e.g. ["Amount", "Narration", "Date"] */
  changes?: string[];
};

/** Normalize value for comparison (Timestamp → ms, Date → ms, else as-is). */
function normVal(v: unknown): unknown {
  if (v == null) return v;
  const d = (v as { toDate?: () => Date }).toDate;
  if (typeof d === "function") return d.call(v).getTime();
  if (v instanceof Date) return v.getTime();
  return v;
}

/**
 * Returns human-readable labels for fields that changed between old and new objects.
 * Use for "Transaction edited" alerts so we can show "Amount changed, Narration changed", etc.
 */
export function getChangedFieldLabels(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: { key: string; label: string }[]
): string[] {
  const out: string[] = [];
  for (const { key, label } of fields) {
    const a = normVal(oldObj[key]);
    const b = normVal(newObj[key]);
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) continue;
    if (String(a).trim() === String(b).trim()) continue;
    out.push(label);
  }
  return out;
}

/**
 * Sends an alert to the company owner (admin) if Edits and bigger amount add alert is enabled.
 * Alert appears in Messages → Alerts tab.
 */
export async function sendTransactionAlert(
  companyId: string,
  company: Company | null,
  payload: TransactionAlertPayload
): Promise<{ success: boolean; error?: string }> {
  if (!company?.notificationSettings?.transactionAlerts?.on) return { success: true };
  const ownerId = company.ownerId;
  if (!ownerId) return { success: true };

  const currencySym = company?.currencySymbol ?? "Rs.";
  const by =
    payload.performedByName
      ? (payload.performedByEmail ? `${payload.performedByName} (${payload.performedByEmail})` : payload.performedByName)
      : (payload.performedByEmail || payload.performedByUserId || "Someone");
  let message: string;
  switch (payload.kind) {
    case "deleted":
      message = `Transaction deleted: ${payload.voucherNumber || payload.voucherType || "Voucher"} (by ${by}).`;
      break;
    case "edited": {
      message = `Transaction edited: ${payload.voucherNumber || payload.voucherType || "Voucher"} (by ${by}).`;
      if (payload.changes && payload.changes.length > 0) {
        message += ` Changes: ${payload.changes.join(", ")}.`;
      }
      break;
    }
    case "large_amount": {
      const amt =
        payload.amount != null
          ? `${currencySym} ${payload.amount.toLocaleString("en-IN")}`
          : `> ${currencySym} 1,00,000`;
      message = `Large amount added: ${payload.voucherNumber || payload.voucherType || "Voucher"} — ${amt} (by ${by}).`;
      break;
    }
    default:
      message = `Transaction activity (by ${by}).`;
  }

  try {
    const doc: Record<string, unknown> = {
      recipientUserId: ownerId,
      message,
      timestamp: serverTimestamp(),
      isRead: false,
      type: "transaction_alert",
      companyId,
      kind: payload.kind,
    };
    if (payload.voucherId != null) doc.voucherId = payload.voucherId;
    if (payload.voucherNumber != null) doc.voucherNumber = payload.voucherNumber;
    if (payload.voucherType != null) doc.voucherType = payload.voucherType;
    if (payload.amount != null) {
      doc.amount = payload.amount;
      doc.amountFormatted = `${currencySym} ${payload.amount.toLocaleString("en-IN")}`;
    }
    if (payload.performedByUserId || payload.performedByEmail) {
      doc.attemptedBy = {
        uid: payload.performedByUserId || "",
        email: payload.performedByEmail || "",
        ...(payload.performedByName ? { name: payload.performedByName } : {}),
      };
    }
    if (payload.kind === "edited" && payload.changes && payload.changes.length > 0) {
      doc.changes = payload.changes;
    }
    await addDoc(collection(firestore, "admin_notifications"), doc);
    return { success: true };
  } catch (err: any) {
    console.error("sendTransactionAlert failed:", err);
    return { success: false, error: err?.message };
  }
}

/** Returns true if amount is more than 1 lakh (100,000). */
export function isAmountOverOneLakh(amount: number): boolean {
  return typeof amount === "number" && !Number.isNaN(amount) && amount > ONE_LAKH;
}

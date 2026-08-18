/**
 * Stripe / gateway fulfillment — grant extra device or user slots on the owner user doc.
 * Expiry = active company planExpiryMs (same subscription period).
 * One payment can include multiple kinds (e.g. devices + users together).
 */
import "server-only";
import * as admin from "firebase-admin";
import { findOwnedCompanyIdForUser } from "@/lib/payments/resolveStripeFirestoreCompany";
import { normalizeAddonKind, type AddonKind } from "@/lib/planAddOns";

export const PENDING_ADDON_PURCHASES_COLLECTION = "pending_addon_purchases";
export const PENDING_ADDON_PURCHASE_TTL_MS = 60 * 60 * 1000;

export type AddonPurchaseLine = {
  kind: AddonKind | string;
  quantity: number;
};

export type ApplyAddonPurchaseInput = {
  db: admin.firestore.Firestore;
  companyId: string;
  userId: string;
  paymentId: string;
  gateway: "stripe" | "khalti" | "esewa";
  amount: number;
  currency: string;
  /** Legacy single-line */
  kind?: AddonKind | string;
  quantity?: number;
  /** Multi-line (preferred) */
  items?: AddonPurchaseLine[];
};

export type ApplyAddonPurchaseResult =
  | { ok: true }
  | { ok: false; reason: string };

function fieldForKind(kind: AddonKind): string {
  switch (kind) {
    case "device-online":
      return "addonExtraDevicesOnline";
    case "device-local":
      return "addonExtraDevicesLocal";
    case "user-online":
      return "addonExtraUsersOnline";
    case "user-local":
      return "addonExtraUsersLocal";
    case "company-online":
      return "addonExtraCompaniesOnline";
    case "company-local":
      return "addonExtraCompaniesLocal";
  }
}

function normalizeItems(input: ApplyAddonPurchaseInput): { kind: AddonKind; quantity: number }[] {
  const raw =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items
      : input.kind != null
        ? [{ kind: input.kind, quantity: input.quantity ?? 1 }]
        : [];
  const merged = new Map<AddonKind, number>();
  for (const row of raw) {
    const kind = normalizeAddonKind(row.kind);
    const qty = Math.max(0, Math.min(50, Math.floor(Number(row.quantity) || 0)));
    if (qty <= 0) continue;
    merged.set(kind, (merged.get(kind) || 0) + qty);
  }
  return [...merged.entries()].map(([kind, quantity]) => ({ kind, quantity }));
}

/** Parse checkout metadata `addonItems` = "device-online:2,user-online:1" (or legacy addonKind + addonQuantity). */
export function parseAddonItemsFromCheckoutMetadata(metadata: {
  addonItems?: string | null;
  addonKind?: string | null;
  addonQuantity?: string | null;
}): { kind: AddonKind; quantity: number }[] {
  const packed = String(metadata.addonItems || "").trim();
  if (packed) {
    const items: { kind: AddonKind; quantity: number }[] = [];
    for (const part of packed.split(",")) {
      const [k, q] = part.split(":");
      const kind = normalizeAddonKind(k);
      const quantity = Math.max(0, Math.min(50, Math.floor(Number(q) || 0)));
      if (quantity > 0) items.push({ kind, quantity });
    }
    if (items.length > 0) return items;
  }
  const kind = normalizeAddonKind(metadata.addonKind);
  const quantity = Math.max(1, Math.floor(Number(metadata.addonQuantity) || 1));
  return [{ kind, quantity }];
}

export async function applyAddonPurchaseToFirestore(
  input: ApplyAddonPurchaseInput
): Promise<ApplyAddonPurchaseResult> {
  const { db, companyId, userId, paymentId, gateway, amount, currency } = input;
  const items = normalizeItems(input);
  if (!userId.trim()) return { ok: false, reason: "missing_userId" };
  if (items.length === 0) return { ok: false, reason: "empty_addon_items" };

  let effectiveCompanyId = companyId;
  let companySnap = await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) {
    const resolved = await findOwnedCompanyIdForUser(db, userId, companyId);
    if (resolved) {
      effectiveCompanyId = resolved;
      companySnap = await db.collection("companies").doc(resolved).get();
    }
  }
  if (!companySnap.exists) return { ok: false, reason: "company_not_found" };

  const cdata = companySnap.data() as {
    ownerId?: string;
    planExpiryMs?: number;
    planExpiry?: { toMillis?: () => number };
  };
  const ownerId = String(cdata.ownerId || userId).trim();
  if (ownerId !== userId.trim()) {
    return { ok: false, reason: "owner_only" };
  }

  let expiryMs: number | null =
    typeof cdata.planExpiryMs === "number" && Number.isFinite(cdata.planExpiryMs)
      ? cdata.planExpiryMs
      : null;
  if (expiryMs == null && cdata.planExpiry && typeof cdata.planExpiry.toMillis === "function") {
    expiryMs = cdata.planExpiry.toMillis();
  }
  if (expiryMs == null || expiryMs <= Date.now()) {
    return { ok: false, reason: "no_active_paid_period" };
  }

  const payRef = db.collection("companies").doc(effectiveCompanyId).collection("payments").doc(paymentId);
  const paySnap = await payRef.get();
  if (paySnap.exists && (paySnap.data() as { addonFulfillComplete?: boolean }).addonFulfillComplete === true) {
    return { ok: true };
  }

  const userRef = db.collection("users").doc(ownerId);
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const udata = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      addonExpiryMs: expiryMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const { kind, quantity } of items) {
      const field = fieldForKind(kind);
      const prev = Math.max(0, Math.floor(Number(udata[field]) || 0));
      patch[field] = prev + quantity;
    }
    tx.set(userRef, patch, { merge: true });
    tx.set(
      payRef,
      {
        paymentId,
        userId,
        amount,
        currency: currency.toLowerCase(),
        gateway,
        status: "completed",
        billingIntent: `addon_bundle`,
        addonItems: items,
        addonKind: items[0]?.kind,
        addonQuantity: items.reduce((s, i) => s + i.quantity, 0),
        addonFulfillComplete: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { ok: true };
}

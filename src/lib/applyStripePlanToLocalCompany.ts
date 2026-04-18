"use client";

/**
 * Stripe sync ne `company_not_found` diya = Firestore doc nahi; payment verified payload se local SQLite company update.
 * Owner check: metadata.userId === Firebase uid === local company ownerId (offline registry).
 */
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import type { VerifiedLocalPlanApplyPayload } from "@/lib/payments/localStripePlanApplyTypes";
import { writeCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";

/** Local registry: kaun si row "active" maani jaye — Stripe metadata id SQLite me na ho to owner + last touch. */
function localCompanyTouchMs(c: LocalCompanyDoc): number {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return Math.max(n(c.planUpgradedAtMs), n(c.updatedAtMs), n(c.createdAtMs));
}

export const BUMP_LOCAL_COMPANY_REGISTRY_EVENT = "pocket-ledger-bump-local-companies";

export function bumpLocalCompanyRegistry(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BUMP_LOCAL_COMPANY_REGISTRY_EVENT));
}

export async function applyVerifiedStripePayloadToLocalCompany(
  payload: VerifiedLocalPlanApplyPayload,
  firebaseUid: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (payload.userId !== firebaseUid) return { ok: false, reason: "user_mismatch" };
  let local = await getLocalCompanyById(payload.companyId);
  if (!local) {
    const all = await listLocalCompanies();
    const owned = all.filter((c) => String(c.ownerId || "").trim() === firebaseUid);
    const metaId = payload.companyId.trim();
    const byMeta = owned.find((c) => c.id === metaId);
    const sorted = [...owned].sort((a, b) => localCompanyTouchMs(b) - localCompanyTouchMs(a));
    local = byMeta ?? sorted[0] ?? null;
  }
  if (!local) return { ok: false, reason: "local_company_missing" };
  const ownerId = String(local.ownerId || "").trim();
  if (ownerId !== firebaseUid) return { ok: false, reason: "not_owner" };

  // SQLite JSON: primitives only (avoid Firestore Timestamp stringify quirks).
  const authCo = payload.authoritativeCompanyId?.trim();
  const planPatch = {
    planId: payload.planId,
    planExpiryMs: payload.planExpiryMs,
    planUpgradedAtMs: Date.now(),
    lastStripeCheckoutSessionId: payload.lastStripeCheckoutSessionId,
    ...(authCo ? { authoritativeCompanyId: authCo } : {}),
    ...(payload.stripeCustomerId ? { stripeCustomerId: payload.stripeCustomerId } : {}),
    ...(payload.stripeSubscriptionId ? { stripeSubscriptionId: payload.stripeSubscriptionId } : {}),
  };

  // Account-level subscription: same plan on every owned local row — active company Basic reh jata tha agar sirf ek id update hoti
  const allOwned = (await listLocalCompanies()).filter(
    (c) => String(c.ownerId || "").trim() === firebaseUid
  );
  const targets = allOwned.length > 0 ? allOwned : [local];
  for (const row of targets) {
    await upsertLocalCompany({
      ...row,
      ...planPatch,
    });
    writeCompanyPlanLocalCache(row.id, {
      planId: payload.planId,
      planExpiryMs: payload.planExpiryMs,
      lastStripeCheckoutSessionId: payload.lastStripeCheckoutSessionId,
    });
  }

  bumpLocalCompanyRegistry();
  return { ok: true };
}

import type admin from "firebase-admin";

/** Firestore `app_settings/billing` — product flags (defaults jab doc/field missing ho). */
export type BillingPolicySettings = {
  /**
   * false: paid → cheaper paid tier block (Downgrade + “Just change plan” same-expiry).
   * Basic/free switch alag route se chalta rahega jab target free ho.
   */
  planDowngradeEnabled: boolean;
};

const DEFAULT: BillingPolicySettings = { planDowngradeEnabled: true };

/** Admin billing policy — missing doc ya non-boolean field par safe default (downgrade on). */
export async function getBillingPolicySettings(
  db: admin.firestore.Firestore
): Promise<BillingPolicySettings> {
  const snap = await db.doc("app_settings/billing").get();
  if (!snap.exists) return DEFAULT;
  const raw = snap.data() as Record<string, unknown>;
  const v = raw.planDowngradeEnabled;
  if (typeof v === "boolean") return { planDowngradeEnabled: v };
  return DEFAULT;
}

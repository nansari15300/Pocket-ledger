import { getAdminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_PLANS, type PlanId } from "@/config/plans";

/** Firestore `app_settings/plans` overrides merged with defaults — same source as `/api/payments/initiate`. */
export async function getEffectivePlanPrices(planId: PlanId): Promise<{ monthly: number; yearly: number }> {
  const def = DEFAULT_PLANS[planId];
  try {
    const db = getAdminDb();
    const snap = await db.doc("app_settings/plans").get();
    if (!snap.exists) return def.price;
    const row = (snap.data() as Record<string, { price?: { monthly?: number; yearly?: number } }>)[planId];
    if (!row?.price) return def.price;
    return {
      monthly: Number(row.price.monthly ?? def.price.monthly),
      yearly: Number(row.price.yearly ?? def.price.yearly),
    };
  } catch {
    return def.price;
  }
}

import { DEFAULT_PLANS, type Plan, type PlanId, PLAN_TIER_ORDER } from "@/config/plans";

/** Firestore `undefined` field allow nahi karta — nested objects me bhi hata do. */
function omitUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  // Firestore Timestamp / plain Date — andar recurse mat karo
  if (typeof (value as { toDate?: () => Date }).toDate === "function") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((v) => omitUndefinedDeep(v)).filter((v) => v !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const next = omitUndefinedDeep(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

/** Admin Save: `setDoc` se pehle plan object — invalid data error avoid. */
export function sanitizePlanForFirestoreWrite(plan: Plan): Record<string, unknown> {
  const cleaned = omitUndefinedDeep(plan as unknown as Record<string, unknown>);
  return (cleaned ?? {}) as Record<string, unknown>;
}

/** Pehli baar doc: raw `DEFAULT_PLANS` me nested `undefined` ho sakta hai — Firestore reject karta hai. */
export function buildDefaultPlansFirestoreDoc(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of PLAN_TIER_ORDER) {
    out[id] = sanitizePlanForFirestoreWrite(DEFAULT_PLANS[id]);
  }
  return out;
}

/**
 * `app_settings/plans` document.data() → billing/admin jaisi merged `Plan[]` (ek hi source of truth dono UI ke liye).
 */
export function mergeAppSettingsPlansDoc(raw: Record<string, unknown> | null | undefined): Plan[] {
  if (!raw || typeof raw !== "object") {
    return PLAN_TIER_ORDER.map((id) => DEFAULT_PLANS[id]);
  }

  return PLAN_TIER_ORDER.map((defaultPlanId) => {
    const defaultPlan = DEFAULT_PLANS[defaultPlanId];
    const firestorePlan = raw[defaultPlanId] as Partial<Plan> | undefined;

    let discountPercentage = firestorePlan?.discountPercentage;
    if (
      !discountPercentage &&
      firestorePlan?.price?.monthly != null &&
      firestorePlan?.price?.yearly != null &&
      firestorePlan.price.monthly > 0 &&
      firestorePlan.price.yearly > 0
    ) {
      discountPercentage = 100 - (firestorePlan.price.yearly * 100) / (firestorePlan.price.monthly * 12);
    }

    const merged = {
      ...defaultPlan,
      ...(firestorePlan || {}),
      entitlements: {
        ...defaultPlan.entitlements,
        ...(firestorePlan?.entitlements || {}),
      },
      price: {
        ...defaultPlan.price,
        ...(firestorePlan?.price || {}),
      },
      isFree: firestorePlan?.isFree ?? defaultPlan.isFree,
      ...(discountPercentage != null && !Number.isNaN(Number(discountPercentage))
        ? { discountPercentage }
        : {}),
      ...(firestorePlan?.limitedTimeOfferDate != null
        ? { limitedTimeOfferDate: firestorePlan.limitedTimeOfferDate }
        : {}),
    } as Plan;

    return omitUndefinedDeep(merged) as Plan;
  });
}

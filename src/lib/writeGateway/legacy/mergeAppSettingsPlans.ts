import {
  DEFAULT_ONLINE_DEMO_OFFER,
  DEFAULT_PLANS,
  ONLINE_DEMO_PLAN_IDS,
  migrateLegacyUnlimitedZeroEntitlements,
  sanitizeOnlineDemoOffer,
  type OnlineDemoOffer,
  type OnlineDemoPlanId,
  type Plan,
  type PlanId,
  PLAN_TIER_ORDER,
} from "@/config/plans";

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

/** Catalog-level online demo (one paid tier at a time). */
export function readOnlineDemoOfferFromPlansDoc(
  raw: Record<string, unknown> | null | undefined
): OnlineDemoOffer {
  if (raw && typeof raw === "object" && raw.onlineDemo != null) {
    return sanitizeOnlineDemoOffer(raw.onlineDemo);
  }
  // Legacy: whichever paid plan still has `demo.enabled` wins.
  for (const id of ONLINE_DEMO_PLAN_IDS) {
    const row = raw?.[id] as { demo?: { enabled?: unknown; days?: unknown } } | undefined;
    if (row?.demo?.enabled === true) {
      return sanitizeOnlineDemoOffer({
        enabled: true,
        days: row.demo.days,
        planId: id,
      });
    }
  }
  return { ...DEFAULT_ONLINE_DEMO_OFFER };
}

/** Mirror the single offer onto each tier's `demo` field for billing / activate APIs. */
export function applyOnlineDemoOfferToPlans(plans: Plan[], offer: OnlineDemoOffer): Plan[] {
  const days = sanitizeOnlineDemoOffer(offer).days;
  const planId = sanitizeOnlineDemoOffer(offer).planId;
  const enabled = offer.enabled === true;
  return plans.map((plan) => ({
    ...plan,
    demo: {
      enabled: enabled && plan.id === planId,
      days,
    },
  }));
}

/** Pehli baar doc: raw `DEFAULT_PLANS` me nested `undefined` ho sakta hai — Firestore reject karta hai. */
export function buildDefaultPlansFirestoreDoc(): Record<string, unknown> {
  const offer = { ...DEFAULT_ONLINE_DEMO_OFFER };
  const out: Record<string, unknown> = {
    onlineDemo: offer,
    // New convention: 0 = none, -1 = unlimited
    entitlementCapConvention: "zero_means_none",
  };
  for (const id of PLAN_TIER_ORDER) {
    const plan = {
      ...DEFAULT_PLANS[id],
      demo: {
        enabled: offer.enabled && id === offer.planId,
        days: offer.days,
      },
    };
    out[id] = sanitizePlanForFirestoreWrite(plan);
  }
  return out;
}

/**
 * `app_settings/plans` document.data() → billing/admin jaisi merged `Plan[]` (ek hi source of truth dono UI ke liye).
 */
export function mergeAppSettingsPlansDoc(raw: Record<string, unknown> | null | undefined): Plan[] {
  if (!raw || typeof raw !== "object") {
    return applyOnlineDemoOfferToPlans(
      PLAN_TIER_ORDER.map((id) => DEFAULT_PLANS[id]),
      DEFAULT_ONLINE_DEMO_OFFER
    );
  }

  const base = PLAN_TIER_ORDER.map((defaultPlanId) => {
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
      regionalPrices: {
        ...(defaultPlan.regionalPrices || {}),
        ...(firestorePlan?.regionalPrices || {}),
      },
      isFree: firestorePlan?.isFree ?? defaultPlan.isFree,
      ...(discountPercentage != null && !Number.isNaN(Number(discountPercentage))
        ? { discountPercentage }
        : {}),
      ...(firestorePlan?.limitedTimeOfferDate != null
        ? { limitedTimeOfferDate: firestorePlan.limitedTimeOfferDate }
        : {}),
    } as Plan;

    if (raw.entitlementCapConvention !== "zero_means_none") {
      merged.entitlements = migrateLegacyUnlimitedZeroEntitlements(
        merged.entitlements
      ) as Plan["entitlements"];
    }

    return omitUndefinedDeep(merged) as Plan;
  });

  return applyOnlineDemoOfferToPlans(base, readOnlineDemoOfferFromPlansDoc(raw));
}

/** Patch payload when SuperAdmin saves the list-card online demo offer. */
export function buildOnlineDemoOfferWritePatch(offerInput: OnlineDemoOffer): Record<string, unknown> {
  const offer = sanitizeOnlineDemoOffer(offerInput);
  const patch: Record<string, unknown> = { onlineDemo: offer };
  for (const id of ONLINE_DEMO_PLAN_IDS) {
    patch[id] = {
      demo: {
        enabled: offer.enabled && id === offer.planId,
        days: offer.days,
      },
    };
  }
  // Basic never hosts the paid demo.
  patch.basic = { demo: { enabled: false, days: offer.days } };
  return patch;
}

export type { OnlineDemoOffer, OnlineDemoPlanId };

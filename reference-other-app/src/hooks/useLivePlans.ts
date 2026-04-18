"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { DEFAULT_PLANS, type Plan, type PlanId } from "@/config/plans";

/**
 * Subscribes to app_settings/plans in Firestore so admin-saved plan changes
 * (e.g. enabling "Can add file" for Basic) are used in the dashboard.
 */
export function useLivePlans(): Record<PlanId, Plan> {
  const [plans, setPlans] = useState<Record<PlanId, Plan>>(() => ({ ...DEFAULT_PLANS }));

  useEffect(() => {
    const unsub = onSnapshot(doc(firestore, "app_settings", "plans"), (docSnap) => {
      if (!docSnap.exists()) {
        setPlans({ ...DEFAULT_PLANS });
        return;
      }
      const data = docSnap.data() as Record<string, Partial<Plan>>;
      const merged: Record<PlanId, Plan> = {} as Record<PlanId, Plan>;
      const ids: PlanId[] = ["basic", "advance", "pro", "pro-plus"];
      for (const id of ids) {
        const defaultPlan = DEFAULT_PLANS[id];
        const fromFs = data[id];
        if (!fromFs) {
          merged[id] = defaultPlan;
          continue;
        }
        merged[id] = {
          ...defaultPlan,
          ...fromFs,
          id: defaultPlan.id,
          entitlements: {
            ...defaultPlan.entitlements,
            ...(fromFs.entitlements || {}),
          },
          price: {
            ...defaultPlan.price,
            ...(fromFs.price || {}),
          },
        } as Plan;
      }
      setPlans(merged);
    });
    return () => unsub();
  }, []);

  return plans;
}

/** Get plan by id from live plans (use inside component that calls useLivePlans). */
export function getPlanFromPlans(plans: Record<PlanId, Plan>, planId?: PlanId | null): Plan {
  const id = planId || "basic";
  return plans[id] ?? DEFAULT_PLANS[id] ?? DEFAULT_PLANS.basic;
}

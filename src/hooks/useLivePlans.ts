"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { DEFAULT_PLANS, type Plan, type PlanId } from "@/config/plans";
import { mergeAppSettingsPlansDoc } from "@/lib/mergeAppSettingsPlans";
import {
  defaultPlansRecordFallback,
  readCachedPlansRecord,
  writeCachedPlansRecord,
} from "@/lib/plansCatalogCache";

/**
 * `app_settings/plans` realtime — offline / doc missing par bundled default nahi, pehle localStorage me last online snapshot.
 */
export function useLivePlans(): Record<PlanId, Plan> {
  const [plans, setPlans] = useState<Record<PlanId, Plan>>(() => readCachedPlansRecord() ?? defaultPlansRecordFallback());

  useEffect(() => {
    const unsub = onSnapshot(
      doc(firestore, "app_settings", "plans"),
      (docSnap) => {
        if (!docSnap.exists()) {
          const cached = readCachedPlansRecord();
          setPlans(cached ?? defaultPlansRecordFallback());
          // Purana online data overwrite mat karo — DEFAULT ko cache me mat likho.
          return;
        }
        const data = docSnap.data() as Record<string, unknown>;
        const list = mergeAppSettingsPlansDoc(data);
        const merged = {} as Record<PlanId, Plan>;
        for (const p of list) merged[p.id as PlanId] = p;
        setPlans(merged);
        writeCachedPlansRecord(merged);
      },
      () => {
        const cached = readCachedPlansRecord();
        if (cached) setPlans(cached);
      }
    );
    return () => unsub();
  }, []);

  return plans;
}

/** Get plan by id from live plans (use inside component that calls useLivePlans). */
export function getPlanFromPlans(plans: Record<PlanId, Plan>, planId?: PlanId | null): Plan {
  const id = planId || "basic";
  return plans[id] ?? DEFAULT_PLANS[id] ?? DEFAULT_PLANS.basic;
}

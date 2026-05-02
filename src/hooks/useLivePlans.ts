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
 * Static build (`NEXT_PUBLIC_STATIC_BUILD`): bundled `plans-seed-raw.json` jo build pe canonical site se fetch hua — koi tier key ho to state + cache update; khali `{}` aur purana cache ho to cache rakho.
 */
export function useLivePlans(): Record<PlanId, Plan> {
  const [plans, setPlans] = useState<Record<PlanId, Plan>>(() => readCachedPlansRecord() ?? defaultPlansRecordFallback());

  // STATIC_BUILD bundle: build script ne origin se plans JSON copy kiya — turant localStorage + state (Firestore niche sync)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_STATIC_BUILD !== "1") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/plans-seed-raw.json", { cache: "no-cache" });
        if (!res.ok || cancelled) return;
        const raw = (await res.json()) as Record<string, unknown>;
        if (!raw || typeof raw !== "object" || cancelled) return;
        const hasAnyTier = ["basic", "advance", "pro", "pro-plus"].some(
          (k) => raw[k] != null && typeof raw[k] === "object"
        );
        const existing = readCachedPlansRecord();
        if (!hasAnyTier) {
          if (!existing && !cancelled) {
            const list = mergeAppSettingsPlansDoc(raw);
            const merged = {} as Record<PlanId, Plan>;
            for (const p of list) merged[p.id as PlanId] = p;
            setPlans(merged);
            writeCachedPlansRecord(merged);
          }
          return;
        }
        const list = mergeAppSettingsPlansDoc(raw);
        const merged = {} as Record<PlanId, Plan>;
        for (const p of list) merged[p.id as PlanId] = p;
        if (cancelled) return;
        setPlans(merged);
        writeCachedPlansRecord(merged);
      } catch {
        /* missing file / parse — Firestore + defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

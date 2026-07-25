"use client";

/**
 * pocket-ledger.com band ho to billing page se local SQLite + plan cache par Pro Plus demo.
 * Server sync / Firestore overwrite is flag se rok sakte ho (`localDemoPlanUntilMs`).
 */
import type { PlanId } from "@/config/plans";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";
import { writeCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";

export const LOCAL_DEMO_PLAN_ID: PlanId = "pro-plus";
export const LOCAL_DEMO_PLAN_DAYS = 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function localDemoPlanExpiryMs(fromMs = Date.now()): number {
  return fromMs + LOCAL_DEMO_PLAN_DAYS * MS_PER_DAY;
}

export function isLocalDemoPlanActive(row: unknown): boolean {
  const until =
    row && typeof row === "object"
      ? (row as { localDemoPlanUntilMs?: unknown }).localDemoPlanUntilMs
      : undefined;
  return typeof until === "number" && Number.isFinite(until) && until > Date.now();
}

export async function applyLocalDemoProPlusPlan(
  firebaseUid: string,
  options?: { extraCompanyIds?: ReadonlyArray<string | null | undefined> }
): Promise<{ ok: true; updatedCount: number; expiryMs: number } | { ok: false; reason: string }> {
  const uid = String(firebaseUid || "").trim();
  if (!uid) return { ok: false, reason: "not_signed_in" };

  const expiryMs = localDemoPlanExpiryMs();
  const now = Date.now();
  const planPatch = {
    planId: LOCAL_DEMO_PLAN_ID,
    planExpiryMs: expiryMs,
    planUpgradedAtMs: now,
    offlineLicenseValidUntilMs: expiryMs,
    localDemoPlanUntilMs: expiryMs,
  };

  const cacheIds = new Set<string>();
  for (const raw of options?.extraCompanyIds ?? []) {
    const id = String(raw || "").trim();
    if (id) cacheIds.add(id);
  }

  let updatedCount = 0;
  const all = await listLocalCompanies();
  const owned = all.filter((c) => String(c.ownerId || "").trim() === uid);

  for (const row of owned) {
    await upsertLocalCompany({ ...row, ...planPatch });
    writeCompanyPlanLocalCache(row.id, { planId: LOCAL_DEMO_PLAN_ID, planExpiryMs: expiryMs });
    cacheIds.delete(row.id);
    updatedCount += 1;
  }

  for (const id of cacheIds) {
    const existing = await getLocalCompanyById(id);
    if (existing) {
      const ownerId = String(existing.ownerId || "").trim();
      if (ownerId && ownerId !== uid) continue;
      await upsertLocalCompany({ ...existing, ...planPatch });
      updatedCount += 1;
    }
    writeCompanyPlanLocalCache(id, { planId: LOCAL_DEMO_PLAN_ID, planExpiryMs: expiryMs });
    if (!existing) updatedCount += 1;
  }

  if (updatedCount === 0) return { ok: false, reason: "no_company" };

  bumpLocalCompanyRegistry();
  return { ok: true, updatedCount, expiryMs };
}

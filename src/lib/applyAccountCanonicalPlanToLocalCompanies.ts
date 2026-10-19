"use client";

import { listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";
import { writeCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";
import { plRegistryPullDebug } from "@/lib/registryPullDebug";

/**
 * Loop guard: same uid + same canonical plan signature recently applied → skip entirely
 * (users-doc snapshot har update par call karta hai; pehle har call = SQLite write + registry bump → reload loop).
 * Rows ka diff-check niche alag se hai, isliye window ke baad bhi no-op write/bump nahi hota.
 */
const SAME_SIGNATURE_SKIP_MS = 60_000;
const lastAppliedByUid = new Map<string, { sig: string; atMs: number }>();

function normStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normExpiry(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Project account subscription onto every owned local SQLite company row (online + offline). */
export async function applyAccountCanonicalPlanToAllLocalCompanies(
  firebaseUid: string,
  args: {
    planId: PlanId | string;
    planExpiryMs: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  }
): Promise<void> {
  const uid = String(firebaseUid || "").trim();
  if (!uid) return;
  const planId = normalizePlanIdForClient(args.planId);
  const planExpiryMs = normExpiry(args.planExpiryMs);
  const stripeCustomerId = normStr(args.stripeCustomerId);
  const stripeSubscriptionId = normStr(args.stripeSubscriptionId);

  const sig = JSON.stringify([planId, planExpiryMs, stripeCustomerId, stripeSubscriptionId]);
  const now = Date.now();
  const last = lastAppliedByUid.get(uid);
  if (last && last.sig === sig && now - last.atMs < SAME_SIGNATURE_SKIP_MS) {
    plRegistryPullDebug("accountCanonicalPlan", "skip: same signature recently applied", { sinceMs: now - last.atMs });
    return;
  }
  lastAppliedByUid.set(uid, { sig, atMs: now });

  const owned = (await listLocalCompanies()).filter((c) => String(c.ownerId || "").trim() === uid);
  if (owned.length === 0) return;

  let changedRows = 0;
  const changedSummary: string[] = [];
  for (const row of owned) {
    const r = row as Record<string, unknown>;
    const diffs: string[] = [];
    if (normalizePlanIdForClient(typeof r.planId === "string" ? r.planId : undefined) !== planId) diffs.push("planId");
    if (normExpiry(r.planExpiryMs) !== planExpiryMs) diffs.push("planExpiryMs");
    if (stripeCustomerId && normStr(r.stripeCustomerId) !== stripeCustomerId) diffs.push("stripeCustomerId");
    if (stripeSubscriptionId && normStr(r.stripeSubscriptionId) !== stripeSubscriptionId) diffs.push("stripeSubscriptionId");

    // Plan cache (localStorage) hamesha align - sasta, registry bump nahi karta.
    writeCompanyPlanLocalCache(row.id, { planId, planExpiryMs });

    if (diffs.length === 0) continue;
    const planPatch: Record<string, unknown> = {
      planId,
      planExpiryMs,
      planUpgradedAtMs: now,
    };
    if (stripeCustomerId) planPatch.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) planPatch.stripeSubscriptionId = stripeSubscriptionId;
    await upsertLocalCompany({
      ...row,
      ...planPatch,
    });
    changedRows += 1;
    if (changedSummary.length < 5) changedSummary.push(`${row.id}: ${diffs.join(",")}`);
  }
  if (changedRows > 0) {
    plRegistryPullDebug("accountCanonicalPlan", `applied: ${changedRows} row(s) changed - ${changedSummary.join(" | ")}`);
    bumpLocalCompanyRegistry();
  } else {
    plRegistryPullDebug("accountCanonicalPlan", "no-op: all owned rows already match (no write, no bump)");
  }
}

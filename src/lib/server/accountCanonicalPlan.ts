/**
 * Account-level plan mirror:
 * - **Companies → user:** `reconcileOwnerCompaniesPlanWithDriftHeal` — owned rows me max tier pick kar `users/{uid}` + mismatch companies patch.
 * - **User → companies:** `syncOwnedCompaniesFromUserDocCanonicalPlan` — console / manual `accountCanonical*` edit ke baad sab `companies` align (SuperAdmin API).
 */
import * as admin from "firebase-admin";
import { normalizePlanIdForClient, planTierIndex, type PlanId } from "@/config/plans";
import { applyOwnerPlanMirrorBatched } from "@/lib/server/mirrorOwnerCompanyPlanBilling";

export type AccountPlanCanon = {
  planId: PlanId;
  planExpiryMs: number | null;
  planUpgradedAtMs: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

function planExpiryMsFromData(d: Record<string, unknown>): number | null {
  if (typeof d.planExpiryMs === "number" && Number.isFinite(d.planExpiryMs)) return d.planExpiryMs;
  const pe = d.planExpiry as { toMillis?: () => number } | undefined;
  if (pe && typeof pe.toMillis === "function") return pe.toMillis();
  return null;
}

function planUpgradedMsFromData(d: Record<string, unknown>): number {
  const n = d.planUpgradedAtMs;
  if (typeof n === "number" && Number.isFinite(n)) return n;
  const ts = d.planUpgradedAt as { toMillis?: () => number } | undefined;
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}

/** Owned companies me se highest tier; tie par zyada `planUpgradedAtMs` — "last effective" subscription row. */
export function pickAccountPlanCanonFromCompanySnapshots(
  docs: { id: string; data: Record<string, unknown> }[]
): AccountPlanCanon | null {
  if (docs.length === 0) return null;
  let best: { data: Record<string, unknown>; tier: number; upMs: number } | null = null;
  for (const { data } of docs) {
    const pid = normalizePlanIdForClient(String(data.planId ?? ""));
    const tier = planTierIndex(pid);
    const upMs = planUpgradedMsFromData(data);
    if (!best || tier > best.tier || (tier === best.tier && upMs > best.upMs)) {
      best = { data, tier, upMs };
    }
  }
  if (!best) return null;
  const d = best.data;
  const planId = normalizePlanIdForClient(String(d.planId ?? ""));
  const planExpiryMs = planExpiryMsFromData(d);
  const planUpgradedAtMs = planUpgradedMsFromData(d) || Date.now();
  const stripeCustomerId =
    typeof d.stripeCustomerId === "string" && d.stripeCustomerId.trim() ? d.stripeCustomerId.trim() : null;
  const stripeSubscriptionId =
    typeof d.stripeSubscriptionId === "string" && d.stripeSubscriptionId.trim() ? d.stripeSubscriptionId.trim() : null;
  return { planId, planExpiryMs, planUpgradedAtMs, stripeCustomerId, stripeSubscriptionId };
}

function companyDiffersFromCanon(d: Record<string, unknown>, canon: AccountPlanCanon): boolean {
  const pid = normalizePlanIdForClient(String(d.planId ?? ""));
  if (pid !== canon.planId) return true;
  const exp = planExpiryMsFromData(d);
  const cexp = canon.planExpiryMs;
  if (exp !== cexp) return true;
  if (planUpgradedMsFromData(d) !== canon.planUpgradedAtMs) return true;
  return false;
}

/** Firestore `companies/*` patch — `canon` se align (Basic par expiry/stripe hatao). */
export function buildCompanyPatchFromAccountCanon(canon: AccountPlanCanon): Record<string, unknown> {
  const planUpgradedAt = admin.firestore.Timestamp.fromMillis(canon.planUpgradedAtMs);
  const patch: Record<string, unknown> = {
    planId: canon.planId,
    planUpgradedAt,
    planUpgradedAtMs: canon.planUpgradedAtMs,
  };
  if (canon.planId === "basic") {
    patch.planExpiry = admin.firestore.FieldValue.delete();
    patch.planExpiryMs = admin.firestore.FieldValue.delete();
    // Paid → Basic / auto-downgrade: Stripe IDs hatao taaki client cache purana subscription na chipkaye.
    patch.stripeCustomerId = admin.firestore.FieldValue.delete();
    patch.stripeSubscriptionId = admin.firestore.FieldValue.delete();
  } else {
    if (canon.planExpiryMs != null && Number.isFinite(canon.planExpiryMs)) {
      patch.planExpiry = admin.firestore.Timestamp.fromMillis(canon.planExpiryMs);
      patch.planExpiryMs = canon.planExpiryMs;
    }
    // Khalti/eSewa paid: canon par Stripe na ho to field mat chhedo — warna non-Stripe tenant ka customer ID delete ho jata.
    if (canon.stripeCustomerId) patch.stripeCustomerId = canon.stripeCustomerId;
    if (canon.stripeSubscriptionId) patch.stripeSubscriptionId = canon.stripeSubscriptionId;
  }
  return patch;
}

/** `users/{uid}` — billing / SuperAdmin ko ek hi account-tier dikhe; merge-only. */
export async function persistAccountCanonicalPlanDoc(
  db: admin.firestore.Firestore,
  ownerUid: string,
  canon: AccountPlanCanon
): Promise<void> {
  const oid = ownerUid.trim();
  if (!oid) return;
  await db
    .collection("users")
    .doc(oid)
    .set(
      {
        accountCanonicalPlanId: canon.planId,
        accountCanonicalPlanExpiryMs: canon.planExpiryMs,
        accountCanonicalPlanUpgradedAtMs: canon.planUpgradedAtMs,
        accountCanonicalStripeCustomerId: canon.stripeCustomerId,
        accountCanonicalStripeSubscriptionId: canon.stripeSubscriptionId,
        accountCanonicalPlanSyncedAtMs: Date.now(),
      },
      { merge: true }
    );
}

/**
 * Owner ki saari companies + user doc — drift heal (sync-plan / admin save ke baad call).
 * Returns patched company count (0 = already aligned).
 */
export async function reconcileOwnerCompaniesPlanWithDriftHeal(
  db: admin.firestore.Firestore,
  ownerUid: string
): Promise<{ companiesPatched: number }> {
  const oid = ownerUid.trim();
  if (!oid) return { companiesPatched: 0 };

  const snap = await db.collection("companies").where("ownerId", "==", oid).get();
  if (snap.empty) return { companiesPatched: 0 };

  const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  const canon = pickAccountPlanCanonFromCompanySnapshots(rows);
  if (!canon) return { companiesPatched: 0 };

  await persistAccountCanonicalPlanDoc(db, oid, canon);

  let companiesPatched = 0;
  await applyOwnerPlanMirrorBatched(db, oid, (docId) => {
    const row = rows.find((r) => r.id === docId);
    if (!row || !companyDiffersFromCanon(row.data, canon)) return {};
    companiesPatched++;
    return buildCompanyPatchFromAccountCanon(canon);
  });

  return { companiesPatched };
}

/**
 * `users/{uid}` ke `accountCanonicalPlanId` (+ expiry / Stripe / upgraded ms) se canon banata hai — field na ho to `null`.
 * Push-from-user tabhi chalao jab `accountCanonicalPlanId` Firestore me set ho.
 */
export function accountPlanCanonFromUserDocFields(u: Record<string, unknown>): AccountPlanCanon | null {
  const raw = u.accountCanonicalPlanId;
  if (raw == null || (typeof raw === "string" && !String(raw).trim())) return null;
  const planId = normalizePlanIdForClient(String(raw));
  let planExpiryMs: number | null = null;
  const e = u.accountCanonicalPlanExpiryMs;
  if (typeof e === "number" && Number.isFinite(e)) planExpiryMs = e;
  let planUpgradedAtMs = Date.now();
  const up = u.accountCanonicalPlanUpgradedAtMs;
  if (typeof up === "number" && Number.isFinite(up)) planUpgradedAtMs = up;
  const stripeCustomerId =
    typeof u.accountCanonicalStripeCustomerId === "string" && u.accountCanonicalStripeCustomerId.trim()
      ? u.accountCanonicalStripeCustomerId.trim()
      : null;
  const stripeSubscriptionId =
    typeof u.accountCanonicalStripeSubscriptionId === "string" && u.accountCanonicalStripeSubscriptionId.trim()
      ? u.accountCanonicalStripeSubscriptionId.trim()
      : null;
  return { planId, planExpiryMs, planUpgradedAtMs, stripeCustomerId, stripeSubscriptionId };
}

/**
 * User doc ko source maan kar owned `companies/*` par plan patch (Basic par expiry null allowed; paid par `accountCanonicalPlanExpiryMs` zaroor).
 * User doc pe pehle `accountCanonicalPlanId` set karo; phir yeh API / function — har company row manually na kholo.
 */
export async function syncOwnedCompaniesFromUserDocCanonicalPlan(
  db: admin.firestore.Firestore,
  ownerUid: string
): Promise<{ ok: true; companiesPatched: number } | { ok: false; reason: string }> {
  const oid = ownerUid.trim();
  if (!oid) return { ok: false, reason: "owner_empty" };

  const userSnap = await db.collection("users").doc(oid).get();
  if (!userSnap.exists) return { ok: false, reason: "user_not_found" };
  const u = userSnap.data() as Record<string, unknown>;
  const canon = accountPlanCanonFromUserDocFields(u);
  if (!canon) return { ok: false, reason: "missing_accountCanonicalPlanId" };

  if (canon.planId !== "basic" && canon.planExpiryMs == null) {
    return { ok: false, reason: "paid_plan_requires_accountCanonicalPlanExpiryMs" };
  }

  const snap = await db.collection("companies").where("ownerId", "==", oid).get();
  if (snap.empty) return { ok: true, companiesPatched: 0 };

  const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  let companiesPatched = 0;
  await applyOwnerPlanMirrorBatched(db, oid, (docId) => {
    const row = rows.find((r) => r.id === docId);
    if (!row || !companyDiffersFromCanon(row.data, canon)) return {};
    companiesPatched++;
    return buildCompanyPatchFromAccountCanon(canon);
  });

  await persistAccountCanonicalPlanDoc(db, oid, canon);
  return { ok: true, companiesPatched };
}

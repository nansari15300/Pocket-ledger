import "server-only";

import type admin from "firebase-admin";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";
import { getMergedPlan } from "@/lib/server/getEffectivePlanRegionalPrice";
import { pickAccountPlanCanonFromCompanySnapshots } from "@/lib/server/accountCanonicalPlan";
import { planAllowsFirebaseOnline } from "@/lib/planSyncEntitlements";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { ownerEmailQueryVariants, sharedCompanyQuerySpecs } from "@/lib/sharedWithEmailsQuery";

type CompanySnap = { id: string; data: Record<string, unknown> };

export type WebAppOnlineAccessReason =
  | "super_admin"
  | "account_online_plan"
  | "owned_online_plan"
  | "shared_online_company";

export type WebAppOnlineAccessResult = {
  allowed: boolean;
  reason?: WebAppOnlineAccessReason;
};

function planExpiryMsFromData(d: Record<string, unknown>): number | null {
  if (typeof d.planExpiryMs === "number" && Number.isFinite(d.planExpiryMs)) return d.planExpiryMs;
  const pe = d.planExpiry as { toMillis?: () => number } | undefined;
  if (pe && typeof pe.toMillis === "function") return pe.toMillis();
  return null;
}

function isActiveCompany(data: Record<string, unknown>): boolean {
  return data.isDeleted !== true && data.movedToAdminRecycleAt == null;
}

function isOnlineCompanyRow(data: Record<string, unknown>): boolean {
  return String(data.storageOption || "local").toLowerCase() !== "local";
}

function emailInSharedLists(data: Record<string, unknown>, emailLower: string): boolean {
  if (!emailLower) return false;
  const legacy = Array.isArray(data.sharedWithEmails) ? data.sharedWithEmails : [];
  if (legacy.some((x) => String(x || "").toLowerCase().trim() === emailLower)) return true;
  const lower = Array.isArray(data.sharedWithEmailsLower) ? data.sharedWithEmailsLower : [];
  if (lower.some((x) => String(x || "").toLowerCase().trim() === emailLower)) return true;
  return false;
}

function uidInSharedWith(data: Record<string, unknown>, uid: string): boolean {
  const list = Array.isArray(data.sharedWith) ? data.sharedWith : [];
  return list.some((row) => {
    if (!row || typeof row !== "object") return false;
    const id = String((row as { uid?: unknown }).uid || "").trim();
    return id && id === uid;
  });
}

async function paidOnlinePlanAllowed(planId: PlanId, expiryMs: number | null): Promise<boolean> {
  if (planId === "basic") return false;
  const plan = await getMergedPlan(planId);
  if (!planAllowsFirebaseOnline(planId, plan)) return false;
  if (expiryMs == null || !Number.isFinite(expiryMs) || expiryMs < Date.now()) return false;
  return true;
}

function mapCompanyDocs(snap: admin.firestore.QuerySnapshot): CompanySnap[] {
  return snap.docs.map((row) => ({ id: row.id, data: (row.data() ?? {}) as Record<string, unknown> }));
}

/**
 * Hosted browser `/app` access: online-plan entitlement or shared online company only.
 * APK/EXE/static shells skip this check in the client gate.
 */
export async function evaluateWebAppOnlineAccess(
  db: admin.firestore.Firestore,
  uid: string,
  email: string | null | undefined
): Promise<WebAppOnlineAccessResult> {
  const ownerUid = String(uid || "").trim();
  const authEmail = String(email || "").trim();
  const authEmailLower = authEmail.toLowerCase();

  if (authEmailLower && getSuperAdminEmails().some((e) => e.toLowerCase() === authEmailLower)) {
    return { allowed: true, reason: "super_admin" };
  }

  const userSnap = ownerUid ? await db.collection("users").doc(ownerUid).get() : null;
  const userData = (userSnap?.data() ?? {}) as Record<string, unknown>;
  if (String(userData.role || "") === "SuperAdmin") {
    return { allowed: true, reason: "super_admin" };
  }

  const accountPlanId = normalizePlanIdForClient(String(userData.accountCanonicalPlanId || ""));
  const accountExpiry =
    typeof userData.accountCanonicalPlanExpiryMs === "number"
      ? userData.accountCanonicalPlanExpiryMs
      : null;
  if (await paidOnlinePlanAllowed(accountPlanId, accountExpiry)) {
    return { allowed: true, reason: "account_online_plan" };
  }

  const ownedSnaps = await Promise.all([
    ownerUid
      ? db.collection("companies").where("ownerId", "==", ownerUid).get()
      : Promise.resolve(null),
    ...ownerEmailQueryVariants(authEmail).map((ownerEmail) =>
      db.collection("companies").where("ownerEmail", "==", ownerEmail).get()
    ),
  ]);

  const ownedById = new Map<string, CompanySnap>();
  for (const snap of ownedSnaps) {
    if (!snap) continue;
    for (const row of mapCompanyDocs(snap)) {
      if (!isActiveCompany(row.data)) continue;
      ownedById.set(row.id, row);
    }
  }

  const ownedCanon = pickAccountPlanCanonFromCompanySnapshots(
    [...ownedById.values()].map(({ id, data }) => ({ id, data }))
  );
  if (ownedCanon && (await paidOnlinePlanAllowed(ownedCanon.planId, ownedCanon.planExpiryMs))) {
    return { allowed: true, reason: "owned_online_plan" };
  }

  for (const row of ownedById.values()) {
    const planId = normalizePlanIdForClient(String(row.data.planId || ""));
    const expiryMs = planExpiryMsFromData(row.data);
    if (await paidOnlinePlanAllowed(planId, expiryMs)) {
      return { allowed: true, reason: "owned_online_plan" };
    }
  }

  const sharedSnaps = await Promise.all(
    sharedCompanyQuerySpecs(authEmail).map((spec) =>
      db.collection("companies").where(spec.field, "array-contains", spec.value).get()
    )
  );

  for (const snap of sharedSnaps) {
    for (const row of mapCompanyDocs(snap)) {
      if (!isActiveCompany(row.data)) continue;
      if (ownedById.has(row.id)) continue;
      if (!isOnlineCompanyRow(row.data)) continue;
      const sharedByEmail = emailInSharedLists(row.data, authEmailLower);
      const sharedByUid = ownerUid ? uidInSharedWith(row.data, ownerUid) : false;
      if (sharedByEmail || sharedByUid) {
        return { allowed: true, reason: "shared_online_company" };
      }
    }
  }

  return { allowed: false };
}

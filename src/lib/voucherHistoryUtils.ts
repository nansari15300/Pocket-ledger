/**
 * Shared helper to get effective voucher history settings (company + plan).
 * Used by both client (voucherActionsClient) and server (voucher-actions, actions).
 */
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getPlan, type PlanId } from "@/config/plans";

export type VoucherHistoryFullBehavior = 'block_edit' | 'allow_edit_delete_last';

export async function getEffectiveHistorySettings(companyId: string): Promise<{ enabled: boolean; limit: number; fullBehavior: VoucherHistoryFullBehavior }> {
  const companySnap = await getDoc(doc(firestore, "companies", companyId));
  const companyData = companySnap.data() || {};
  const planId = (companyData?.planId as PlanId) || "basic";
  const defaultPlan = getPlan(planId);
  const plansSnap = await getDoc(doc(firestore, "app_settings", "plans"));
  const plansData = plansSnap.exists() ? plansSnap.data() : {};
  const fromFs = (plansData as any)?.[planId];
  const plan = fromFs
    ? { ...defaultPlan, ...fromFs, entitlements: { ...defaultPlan.entitlements, ...(fromFs.entitlements || {}) } }
    : defaultPlan;
  const planEnabled = plan.entitlements.voucherHistoryEnabled === true;
  const planLimitRaw = Number(plan.entitlements.voucherHistoryLimit) || 0;
  const planLimit = planLimitRaw > 0 ? Math.min(100, planLimitRaw) : 10;
  const companyEnabled = (companyData as any).voucherHistoryEnabled !== false;
  const companyLimit = Math.max(1, Math.min(100, Number((companyData as any).voucherHistoryLimit) || 10));
  const enabled = planEnabled && companyEnabled;
  const limit = enabled ? Math.min(companyLimit, planLimit) : 0;
  const fullBehavior = ((companyData as any).voucherHistoryFullBehavior as VoucherHistoryFullBehavior) || 'allow_edit_delete_last';
  return { enabled, limit, fullBehavior };
}

/** Returns the plan's max voucher history limit for a company. Used to cap company settings. */
export async function getPlanVoucherHistoryLimit(companyId: string): Promise<number> {
  const companySnap = await getDoc(doc(firestore, "companies", companyId));
  const companyData = companySnap.data() || {};
  const planId = (companyData?.planId as PlanId) || "basic";
  const defaultPlan = getPlan(planId);
  const plansSnap = await getDoc(doc(firestore, "app_settings", "plans"));
  const plansData = plansSnap.exists() ? plansSnap.data() : {};
  const fromFs = (plansData as any)?.[planId];
  const plan = fromFs
    ? { ...defaultPlan, ...fromFs, entitlements: { ...defaultPlan.entitlements, ...(fromFs.entitlements || {}) } }
    : defaultPlan;
  const raw = Number(plan.entitlements.voucherHistoryLimit) || 0;
  return raw > 0 ? Math.min(100, raw) : 10;
}

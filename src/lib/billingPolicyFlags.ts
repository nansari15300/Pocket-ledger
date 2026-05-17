/**
 * `app_settings/billing` — Super Admin downgrade policy (client + server parse).
 * Per-gateway plan-page toggles: `app_settings/payment_gateways` (`gateway-keys.ts`).
 */

export type BillingPolicyFlags = {
  /** false: paid → cheaper paid downgrade band */
  planDowngradeEnabled: boolean;
};

export const DEFAULT_BILLING_POLICY_FLAGS: BillingPolicyFlags = {
  planDowngradeEnabled: true,
};

export function parseBillingPolicyDoc(
  raw: Record<string, unknown> | null | undefined
): BillingPolicyFlags {
  if (!raw) return { ...DEFAULT_BILLING_POLICY_FLAGS };
  return {
    planDowngradeEnabled:
      typeof raw.planDowngradeEnabled === "boolean" ? raw.planDowngradeEnabled : true,
  };
}

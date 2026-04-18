/** Stripe checkout → offline/local company plan patch (shared: API JSON + client apply). */
export type VerifiedLocalPlanApplyPayload = {
  companyId: string;
  /** Firestore `companies/{id}` jahan plan authoritative hai — local SQLite id alag ho to sync-plan isi se */
  authoritativeCompanyId?: string;
  planId: string;
  userId: string;
  planExpiryMs: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  lastStripeCheckoutSessionId: string;
  source: "subscription" | "plan_change";
};

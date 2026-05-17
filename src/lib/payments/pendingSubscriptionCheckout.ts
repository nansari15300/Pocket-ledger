/** Server-side pending rows for Khalti/eSewa **new subscribe** (not plan-change). */
export const PENDING_SUBSCRIPTION_CHECKOUTS_COLLECTION = "pending_subscription_checkouts";

/** Reject stale checkouts (no Cloud Function TTL). */
export const PENDING_SUBSCRIPTION_CHECKOUT_TTL_MS = 2 * 60 * 60 * 1000;

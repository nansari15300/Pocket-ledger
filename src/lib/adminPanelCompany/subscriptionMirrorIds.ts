export function legacySubscriptionMirrorVoucherId(paymentId: string): string {
  return `mirror-${paymentId}`.replace(/[^\w-]/g, "_").slice(0, 120);
}

export function subscriptionSaleMirrorVoucherId(paymentId: string): string {
  return legacySubscriptionMirrorVoucherId(paymentId);
}

export function subscriptionReceiptMirrorVoucherId(paymentId: string): string {
  return `mirror-rcpt-${paymentId}`.replace(/[^\w-]/g, "_").slice(0, 120);
}

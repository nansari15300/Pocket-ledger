import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";
import {
  fulfillStripeCheckoutSessionCompleted,
  getStripeForPayments,
} from "@/lib/payments/stripeCheckoutFulfill";

/** invoice.paid renewal — same period-end read as fulfillment helper (not exported from fulfill module). */
function subscriptionPeriodEndMs(sub: unknown): number | null {
  const end = (sub as { current_period_end?: number })?.current_period_end;
  return typeof end === "number" ? end * 1000 : null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET" },
      { status: 400 }
    );
  }

  const stripe = getStripeForPayments();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await fulfillStripeCheckoutSessionCompleted(stripe, session, db);
      if (result.ok === false && result.reason === "missing_companyId") {
        console.warn("[stripe webhook] checkout.session.completed — missing companyId", session.id);
      }
      return NextResponse.json({ received: true });
    }

    // Subscription renewal: extend planExpiry (metadata from subscription_data.metadata on Checkout).
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason === "subscription_create") {
        return NextResponse.json({ received: true });
      }
      const subRef = (invoice as { subscription?: string | { id?: string } | null }).subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (!subId) return NextResponse.json({ received: true });

      const sub = await stripe.subscriptions.retrieve(subId);
      const meta = (sub as { metadata?: Record<string, string> }).metadata || {};
      const companyId = meta.companyId?.trim();
      if (!companyId) return NextResponse.json({ received: true });

      const endMs = subscriptionPeriodEndMs(sub);
      if (endMs == null) return NextResponse.json({ received: true });
      const planExpiry = admin.firestore.Timestamp.fromMillis(endMs);
      await db.collection("companies").doc(companyId).update({
        planExpiry,
        stripeSubscriptionId: subId,
        lastSubscriptionRenewalAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    console.error("[stripe webhook] handler error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
  }
}

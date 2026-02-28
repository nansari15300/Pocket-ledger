
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { doc, setDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

// Lazy initialization to avoid build-time errors when env vars are not available
function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover" as any,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;
  
  const stripe = getStripe();
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (metadata?.companyId) {
        try {
            await addDoc(collection(firestore, `companies/${metadata.companyId}/payments`), {
                paymentId: session.id,
                userId: metadata?.userId,
                planId: metadata?.planId,
                amount: session.amount_total ? session.amount_total / 100 : 0,
                currency: session.currency,
                gateway: "stripe",
                status: session.payment_status,
                createdAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error saving Stripe payment to Firestore:", error);
        }
    }
  }
  
  return NextResponse.json({ received: true });
}

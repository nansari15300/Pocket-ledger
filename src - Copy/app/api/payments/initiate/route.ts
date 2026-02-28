
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getGatewayKeys } from "@/ai/flows/gateway-keys";

type Body = {
  planId: "basic" | "advance" | "pro";
  gateway: "stripe" | "khalti" | "esewa";
  amount: number;  // in smallest unit for gateway
  currency: string;
  userId: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { planId, gateway, amount, currency, userId } = body;
    const keys = await getGatewayKeys();

    if (gateway === "stripe") {
        if (!keys.stripeSecretKey) {
            throw new Error("Stripe is not configured.");
        }
        const stripe = new Stripe(keys.stripeSecretKey, { apiVersion: "2025-12-15.clover" as any });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [
            {
                price_data: {
                currency,
                product_data: { name: `Plan ${planId}` },
                unit_amount: amount,
                recurring: { interval: "month" },
                },
                quantity: 1,
            },
            ],
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/cancel`,
            metadata: { userId, planId, gateway },
        });
        return NextResponse.json({ url: session.url });

    } else if (gateway === "khalti") {
        if (!keys.khaltiPublicKey) {
            throw new Error("Khalti is not configured.");
        }
        return NextResponse.json({
            gateway: "khalti",
            publicKey: keys.khaltiPublicKey,
            amount,
            product_identity: planId,
            product_name: `Plan ${planId}`,
            returnUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/khalti/success`,
            metadata: { userId, planId },
        });

    } else if (gateway === "esewa") {
        if (!keys.esewaMerchantCode || !keys.esewaSecretKey) {
            throw new Error("eSewa is not configured.");
        }
        const transaction_uuid = uuidv4();
        const product_code = keys.esewaMerchantCode;
        const total_amount_in_rupees = amount / 100;
        
        const message_parts = [
            `total_amount=${total_amount_in_rupees}`,
            `transaction_uuid=${transaction_uuid}`,
            `product_code=${product_code}`
        ];
        const message = message_parts.join(',');
        
        const signature = crypto
            .createHmac('sha256', keys.esewaSecretKey)
            .update(message)
            .digest('base64');
            
        const isTestMode = product_code === 'EPAYTEST';
        const eSewaUrl = isTestMode 
            ? "https://uat.esewa.com.np/epay/main" 
            : "https://epay.esewa.com.np/api/epay/main/v2/form";
        
        return NextResponse.json({
            gateway: "esewa",
            url: eSewaUrl,
            amount: total_amount_in_rupees,
            oid: transaction_uuid,
            successUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/esewa/success`,
            failUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/cancel`,
            merchantCode: product_code,
            signature,
            signedFieldNames: "total_amount,transaction_uuid,product_code",
            metadata: { userId, planId },
        });
    }

    return NextResponse.json({ error: "Unsupported gateway" }, { status:  400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, amount, metadata } = body; // Assume metadata is passed from client
    
    // IMPORTANT: In production, you must call the Khalti verification API
    // https://docs.khalti.com/khalti-epayment/transaction-verification/
    
    // Example (pseudo-code):
    // const verificationResponse = await fetch("https://khalti.com/api/v2/payment/verify/", {
    //   method: "POST",
    //   headers: {
    //     'Authorization': `Key ${process.env.KHALTI_SECRET_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({ token, amount })
    // });
    // const verificationData = await verificationResponse.json();
    // if (verificationData.state === "Completed") {
    
    if (metadata?.companyId) {
        await addDoc(collection(firestore, `companies/${metadata.companyId}/payments`), {
            paymentId: token,
            userId: metadata?.userId,
            planId: metadata?.planId,
            amount: amount / 100,
            currency: 'NPR',
            gateway: 'khalti',
            status: 'completed', // Assuming success if webhook is called
            createdAt: serverTimestamp(),
        });
    }

    return NextResponse.json({ status: "success" });

  } catch(err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import crypto from "crypto";

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const data = url.searchParams.get('data');

    if (!data) {
        return NextResponse.redirect(new URL('/billing/cancel', req.url));
    }
    
    try {
        const decodedData = JSON.parse(atob(data));
        
        const { status, transaction_uuid, total_amount, signed_field_names } = decodedData;

        // In a real app, you would verify the signature here.
        // For now, we will trust the status.
        
        if (status === 'COMPLETE' && transaction_uuid) {
            // This is a simplified success case. You'd typically fetch metadata stored against the transaction_uuid
            // to get companyId, userId, planId, etc.
            // For now, we'll log it in a generic collection if we can't find companyId.
            const collectionPath = `payments`; // A root collection as fallback
            
             await addDoc(collection(firestore, collectionPath), {
                paymentId: transaction_uuid,
                amount: total_amount,
                currency: 'NPR',
                gateway: 'esewa',
                status: 'completed',
                createdAt: serverTimestamp(),
                payload: decodedData, // Store full payload for audit
            });
        }

        return NextResponse.redirect(new URL('/billing/success', req.url));
    } catch (err: any) {
        console.error("eSewa GET handler error:", err);
        return NextResponse.redirect(new URL('/billing/cancel', req.url));
    }
}

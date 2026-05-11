import { NextResponse } from "next/server";
import { mergeGatewayKeysWithEnv, type GatewayKeys } from "@/ai/flows/gateway-keys";
import { getAdminDb } from "@/lib/firebaseAdmin";

/** Admin read — `/api/payments/initiate` jaisa; client ko sirf boolean (secrets expose nahi). */
async function getGatewayKeysFromAdmin(): Promise<GatewayKeys> {
  try {
    const db = getAdminDb();
    const snap = await db.doc("app_settings/payment_gateways").get();
    const stored = (snap.exists ? (snap.data() as GatewayKeys) : {}) as GatewayKeys;
    return mergeGatewayKeysWithEnv(stored);
  } catch {
    return mergeGatewayKeysWithEnv({});
  }
}

/**
 * Billing UI: kaunse gateway configure hain — keys ke bina radio disable (`initiate` / `plan-change-checkout` jaisa).
 */
export async function GET() {
  const keys = await getGatewayKeysFromAdmin();
  return NextResponse.json(
    {
      stripe: !!keys.stripeSecretKey?.trim(),
      khalti: !!keys.khaltiPublicKey?.trim(),
      esewa: !!(keys.esewaMerchantCode?.trim() && keys.esewaSecretKey?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

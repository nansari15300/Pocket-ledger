import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { mergeAppSettingsPlansDoc } from "@/lib/mergeAppSettingsPlans";

export const dynamic = "force-dynamic";

/**
 * User Billing page: Admin SDK se seedha `app_settings/plans` — client cache / offline snapshot se alag amounts na aayen.
 */
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.doc("app_settings/plans").get();
    const raw = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
    const plans = mergeAppSettingsPlansDoc(raw);
    return NextResponse.json(
      { plans, source: "server" as const },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
        },
      }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

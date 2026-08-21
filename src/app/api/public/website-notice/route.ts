import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  publicWebsiteNoticePayload,
  WEBSITE_NOTICE_DOC,
} from "@/lib/websiteNotice";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.doc(WEBSITE_NOTICE_DOC).get();
    const payload = publicWebsiteNoticePayload(snap.exists ? snap.data() : undefined);
    return NextResponse.json(
      { ...payload, source: "server" as const },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

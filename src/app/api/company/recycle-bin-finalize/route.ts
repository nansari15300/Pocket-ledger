import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { ownerFinalizeCompanyRecycleBinOnServer } from "@/lib/server/ownerRecycleBinCompanyServer";

type Body = { companyId?: string };

export async function POST(req: NextRequest) {
    try {
        if (!isFirebaseAdminConfigured()) {
            return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });
        }

        const authHeader = req.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!token) {
            return NextResponse.json({ error: "missing_token" }, { status: 401 });
        }

        getAdminDb();
        let decoded: admin.auth.DecodedIdToken;
        try {
            decoded = await admin.auth().verifyIdToken(token);
        } catch {
            return NextResponse.json({ error: "invalid_token" }, { status: 401 });
        }

        const body = (await req.json().catch(() => ({}))) as Body;
        const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
        if (!companyId) {
            return NextResponse.json({ error: "companyId_required" }, { status: 400 });
        }

        const result = await ownerFinalizeCompanyRecycleBinOnServer({
            companyId,
            uid: decoded.uid,
            email: decoded.email ?? undefined,
        });

        if (result.ok === false) {
            const status = result.error === "forbidden" ? 403 : 400;
            return NextResponse.json({ error: result.error }, { status });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : "finalize_failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

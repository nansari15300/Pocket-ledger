import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isSuperAdminServer } from "@/lib/server/isSuperAdminServer";

/**
 * No collectionGroup + orderBy (avoids FAILED_PRECONDITION when composite index missing).
 * Reads each company's `payments` subcollection with a cap, optional root `payments`, then sorts in memory.
 */
async function listPaymentsMerged(db: admin.firestore.Firestore): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const companiesSnap = await db.collection("companies").get();
  const allDocs: admin.firestore.QueryDocumentSnapshot[] = [];

  for (const companyDoc of companiesSnap.docs) {
    try {
      const paySnap = await companyDoc.ref.collection("payments").limit(300).get();
      allDocs.push(...paySnap.docs);
    } catch (e) {
      console.warn("[subscription-payments] skip company", companyDoc.id, e);
    }
  }

  try {
    const rootSnap = await db.collection("payments").limit(150).get();
    allDocs.push(...rootSnap.docs);
  } catch (e) {
    console.warn("[subscription-payments] root payments", e);
  }

  allDocs.sort((a, b) => {
    const ta =
      (a.data().createdAt as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;
    const tb =
      (b.data().createdAt as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;
    return tb - ta;
  });

  return allDocs.slice(0, 500);
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    getAdminDb();
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const email = decoded.email ?? undefined;
    const ok = await isSuperAdminServer(decoded.uid, email);
    if (!ok) {
      return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
    }

    const db = getAdminDb();
    const merged = await listPaymentsMerged(db);

    const payments = merged.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const grand = docSnap.ref.parent.parent;
      const companyId =
        grand != null ? grand.id : String((data.companyId as string | undefined) ?? "");
      const createdAt = data.createdAt as admin.firestore.Timestamp | undefined;
      const rawExpiry = data.planExpiryMs ?? data.planExpiry;
      let planExpiryMs: number | null = null;
      if (typeof rawExpiry === "number" && !Number.isNaN(rawExpiry)) {
        planExpiryMs = rawExpiry;
      } else if (rawExpiry && typeof (rawExpiry as admin.firestore.Timestamp).toMillis === "function") {
        planExpiryMs = (rawExpiry as admin.firestore.Timestamp).toMillis();
      }
      const hist = data.planChangeHistory;
      const planChangeHistory =
        hist != null && typeof hist === "object"
          ? (hist as Record<string, unknown>)
          : null;

      return {
        id: docSnap.id,
        companyId,
        userId: String(data.userId ?? ""),
        planId: String(data.planId ?? ""),
        amount: typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0),
        currency: String(data.currency ?? ""),
        gateway: String(data.gateway ?? ""),
        status: String(data.status ?? ""),
        paymentId: String(data.paymentId ?? docSnap.id),
        createdAtMs: createdAt?.toMillis() ?? null,
        planExpiryMs,
        planChangeFrom: data.planChangeFrom != null ? String(data.planChangeFrom) : null,
        planChangeTo: data.planChangeTo != null ? String(data.planChangeTo) : null,
        planChangeHistory,
      };
    });

    return NextResponse.json({ payments });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[subscription-payments]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

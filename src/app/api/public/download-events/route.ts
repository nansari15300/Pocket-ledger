import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import {
  DOWNLOAD_EVENTS_COLLECTION,
  DOWNLOAD_STATS_DOC,
  countryFromRequestHeaders,
  isWebsiteDownloadPlatform,
  normalizeCountryCode,
} from "@/lib/websiteDownloadStats";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const forwarded = String(req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return (
    forwarded ||
    String(req.headers.get("x-real-ip") || "").trim() ||
    "unknown"
  );
}

async function verifyDownloadUser(req: NextRequest): Promise<
  | { ok: true; uid: string; email: string }
  | { ok: false; error: NextResponse }
> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Sign in required to download" }, { status: 401 }),
    };
  }
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Auth not configured" }, { status: 503 }),
    };
  }
  getAdminDb();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = String(decoded.email || "").trim().toLowerCase();
    if (!email) {
      return {
        ok: false,
        error: NextResponse.json({ error: "Google account email required" }, { status: 401 }),
      };
    }
    return { ok: true, uid: decoded.uid, email };
  } catch {
    return {
      ok: false,
      error: NextResponse.json({ error: "Invalid or expired sign-in" }, { status: 401 }),
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const userGate = await verifyDownloadUser(req);
    if (userGate.ok === false) {
      return userGate.error;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isWebsiteDownloadPlatform(body.platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }
    const platform = body.platform;
    const version = String(body.version || "").trim().slice(0, 40);
    const fileName = String(body.fileName || body.file || "").trim().slice(0, 120);
    const source = String(body.source || "").trim().slice(0, 40);
    const country = normalizeCountryCode(body.country || countryFromRequestHeaders(req.headers));
    const now = Date.now();
    const ip = clientIp(req);
    const ua = String(req.headers.get("user-agent") || "").slice(0, 240);

    const db = getAdminDb();
    const eventRef = db.collection(DOWNLOAD_EVENTS_COLLECTION).doc();
    const statsRef = db.doc(DOWNLOAD_STATS_DOC);

    await db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const prev = statsSnap.exists ? (statsSnap.data() as Record<string, unknown>) : {};
      const byPlatform =
        prev.byPlatform && typeof prev.byPlatform === "object"
          ? { ...(prev.byPlatform as Record<string, number>) }
          : { windows: 0, android: 0, play: 0 };
      const byCountry =
        prev.byCountry && typeof prev.byCountry === "object"
          ? { ...(prev.byCountry as Record<string, number>) }
          : {};
      byPlatform[platform] = Math.max(0, Math.floor(Number(byPlatform[platform]) || 0)) + 1;
      byCountry[country] = Math.max(0, Math.floor(Number(byCountry[country]) || 0)) + 1;
      tx.set(
        statsRef,
        {
          total: Math.max(0, Math.floor(Number(prev.total) || 0)) + 1,
          byPlatform,
          byCountry,
          updatedAtMs: now,
        },
        { merge: true }
      );
      tx.set(eventRef, {
        platform,
        country,
        version: version || null,
        fileName: fileName || null,
        source: source || null,
        userId: userGate.uid,
        userEmail: userGate.email,
        ip,
        userAgent: ua,
        createdAtMs: now,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, country, id: eventRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
